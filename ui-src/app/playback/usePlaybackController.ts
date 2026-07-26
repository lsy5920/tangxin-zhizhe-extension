import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { MediaKernel, type MediaKernelEvent, type MediaQuality, type MediaSnapshot } from "./mediaKernel";
import { loadPlaybackPreferences, savePlaybackPreferences, type PlaybackPreferences } from "./preferences";
import { loadPlaybackResume, savePlaybackResume } from "./resumeStore";
import { createPlaybackRuntimeState, playbackSessionReducer } from "./sessionReducer";
import { nextFailoverSource, shouldFailover } from "./sourcePolicy";
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
      dispatch(generationAction(generation, { type: "PAUSED" }));
      setStatus("已暂停");
      persistResume();
      return;
    }
    if (event.type === "waiting") {
      dispatch(generationAction(generation, { type: "BUFFERING" }));
      setStatus("糖果云缓冲中");
      return;
    }
    if (event.type === "time") {
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
    if (event.type === "error") {
      void switchSourceRef.current(event.message, true);
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
    await kernel.load(source, snapshot, preferences.fillMode);
  }, [dispatch, handleKernelEvent, preferences.fillMode]);

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
    persistResume(snapshot);
    clearTimers();
    await loadSource(target, snapshot, true, reason);
  };

  useEffect(() => {
    sessionRef.current = session;
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
    const source = session.sources.find((item) => item.id === session.decision.recommendedSourceId)
      || session.sources.find((item) => item.url);
    if (!source) {
      dispatch(generationAction(generation, { type: "FAILED", message: "本场影片没有可播放线路" }));
      setStatus("无可用线路");
      return undefined;
    }
    const resume = loadPlaybackResume(window.localStorage, session.movieId);
    const snapshot: Partial<MediaSnapshot> = {
      currentTime: resume?.currentTime || 0,
      paused: true,
      volume: preferences.volume,
      muted: preferences.muted,
      rate: preferences.rate
    };
    if (resume) setResumeTip(`已找到 ${Math.floor(resume.currentTime / 60)} 分 ${Math.floor(resume.currentTime % 60)} 秒的续播点`);
    void loadSource(source, snapshot, false);
    return () => {
      clearTimers();
      kernelRef.current?.destroy();
      kernelRef.current = null;
    };
  // 会话 ID 是唯一代次边界；偏好改变不应销毁正在播放的内核。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

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
    if (runtime.phase === "playing") {
      void (navigator as NavigatorWithWakeLock).wakeLock?.request?.("screen").then((value) => { sentinel = value; }).catch(() => {});
    }
    return () => { void sentinel?.release?.().catch(() => {}); };
  }, [runtime.phase]);

  const updatePreferences = useCallback((patch: Partial<PlaybackPreferences>) => {
    setPreferences((current) => {
      const next = savePlaybackPreferences({ ...current, ...patch });
      if (patch.volume !== undefined || patch.muted !== undefined) kernelRef.current?.setVolume(next.volume, next.muted);
      if (patch.rate !== undefined) kernelRef.current?.setRate(next.rate);
      if (patch.fillMode !== undefined) kernelRef.current?.setFill(next.fillMode);
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
    screenshot: (name: string) => kernelRef.current?.screenshot(name),
    togglePip: () => kernelRef.current?.togglePip()
  };
}
