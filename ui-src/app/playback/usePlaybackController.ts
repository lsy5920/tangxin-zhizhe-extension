import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { MediaKernel, type MediaKernelEvent, type MediaQuality, type MediaSnapshot } from "./mediaKernel";
import { loadPlaybackPreferences, savePlaybackPreferences, type PlaybackPreferences } from "./preferences";
import { loadPlaybackResume, savePlaybackResume } from "./resumeStore";
import {
  beginScrubTransaction,
  settleScrubTransaction,
  updateScrubTransaction,
  type ScrubTransaction
} from "./scrubTransaction";
import { createPlaybackRuntimeState, playbackSessionReducer } from "./sessionReducer";
import { nextFailoverSource, selectRecommendedSource, shouldFailover } from "./sourcePolicy";
import type { PlaybackRuntimeAction, PlaybackSession, PlaybackSource } from "./types";

const emptyMediaSnapshot: MediaSnapshot = {
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
  paused: true,
  volume: 0.8,
  muted: false,
  rate: 1
};

function mediaFingerprint(session: PlaybackSession | null) {
  if (!session) return "";
  return JSON.stringify({
    movieId: session.movieId,
    recommended: session.decision.recommendedSourceId,
    sources: session.sources.map((source) => [source.id, source.url, source.protocol])
  });
}

type WakeLockSentinelLike = { release?: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request?: (type: "screen") => Promise<WakeLockSentinelLike> };
};

type PlaybackActionWithoutGeneration = PlaybackRuntimeAction extends infer Action
  ? Action extends { generation: number }
    ? Omit<Action, "generation">
    : never
  : never;

function generationAction(generation: number, action: PlaybackActionWithoutGeneration): PlaybackRuntimeAction {
  return { ...action, generation } as PlaybackRuntimeAction;
}

export function usePlaybackController(session: PlaybackSession | null) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const kernelRef = useRef<MediaKernel | null>(null);
  const generationRef = useRef(0);
  const runtimeRef = useRef(createPlaybackRuntimeState());
  const sessionRef = useRef<PlaybackSession | null>(session);
  const startupTimerRef = useRef<number>();
  const stableTimerRef = useRef<number>();
  const recoveryTimerRef = useRef<number>();
  const lastResumeWriteRef = useRef(0);
  const resumeAfterLoadRef = useRef(false);
  const pendingSnapshotRef = useRef<Partial<MediaSnapshot>>({});
  const scrubTransactionRef = useRef<ScrubTransaction | null>(null);
  const scrubTransactionIdRef = useRef(0);
  const suppressScrubPauseRef = useRef(false);
  const switchSourceRef = useRef<(reason: string, automatic?: boolean, sourceId?: string) => Promise<void>>(async () => {});
  const [runtime, rawDispatch] = useReducer(playbackSessionReducer, undefined, () => createPlaybackRuntimeState());
  const [stats, setStats] = useState<MediaSnapshot>(emptyMediaSnapshot);
  const [qualities, setQualities] = useState<MediaQuality[]>([{ level: -1, label: "自动" }]);
  const [qualityLevel, setQualityLevel] = useState(-1);
  const [preferences, setPreferences] = useState<PlaybackPreferences>(loadPlaybackPreferences);
  const [status, setStatus] = useState("等待检票");
  const [resumeTip, setResumeTip] = useState("");

  const dispatch = useCallback((action: PlaybackRuntimeAction) => {
    runtimeRef.current = playbackSessionReducer(runtimeRef.current, action);
    rawDispatch(action);
  }, []);

  const clearTimers = useCallback(() => {
    if (startupTimerRef.current) window.clearTimeout(startupTimerRef.current);
    if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current);
    if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
    startupTimerRef.current = undefined;
    stableTimerRef.current = undefined;
    recoveryTimerRef.current = undefined;
  }, []);

  const persistResume = useCallback((snapshot = kernelRef.current?.snapshot()) => {
    const currentSession = sessionRef.current;
    if (!currentSession || !snapshot) return;
    savePlaybackResume(window.localStorage, currentSession.movieId, snapshot.currentTime, snapshot.duration);
    lastResumeWriteRef.current = Date.now();
  }, []);

  const beginStartupGuard = useCallback((generation: number) => {
    if (startupTimerRef.current) window.clearTimeout(startupTimerRef.current);
    const startedAt = Date.now();
    startupTimerRef.current = window.setTimeout(() => {
      if (generation !== generationRef.current || runtimeRef.current.phase === "playing") return;
      if (shouldFailover({ startupElapsedMs: Date.now() - startedAt, fatalErrorTimes: runtimeRef.current.fatalErrorTimes })) {
        void switchSourceRef.current("起播超过 8 秒", true);
      }
    }, 8_050);
  }, []);

  const handleKernelEvent = useCallback((event: MediaKernelEvent, generation: number) => {
    if (generation !== generationRef.current) return;
    if (event.type === "ready") {
      const snapshot = pendingSnapshotRef.current;
      if (Number(snapshot.currentTime) > 0) kernelRef.current?.seek(Number(snapshot.currentTime));
      dispatch(generationAction(generation, { type: "PAUSED" }));
      setStatus(resumeAfterLoadRef.current ? "线路已切换，正在续播" : "检票完成，点击开映");
      if (resumeAfterLoadRef.current) {
        beginStartupGuard(generation);
        void kernelRef.current?.play().catch((error) => {
          dispatch(generationAction(generation, { type: "FAILED", message: error?.message || String(error) }));
        });
      }
      return;
    }
    if (event.type === "playing") {
      if (scrubTransactionRef.current?.generation === generation) return;
      suppressScrubPauseRef.current = false;
      if (startupTimerRef.current) window.clearTimeout(startupTimerRef.current);
      dispatch(generationAction(generation, { type: "PLAYING" }));
      setStatus("放映中");
      if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current);
      stableTimerRef.current = window.setTimeout(() => {
        if (generation !== generationRef.current || runtimeRef.current.phase !== "playing") return;
        dispatch(generationAction(generation, { type: "STABLE" }));
        setStatus("线路稳定");
      }, 10_000);
      return;
    }
    if (event.type === "pause") {
      const scrubTransaction = scrubTransactionRef.current;
      if (scrubTransaction?.generation === generation) {
        const snapshot = kernelRef.current?.snapshot() || emptyMediaSnapshot;
        // 内核为预览事务临时暂停，但 UI 和业务仍保持手势开始前的播放语义。
        setStats({ ...snapshot, currentTime: scrubTransaction.originTime, paused: !scrubTransaction.wasPlaying });
        return;
      }
      if (suppressScrubPauseRef.current) {
        suppressScrubPauseRef.current = false;
        return;
      }
      dispatch(generationAction(generation, { type: "PAUSED" }));
      setStatus("已暂停");
      persistResume();
      return;
    }
    if (event.type === "waiting") {
      if (scrubTransactionRef.current?.generation === generation) return;
      dispatch(generationAction(generation, { type: "BUFFERING" }));
      setStatus("糖果云缓冲中");
      return;
    }
    if (event.type === "time") {
      const scrubTransaction = scrubTransactionRef.current;
      if (scrubTransaction?.generation === generation) {
        // 预览值由控制层单独显示，真实续播点在松手提交前始终固定于 originTime。
        setStats({ ...event.snapshot, currentTime: scrubTransaction.originTime, paused: !scrubTransaction.wasPlaying });
        return;
      }
      setStats(event.snapshot);
      if (Date.now() - lastResumeWriteRef.current >= 5_000) persistResume(event.snapshot);
      return;
    }
    if (event.type === "qualities") {
      setQualities(event.qualities);
      setQualityLevel(event.level);
      return;
    }
    if (event.type === "quality") {
      setQualityLevel(event.level);
      return;
    }
    if (event.type === "adaptive") {
      setStatus(event.message);
      return;
    }
    if (event.type === "ended") {
      dispatch(generationAction(generation, { type: "ENDED" }));
      setStatus("本场放映结束");
      persistResume();
      return;
    }
    if (event.type === "fatal") {
      dispatch(generationAction(generation, { type: "FATAL_ERROR", at: Date.now(), message: event.message }));
      const nextRuntime = runtimeRef.current;
      if (shouldFailover({ fatalErrorTimes: nextRuntime.fatalErrorTimes })) {
        void switchSourceRef.current("30 秒内累计 3 次致命错误", true);
        return;
      }
      if (event.kind === "network" && !nextRuntime.networkRecoveryUsed) {
        dispatch(generationAction(generation, { type: "RECOVERY_USED", kind: "network" }));
        setStatus("网络抖动，尝试恢复一次");
        kernelRef.current?.recoverNetwork();
      } else if (event.kind === "media" && !nextRuntime.mediaRecoveryUsed) {
        dispatch(generationAction(generation, { type: "RECOVERY_USED", kind: "media" }));
        setStatus("解码抖动，尝试恢复一次");
        kernelRef.current?.recoverMedia();
      } else {
        void switchSourceRef.current("当前线路恢复失败", true);
        return;
      }
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = window.setTimeout(() => {
        if (generation !== generationRef.current || runtimeRef.current.phase === "playing") return;
        void switchSourceRef.current("恢复等待超时", true);
      }, 4_000);
      return;
    }
  }, [beginStartupGuard, dispatch, persistResume]);

  const loadSource = useCallback(async (
    source: PlaybackSource,
    snapshot: Partial<MediaSnapshot>,
    switching: boolean,
    reason = ""
  ) => {
    const generation = generationRef.current;
    const container = containerRef.current;
    if (!container) return;
    dispatch(generationAction(generation, {
      type: "SOURCE_LOADING",
      sourceId: source.id,
      switching,
      reason
    }));
    pendingSnapshotRef.current = snapshot;
    resumeAfterLoadRef.current = switching && snapshot.paused === false;
    setStatus(switching ? `换幕中 · ${source.label}` : `正在装载 · ${source.label}`);
    const kernel = kernelRef.current || new MediaKernel({
      container,
      // 捕获创建内核时的会话代次，避免旧媒体事件借用新的 generation 穿透隔离。
      onEvent: (event) => handleKernelEvent(event, generation)
    });
    kernelRef.current = kernel;
    try {
      await kernel.load(source, snapshot, preferences.fillMode, preferences.networkMode);
    } catch (error) {
      if (generation !== generationRef.current || kernelRef.current !== kernel) return;
      const message = error instanceof Error ? error.message : String(error);
      // 装载错误只沿一条串行业务路径切线。旧实现同时从内核事件和 Promise catch
      // 发起切换，会让旧线路的 FAILED 覆盖已经开始装载的备用线路。
      setStatus("当前线路装载失败，正在尝试备用线路");
      await switchSourceRef.current(message, true);
    }
  }, [dispatch, handleKernelEvent, preferences.fillMode, preferences.networkMode]);

  switchSourceRef.current = async (reason, automatic = true, sourceId) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    const currentRuntime = runtimeRef.current;
    const target = sourceId
      ? currentSession.sources.find((source) => source.id === sourceId && source.url)
      : nextFailoverSource(currentSession, currentRuntime.activeSourceId, automatic ? currentRuntime.attemptedSourceIds : []);
    if (!target) {
      const message = automatic ? `所有线路均已尝试：${reason}` : `找不到所选线路：${reason}`;
      dispatch(generationAction(generationRef.current, { type: "FAILED", message }));
      setStatus("放映中断");
      return;
    }
    const snapshot = kernelRef.current?.snapshot() || emptyMediaSnapshot;
    // 自动切线可能与正在进行的拖动相撞；新线路必须从真实媒体快照开始，
    // 不能继承旧线路尚未提交的预览事务。
    scrubTransactionRef.current = null;
    suppressScrubPauseRef.current = false;
    persistResume(snapshot);
    clearTimers();
    await loadSource(target, snapshot, true, reason).catch(() => {});
  };

  const currentMediaFingerprint = mediaFingerprint(session);

  useEffect(() => {
    const previousSession = sessionRef.current;
    const previousSnapshot = kernelRef.current?.snapshot();
    const sameMovie = Boolean(session && previousSession?.movieId === session.movieId);
    sessionRef.current = session;
    scrubTransactionRef.current = null;
    suppressScrubPauseRef.current = false;
    clearTimers();
    kernelRef.current?.destroy();
    kernelRef.current = null;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    // RESET 先建立新代次边界，随后同代次的 SESSION_READY/媒体事件才会被 reducer 接受。
    dispatch(generationAction(generation, { type: "RESET" }));
    setStats(emptyMediaSnapshot);
    setQualities([{ level: -1, label: "自动" }]);
    setQualityLevel(-1);
    setResumeTip("");
    if (!session) {
      dispatch(generationAction(generation, { type: "RESET" }));
      setStatus("等待检票");
      return undefined;
    }
    dispatch(generationAction(generation, { type: "SESSION_READY", session }));
    const requested = session.sources.find((item) => item.id === session.decision.recommendedSourceId && item.url);
    const source = requested || selectRecommendedSource(session.sources);
    if (!source) {
      dispatch(generationAction(generation, { type: "FAILED", message: "本场影片没有可播放线路" }));
      setStatus("无可用线路");
      return undefined;
    }
    const resume = sameMovie ? null : loadPlaybackResume(window.localStorage, session.movieId);
    const snapshot: Partial<MediaSnapshot> = {
      currentTime: sameMovie ? Number(previousSnapshot?.currentTime || 0) : resume?.currentTime || 0,
      paused: sameMovie ? previousSnapshot?.paused !== false : true,
      volume: sameMovie ? Number(previousSnapshot?.volume ?? preferences.volume) : preferences.volume,
      muted: sameMovie ? Boolean(previousSnapshot?.muted) : preferences.muted,
      rate: sameMovie ? Number(previousSnapshot?.rate || preferences.rate) : preferences.rate
    };
    if (resume) setResumeTip(`已找到 ${Math.floor(resume.currentTime / 60)} 分 ${Math.floor(resume.currentTime % 60)} 秒的续播点`);
    void loadSource(source, snapshot, sameMovie, sameMovie ? "完整线路已刷新" : "").catch(() => {});
    return () => {
      clearTimers();
      kernelRef.current?.destroy();
      kernelRef.current = null;
    };
  // URL/推荐线路才是媒体代次边界；同 ID 的完整线路刷新也必须重载。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, currentMediaFingerprint]);

  useEffect(() => {
    sessionRef.current = session;
    if (session && runtimeRef.current.session?.id === session.id && mediaFingerprint(runtimeRef.current.session) === currentMediaFingerprint) {
      dispatch(generationAction(generationRef.current, { type: "SESSION_METADATA_UPDATED", session }));
    }
  }, [currentMediaFingerprint, dispatch, session]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistResume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [persistResume]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !session) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: session.title, artist: "糖果影院", album: `视频 ${session.movieId}` });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => void kernelRef.current?.play()],
      ["pause", () => kernelRef.current?.pause()],
      ["seekbackward", (details) => kernelRef.current?.seek((kernelRef.current?.snapshot().currentTime || 0) - Number(details.seekOffset || preferences.seekStep))],
      ["seekforward", (details) => kernelRef.current?.seek((kernelRef.current?.snapshot().currentTime || 0) + Number(details.seekOffset || preferences.seekStep))]
    ];
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* 平台不支持该动作。 */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* 保持跨浏览器兼容。 */ }
      }
    };
  }, [preferences.seekStep, session]);

  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    if (runtime.phase === "playing") {
      void (navigator as NavigatorWithWakeLock).wakeLock?.request?.("screen").then((value) => {
        if (cancelled) {
          void value.release?.().catch(() => {});
          return;
        }
        sentinel = value;
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
      void sentinel?.release?.().catch(() => {});
    };
  }, [runtime.phase]);

  const updatePreferences = useCallback((patch: Partial<PlaybackPreferences>) => {
    setPreferences((current) => {
      const next = savePlaybackPreferences({ ...current, ...patch });
      if (patch.volume !== undefined || patch.muted !== undefined) kernelRef.current?.setVolume(next.volume, next.muted);
      if (patch.rate !== undefined) kernelRef.current?.setRate(next.rate);
      if (patch.fillMode !== undefined) kernelRef.current?.setFill(next.fillMode);
      if (patch.networkMode !== undefined) kernelRef.current?.setNetworkMode(next.networkMode);
      return next;
    });
  }, []);

  const togglePlay = useCallback(async () => {
    const kernel = kernelRef.current;
    if (!kernel) return;
    const snapshot = kernel.snapshot();
    if (snapshot.paused) {
      beginStartupGuard(generationRef.current);
      setStatus("拉开幕布中");
      try {
        await kernel.play();
      } catch (error) {
        dispatch(generationAction(generationRef.current, {
          type: "FAILED",
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } else {
      kernel.pause();
    }
  }, [beginStartupGuard, dispatch]);

  const beginScrubPreview = useCallback(() => {
    const kernel = kernelRef.current;
    if (!kernel) return null;
    const generation = generationRef.current;
    const transaction = beginScrubTransaction(
      scrubTransactionRef.current,
      kernel.snapshot(),
      generation,
      scrubTransactionIdRef.current + 1
    );
    if (scrubTransactionRef.current !== transaction) scrubTransactionIdRef.current = transaction.id;
    scrubTransactionRef.current = transaction;
    suppressScrubPauseRef.current = false;
    // Shaka 官方 SeekBar 也会在 scrub 期间暂停；预览器独立解码，主画面因此停在原帧。
    if (transaction.wasPlaying) kernel.pause();
    return transaction;
  }, []);

  const updateScrubPreview = useCallback((time: number) => {
    const transaction = updateScrubTransaction(scrubTransactionRef.current, time, generationRef.current);
    if (!transaction) return false;
    scrubTransactionRef.current = transaction;
    return true;
  }, []);

  const commitScrubPreview = useCallback(async (time: number) => {
    const kernel = kernelRef.current;
    if (!kernel) return false;
    const generation = generationRef.current;
    const settlement = settleScrubTransaction(scrubTransactionRef.current, "commit", time, generation);
    if (!settlement) {
      kernel.seek(time);
      return true;
    }
    scrubTransactionRef.current = settlement.transaction;
    kernel.seek(settlement.targetTime);
    const snapshot = kernel.snapshot();
    const committedSnapshot = {
      ...snapshot,
      currentTime: settlement.targetTime,
      paused: !settlement.resumePlayback
    };
    setStats(committedSnapshot);
    persistResume(committedSnapshot);
    scrubTransactionRef.current = null;
    suppressScrubPauseRef.current = settlement.resumePlayback;
    if (!settlement.resumePlayback) {
      // 从 ended 状态拖回中段时必须回到 paused，否则结束遮罩会继续覆盖新的进度。
      dispatch(generationAction(generation, { type: "PAUSED" }));
      setStatus("已定位，等待开映");
      return true;
    }
    beginStartupGuard(generation);
    setStatus("定位完成，继续放映");
    try {
      await kernel.play();
      return true;
    } catch (error) {
      suppressScrubPauseRef.current = false;
      dispatch(generationAction(generation, {
        type: "FAILED",
        message: error instanceof Error ? error.message : String(error)
      }));
      return false;
    }
  }, [beginStartupGuard, dispatch, persistResume]);

  const cancelScrubPreview = useCallback(async () => {
    const kernel = kernelRef.current;
    if (!kernel) return false;
    const generation = generationRef.current;
    const settlement = settleScrubTransaction(scrubTransactionRef.current, "cancel", 0, generation);
    if (!settlement) return false;
    scrubTransactionRef.current = settlement.transaction;
    if (Math.abs(kernel.snapshot().currentTime - settlement.targetTime) > 0.1) {
      kernel.seek(settlement.targetTime);
    }
    setStats({ ...kernel.snapshot(), currentTime: settlement.targetTime, paused: !settlement.resumePlayback });
    scrubTransactionRef.current = null;
    suppressScrubPauseRef.current = settlement.resumePlayback;
    if (!settlement.resumePlayback) return true;
    try {
      await kernel.play();
      return true;
    } catch {
      suppressScrubPauseRef.current = false;
      return false;
    }
  }, []);

  const seekTo = useCallback((time: number) => kernelRef.current?.seek(time), []);
  const seekBy = useCallback((seconds: number) => {
    const current = kernelRef.current?.snapshot().currentTime || 0;
    kernelRef.current?.seek(current + seconds);
  }, []);

  return {
    containerRef,
    video: () => kernelRef.current?.video || null,
    runtime,
    stats,
    qualities,
    qualityLevel,
    preferences,
    status,
    resumeTip,
    activeSource: session?.sources.find((source) => source.id === runtime.activeSourceId)
      || session?.sources.find((source) => source.id === session.decision.recommendedSourceId && source.url)
      || session?.sources.find((source) => source.url)
      || null,
    togglePlay,
    play: async () => {
      if (kernelRef.current?.snapshot().paused) await togglePlay();
    },
    pause: () => kernelRef.current?.pause(),
    beginScrubPreview,
    updateScrubPreview,
    commitScrubPreview,
    cancelScrubPreview,
    seekTo,
    seekBy,
    switchSource: (sourceId: string) => switchSourceRef.current("手动选线", false, sourceId),
    reload: () => switchSourceRef.current("手动重载", false, runtimeRef.current.activeSourceId),
    setQuality: (level: number) => kernelRef.current?.setQuality(level),
    setVolume: (volume: number, muted = volume <= 0) => updatePreferences({ volume, muted }),
    setRate: (rate: number) => updatePreferences({ rate }),
    setTransientRate: (rate: number) => kernelRef.current?.setRate(rate),
    setBrightness: (brightness: number) => updatePreferences({ brightness }),
    setFillMode: (fillMode: PlaybackPreferences["fillMode"]) => updatePreferences({ fillMode }),
    setFitMode: (fitMode: PlaybackPreferences["fitMode"]) => updatePreferences({ fitMode }),
    setOrientationMode: (orientationMode: PlaybackPreferences["orientationMode"]) => updatePreferences({ orientationMode }),
    setSeekStep: (seekStep: number) => updatePreferences({ seekStep }),
    setNetworkMode: (networkMode: PlaybackPreferences["networkMode"]) => updatePreferences({ networkMode }),
    setGestureLayout: (gestureLayout: PlaybackPreferences["gestureLayout"]) => updatePreferences({ gestureLayout }),
    screenshot: (name: string) => kernelRef.current?.screenshot(name),
    togglePip: () => kernelRef.current?.togglePip()
  };
}
