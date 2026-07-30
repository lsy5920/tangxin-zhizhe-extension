import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { PlayerContextMenu, PlayerControlBar, PlayerOverlays, PlayerTopBar, type PlayerMorePanelKey } from "../player/PlayerChrome";
import { PlayerGestureHudOverlay, PlayerGestureSurface, type GestureHudState } from "../player/PlayerGestureSystem";
import { isBrowserFullscreen } from "../player/browserFullscreen";
import { canAutoAdvanceEpisode } from "../../cinema/episodePlayback";
import type { CinemaMovie } from "../../cinema/types";
import { usePlaybackController } from "../../playback/usePlaybackController";
import { useFullscreenController } from "../../playback/useFullscreenController";
import type { PlaybackSession } from "../../playback/types";
import type { PlaybackBookmark } from "../../types";
import { formatDuration } from "../../helpers";
import { resolveStageMediaOrientation } from "../../playback/stageLayout";
import { ScreeningEpisodeOverlay } from "./ScreeningEpisodeOverlay";

export type PlaybackBookmarkCommand = {
  nonce: number;
  type: "seek" | "loop";
  bookmark: PlaybackBookmark;
};

type Props = {
  session: PlaybackSession;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPlayingChange?: (playing: boolean) => void;
  bookmarks?: PlaybackBookmark[];
  bookmarkCommand?: PlaybackBookmarkCommand | null;
  onMediaStatsChange?: (stats: { currentTime: number; duration: number }) => void;
  episodes?: CinemaMovie[];
  currentEpisodeIndex?: number;
  nextEpisode?: CinemaMovie | null;
  autoNextEnabled?: boolean;
  autoPlayRequested?: boolean;
  onSelectEpisode?: (episode: CinemaMovie) => void;
  onAutoNextEnabledChange?: (enabled: boolean) => void;
  onAutoPlayConsumed?: () => void;
};

function percent(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
}

function fillLabel(mode: "contain" | "cover" | "fill") {
  if (mode === "cover") return "裁满";
  if (mode === "fill") return "铺满";
  return "原比例";
}

function orientationLabel(mode: "auto" | "landscape" | "portrait") {
  if (mode === "landscape") return "横屏";
  if (mode === "portrait") return "竖屏";
  return "自动方向";
}

export function ScreeningStage({
  session,
  onAction,
  onPlayingChange,
  bookmarks = [],
  bookmarkCommand = null,
  onMediaStatsChange,
  episodes = [],
  currentEpisodeIndex = -1,
  nextEpisode = null,
  autoNextEnabled = true,
  autoPlayRequested = false,
  onSelectEpisode,
  onAutoNextEnabledChange,
  onAutoPlayConsumed
}: Props) {
  const player = usePlaybackController(session);
  const fullscreen = useFullscreenController({
    video: player.video,
    fillMode: player.preferences.fillMode,
    orientationMode: player.preferences.orientationMode
  });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [locked, setLocked] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [autoNextCancelled, setAutoNextCancelled] = useState(false);
  const [morePanel, setMorePanel] = useState<PlayerMorePanelKey>("source");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [gestureHud, setGestureHud] = useState<GestureHudState>({ kind: "", text: "" });
  const [holdHint, setHoldHint] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<number>();
  const hudTimerRef = useRef<number>();
  const progressPreviewClearTimerRef = useRef<number>();
  const scrubUiActiveRef = useRef(false);
  const previousRateRef = useRef(1);
  const playedRecordedRef = useRef(false);
  const endedRecordedRef = useRef(false);
  const autoAdvanceHandledRef = useRef("");
  const autoPlayHandledRef = useRef("");
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);
  const activeSource = player.activeSource;
  const mediaSessionKey = `${session.id}:${session.movieId}:${session.revision || 0}:${activeSource?.id || ""}:${activeSource?.url || ""}`;
  const hasUrl = Boolean(activeSource?.url);
  const paused = player.stats.paused;
  const buffering = player.runtime.phase === "buffering" || player.runtime.phase === "switching" || player.runtime.phase === "loading";
  const error = player.runtime.phase === "error" ? player.runtime.error : "";
  const ended = player.runtime.phase === "ended";

  const video = player.video();
  const automaticStageLayout = resolveStageMediaOrientation(
    "auto",
    Number(video?.videoWidth || 0),
    Number(video?.videoHeight || 0),
    activeSource?.media?.variants || []
  );
  const stageLayout = resolveStageMediaOrientation(
    player.preferences.fitMode,
    Number(video?.videoWidth || 0),
    Number(video?.videoHeight || 0),
    activeSource?.media?.variants || []
  );
  const detectedFit = automaticStageLayout.orientation === "portrait" ? "vertical" : "wide";
  const qualityLabel = player.qualities.find((item) => item.level === player.qualityLevel)?.label || "自动";
  const previewOptions = useMemo(() => session.sources.map((source) => ({
    key: source.id,
    label: source.label,
    url: source.url,
    hint: source.health.state === "healthy" ? "健康" : source.health.state === "failed" ? "异常" : "待实播验证"
  })), [session.sources]);
  const alternateSource = session.sources.find((source) => source.id !== activeSource?.id && source.url);

  const revealControls = (pin = false) => {
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    setControlsVisible(true);
    if (!pin && !moreOpen && !episodePanelOpen && !controlsFocused && !locked && player.runtime.phase === "playing") {
      controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), fullscreen.active ? 2200 : 3000);
    }
  };

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen.active, locked, moreOpen, episodePanelOpen, controlsFocused, player.runtime.phase]);

  useEffect(() => {
    // 切换会话、线路或 URL 后立即清理旧进度点预览，迟到定时器不得覆盖新媒体。
    setDragging(false);
    setPreviewTime(null);
    setEpisodePanelOpen(false);
    setNextCountdown(null);
    setAutoNextCancelled(false);
    autoAdvanceHandledRef.current = "";
    scrubUiActiveRef.current = false;
    if (progressPreviewClearTimerRef.current) window.clearTimeout(progressPreviewClearTimerRef.current);
    return () => {
      if (progressPreviewClearTimerRef.current) window.clearTimeout(progressPreviewClearTimerRef.current);
    };
  }, [mediaSessionKey]);

  useEffect(() => {
    if (!fullscreen.active && locked) setLocked(false);
  }, [fullscreen.active, locked]);

  useEffect(() => {
    if (locked) setEpisodePanelOpen(false);
  }, [locked]);

  useEffect(() => {
    onPlayingChange?.(player.runtime.phase === "playing");
    return () => onPlayingChange?.(false);
  }, [onPlayingChange, player.runtime.phase]);

  useEffect(() => {
    onMediaStatsChange?.({ currentTime: player.stats.currentTime, duration: player.stats.duration });
  }, [onMediaStatsChange, player.stats.currentTime, player.stats.duration]);

  useEffect(() => {
    if (player.runtime.phase === "playing" && !playedRecordedRef.current) {
      playedRecordedRef.current = true;
      onAction("mark-library-playback", { movieId: session.movieId, title: session.title, ended: false });
    }
    if (player.runtime.phase === "ended" && !endedRecordedRef.current) {
      endedRecordedRef.current = true;
      onAction("mark-library-playback", { movieId: session.movieId, title: session.title, ended: true });
    }
  }, [onAction, player.runtime.phase, session.movieId, session.title]);

  useEffect(() => {
    if (
      !autoPlayRequested
      || !hasUrl
      || autoPlayHandledRef.current === session.id
      || !["ready", "paused"].includes(player.runtime.phase)
    ) return;
    autoPlayHandledRef.current = session.id;
    // 画面选集和自动续播都是明确的连续观看意图；新会话就绪后只自动开映一次。
    onAutoPlayConsumed?.();
    void player.play();
  }, [autoPlayRequested, hasUrl, onAutoPlayConsumed, player.play, player.runtime.phase, session.id]);

  useEffect(() => {
    setNextCountdown(null);
    if (
      !ended
      || !nextEpisode
      || !autoNextEnabled
      || autoNextCancelled
      || !canAutoAdvanceEpisode(nextEpisode)
      || autoAdvanceHandledRef.current === session.id
      || !onSelectEpisode
    ) return;

    let remaining = 5;
    setNextCountdown(remaining);
    const interval = window.setInterval(() => {
      remaining -= 1;
      setNextCountdown(Math.max(0, remaining));
    }, 1000);
    const timeout = window.setTimeout(() => {
      autoAdvanceHandledRef.current = session.id;
      setNextCountdown(null);
      onSelectEpisode(nextEpisode);
    }, 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [autoNextCancelled, autoNextEnabled, ended, nextEpisode, onSelectEpisode, session.id]);

  useEffect(() => {
    if (!loopRange || player.runtime.phase !== "playing") return;
    if (player.stats.currentTime >= loopRange.end - 0.2) player.seekTo(loopRange.start);
  }, [loopRange, player.runtime.phase, player.stats.currentTime, player.seekTo]);

  useEffect(() => {
    if (!bookmarkCommand?.bookmark || bookmarkCommand.bookmark.movieId !== session.movieId) return;
    const bookmark = bookmarkCommand.bookmark;
    if (bookmark.startSeconds > player.stats.duration && player.stats.duration > 0) {
      showHud({ kind: "seek-scrub", text: "当前片源无法到达该书签" }, 1500);
      return;
    }
    player.seekTo(bookmark.startSeconds);
    if (bookmarkCommand.type === "loop" && Number(bookmark.endSeconds || 0) > bookmark.startSeconds + 1) {
      setLoopStart(bookmark.startSeconds);
      setLoopRange({ start: bookmark.startSeconds, end: Number(bookmark.endSeconds) });
      showHud({ kind: "seek-scrub", text: `循环 ${formatDuration(bookmark.startSeconds)}–${formatDuration(Number(bookmark.endSeconds))}` }, 1300);
    }
  // command nonce guarantees that selecting the same bookmark twice still runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkCommand?.nonce]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      const root = fullscreen.shellRef.current?.getRootNode();
      // 顶层业务弹窗拥有全部键盘输入；播放器不能隔着弹窗响应快捷键。
      if (root instanceof ShadowRoot && root.querySelector('[data-txzz-modal-sheet="true"]')) return;
      const eventPath = event.composedPath();
      const shortcutInput = eventPath.some((node) => node instanceof HTMLElement
        && node.matches("input,textarea,select,[role='slider'],[contenteditable='true']"));
      if (key === "escape") {
        if (episodePanelOpen) {
          event.preventDefault();
          event.stopPropagation();
          setEpisodePanelOpen(false);
          revealControls(true);
          return;
        }
        if (moreOpen) {
          event.preventDefault();
          event.stopPropagation();
          setMoreOpen(false);
          revealControls(true);
          return;
        }
        if (fullscreen.active || isBrowserFullscreen()) {
          // 必须先于 interactive 判断：点击全屏按钮后焦点仍在 button 上，旧逻辑会
          // 把 Esc 当成“交互控件输入”跳过，随后工作台处理器误关面板并拆掉全屏壳。
          event.preventDefault();
          event.stopPropagation();
          if (locked) setLocked(false);
          else void fullscreen.exit();
          revealControls(true);
          return;
        }
      }
      if (key === "l" && fullscreen.active && !moreOpen && !shortcutInput) {
        // 全屏按钮点击后仍持有焦点，锁屏快捷键仍应可用；文本弹窗已在上方提前排除。
        event.preventDefault();
        setLocked((value) => !value);
        revealControls(true);
        return;
      }
      if (key === "f" && !locked && !moreOpen && !shortcutInput) {
        event.preventDefault();
        void fullscreen.toggle();
        revealControls(true);
        return;
      }
      const interactive = eventPath.some((node) => node instanceof HTMLElement
        && node.matches("button,input,textarea,select,[role='slider'],[contenteditable='true']"));
      if (interactive || (locked && event.key.toLowerCase() !== "l")) return;
      if (key === " " || key === "k") {
        event.preventDefault();
        void player.togglePlay();
      } else if (key === "arrowleft") {
        event.preventDefault();
        player.seekBy(-player.preferences.seekStep);
      } else if (key === "arrowright") {
        event.preventDefault();
        player.seekBy(player.preferences.seekStep);
      } else if (key === "arrowup") {
        event.preventDefault();
        player.setVolume(Math.min(1, player.preferences.volume + 0.05), false);
      } else if (key === "arrowdown") {
        event.preventDefault();
        const volume = Math.max(0, player.preferences.volume - 0.05);
        player.setVolume(volume, volume === 0);
      } else if (key === "m") {
        event.preventDefault();
        player.setVolume(player.preferences.volume || 0.8, !player.preferences.muted);
      }
      revealControls();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  });

  const showHud = (hud: GestureHudState, duration = 720) => {
    setGestureHud(hud);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => setGestureHud({ kind: "", text: "" }), duration);
  };

  const cycle = <T,>(items: T[], current: T) => items[(items.indexOf(current) + 1) % items.length];
  const cycleRate = () => player.setRate(cycle([0.75, 1, 1.25, 1.5, 2], player.preferences.rate));
  const cycleFit = () => player.setFitMode(cycle(["auto", "wide", "vertical"] as const, player.preferences.fitMode));
  const cycleFill = () => player.setFillMode(cycle(["contain", "cover", "fill"] as const, player.preferences.fillMode));
  const cycleOrientation = () => player.setOrientationMode(cycle(["auto", "landscape", "portrait"] as const, player.preferences.orientationMode));

  const seekFromRatio = (ratio: number) => Math.max(0, Math.min(player.stats.duration, player.stats.duration * ratio));
  const updateScrubPreview = (target: number) => {
    if (progressPreviewClearTimerRef.current) window.clearTimeout(progressPreviewClearTimerRef.current);
    if (!scrubUiActiveRef.current) {
      player.beginScrubPreview();
      scrubUiActiveRef.current = true;
      setDragging(true);
    }
    player.updateScrubPreview(target);
    setPreviewTime(target);
    revealControls(true);
  };
  const commitScrubPreview = (target: number) => {
    if (!scrubUiActiveRef.current) {
      player.seekTo(target);
      return;
    }
    player.updateScrubPreview(target);
    scrubUiActiveRef.current = false;
    setDragging(false);
    setPreviewTime(target);
    void player.commitScrubPreview(target);
    progressPreviewClearTimerRef.current = window.setTimeout(() => setPreviewTime(null), 420);
  };
  const cancelScrubPreview = () => {
    if (scrubUiActiveRef.current) void player.cancelScrubPreview();
    scrubUiActiveRef.current = false;
    setDragging(false);
    setPreviewTime(null);
    if (progressPreviewClearTimerRef.current) window.clearTimeout(progressPreviewClearTimerRef.current);
  };
  const onSeekStart = (ratio: number, _event: ReactPointerEvent<HTMLDivElement>) => {
    updateScrubPreview(seekFromRatio(ratio));
  };
  const onSeekMove = (ratio: number) => {
    if (!scrubUiActiveRef.current) return;
    updateScrubPreview(seekFromRatio(ratio));
  };
  const onSeekEnd = (ratio: number) => {
    commitScrubPreview(seekFromRatio(ratio));
  };
  const onSeekCancel = cancelScrubPreview;

  const copyCurrentLink = () => onAction("copy-play-link", { url: activeSource?.url || "", label: `${activeSource?.label || "当前线路"}完整链接` });
  const openCurrentLink = () => onAction("open-playback-url", { url: activeSource?.url || "", label: activeSource?.label || "当前线路" });
  const savePointBookmark = () => {
    if (!player.stats.duration || player.stats.currentTime < 0) {
      showHud({ kind: "seek-scrub", text: "影片就绪后才能保存书签" }, 1300);
      return;
    }
    onAction("save-playback-bookmark", {
      movieId: session.movieId,
      title: session.title,
      label: `书签 ${formatDuration(player.stats.currentTime)}`,
      startSeconds: player.stats.currentTime,
      durationSeconds: player.stats.duration
    });
    showHud({ kind: "seek-scrub", text: `已保存 ${formatDuration(player.stats.currentTime)}` }, 1100);
  };
  const setCurrentAsLoopStart = () => {
    setLoopStart(player.stats.currentTime);
    setLoopRange(null);
    showHud({ kind: "seek-scrub", text: `A 点 ${formatDuration(player.stats.currentTime)}` }, 1100);
  };
  const setCurrentAsLoopEnd = () => {
    if (loopStart === null) {
      showHud({ kind: "seek-scrub", text: "请先设置 A 点" }, 1300);
      return;
    }
    const end = player.stats.currentTime;
    if (end <= loopStart + 1 || (player.stats.duration > 0 && end > player.stats.duration + 0.25)) {
      showHud({ kind: "seek-scrub", text: "B 点必须至少比 A 点晚 1 秒" }, 1500);
      return;
    }
    setLoopRange({ start: loopStart, end });
    onAction("save-playback-bookmark", {
      movieId: session.movieId,
      title: session.title,
      label: `片段 ${formatDuration(loopStart)}–${formatDuration(end)}`,
      startSeconds: loopStart,
      endSeconds: end,
      durationSeconds: player.stats.duration
    });
    showHud({ kind: "seek-scrub", text: `循环 ${formatDuration(loopStart)}–${formatDuration(end)}` }, 1300);
  };
  const clearLoop = () => {
    setLoopRange(null);
    setLoopStart(null);
    showHud({ kind: "seek-scrub", text: "片段循环已结束" }, 1000);
  };

  const handleStageContextMenuCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    // 控件需要保留浏览器/控件自身的右键语义；视频画面则必须在捕获阶段拦截，
    // 在捕获阶段统一接管视频区右键，避免媒体内核或浏览器默认菜单抢先消费事件。
    if (target instanceof HTMLElement && target.closest("button,input,textarea,select,[role='slider'],[contenteditable='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    if (!hasUrl || locked) return;
    const rect = stageRef.current?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    setMoreOpen(false);
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX - rect.left, Math.max(8, rect.width - 8))),
      y: Math.max(8, Math.min(event.clientY - rect.top, Math.max(8, rect.height - 8)))
    });
  };

  const setEpisodePanel = (open: boolean) => {
    setEpisodePanelOpen(open);
    if (open) {
      setMoreOpen(false);
      setContextMenu(null);
      revealControls(true);
    }
  };
  const selectEpisode = (episode: CinemaMovie) => {
    if (!onSelectEpisode || episode.id === session.movieId) return;
    setEpisodePanelOpen(false);
    setAutoNextCancelled(true);
    onSelectEpisode(episode);
  };
  const playNextNow = () => {
    if (!nextEpisode || !onSelectEpisode) return;
    autoAdvanceHandledRef.current = session.id;
    setNextCountdown(null);
    selectEpisode(nextEpisode);
  };
  const cancelAutoNext = () => {
    setAutoNextCancelled(true);
    setNextCountdown(null);
  };
  const planCurrentDownload = () => {
    const openPlanner = () => onAction("plan-full-video-download", {
      movieId: session.movieId,
      movieTitle: session.title,
      sourceId: activeSource?.id || "",
      lineKey: activeSource?.id || "auto"
    });
    setEpisodePanelOpen(false);
    // 规划器是全局顶层弹层；先退出原生全屏，避免浏览器最高层级把它盖在视频后面。
    if (fullscreen.active || isBrowserFullscreen()) {
      void fullscreen.exit().then(openPlanner, openPlanner);
      return;
    }
    openPlanner();
  };

  const shellStyle = fullscreen.active ? { background: "#000" } : undefined;

  return (
    <div
      ref={fullscreen.shellRef}
      className={`txzz-player-shell txzz-stream-player-shell txzz-player-shell--${stageLayout.orientation} ${fullscreen.active ? "txzz-player-fullscreen-shell txzz-fullscreen-active" : "is-embedded"}`}
      style={shellStyle}
      data-playback-phase={player.runtime.phase}
      data-stage-orientation={stageLayout.orientation}
      data-stage-evidence={stageLayout.source}
      tabIndex={0}
      aria-label={`糖心影院播放器：${session.title}`}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button,input,textarea,select,[role='slider'],[contenteditable='true']")) return;
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={() => revealControls()}
      onPointerLeave={() => { if (!moreOpen && !episodePanelOpen && player.runtime.phase === "playing") setControlsVisible(false); }}
      onContextMenuCapture={handleStageContextMenuCapture}
    >
      <div ref={stageRef} className="txzz-player-orientation-stage absolute inset-0">
        <div ref={player.containerRef} className="txzz-player-clean txzz-player-card-body txzz-stream-player-media" />
        <div
          className="txzz-player-brightness-mask pointer-events-none absolute inset-0 z-[8]"
          data-mode={player.preferences.brightness > 100 ? "boost" : "dim"}
          style={{
            display: player.preferences.brightness === 100 ? "none" : "block",
            opacity: player.preferences.brightness < 100
              ? Math.min(0.75, (100 - player.preferences.brightness) / 100)
              : Math.min(0.55, (player.preferences.brightness - 100) / 80)
          }}
          aria-hidden
        />
        <PlayerGestureSurface
          sessionKey={mediaSessionKey}
          enabled={hasUrl}
          locked={locked}
          controlsVisible={controlsVisible}
          seekStep={player.preferences.seekStep}
          volume={player.preferences.volume}
          muted={player.preferences.muted}
          brightness={player.preferences.brightness}
          currentTime={player.stats.currentTime}
          duration={player.stats.duration}
          playing={!paused}
          gestureLayout={player.preferences.gestureLayout}
          holdRate={3}
          onShowHud={showHud}
          onToggleControls={(show) => show ? revealControls(true) : setControlsVisible(false)}
          onTogglePlay={() => void player.togglePlay()}
          onSeekBy={player.seekBy}
          onSeekTo={commitScrubPreview}
          onSeekPreview={updateScrubPreview}
          onSeekPreviewCancel={cancelScrubPreview}
          onVolume={player.setVolume}
          onBrightness={player.setBrightness}
          onHoldRateStart={(rate) => {
            previousRateRef.current = player.preferences.rate;
            player.setTransientRate(rate);
            setHoldHint(`${rate}x 长按加速 · 松开恢复`);
          }}
          onHoldRateEnd={() => {
            player.setTransientRate(previousRateRef.current);
            setHoldHint("");
          }}
          onLockHint={() => setHoldHint("控制已锁定，点击右下角解锁")}
          onContextMenu={(position) => { setMoreOpen(false); setContextMenu(position); }}
        />
        <PlayerGestureHudOverlay hud={gestureHud} holdHint={holdHint} />
        <PlayerContextMenu
          open={Boolean(contextMenu)}
          x={contextMenu?.x || 0}
          y={contextMenu?.y || 0}
          onClose={() => setContextMenu(null)}
          onCopyLink={copyCurrentLink}
          onOpenLink={openCurrentLink}
          onBookmark={savePointBookmark}
          onLoopStart={setCurrentAsLoopStart}
          onLoopEnd={setCurrentAsLoopEnd}
          onClearLoop={clearLoop}
          loopStarted={loopStart !== null}
          loopActive={Boolean(loopRange)}
          onDiagnostic={() => onAction("copy-playback-health-report", { movieId: session.movieId })}
        />
        <PlayerTopBar
          visible={controlsVisible || paused || Boolean(error) || episodePanelOpen}
          locked={locked}
          fullscreen={fullscreen.active}
          title={session.title}
          status={player.status}
          hasUrl={hasUrl}
          fillLabel={fillLabel(player.preferences.fillMode)}
          metaVisible={controlsVisible}
          diagnosticLabel={fullscreen.diagnostic}
          diagnosticOk={!fullscreen.immersiveFallback}
          resumeTip={player.resumeTip}
          error={error}
          onBack={() => void fullscreen.exit()}
        />
        <ScreeningEpisodeOverlay
          visible={hasUrl && !locked && !moreOpen && (controlsVisible || paused || ended)}
          open={episodePanelOpen}
          episodes={episodes}
          currentMovieId={session.movieId}
          currentIndex={currentEpisodeIndex}
          nextEpisode={nextEpisode}
          autoNextEnabled={autoNextEnabled}
          ended={ended}
          countdown={nextCountdown}
          onOpenChange={setEpisodePanel}
          onSelectEpisode={selectEpisode}
          onDownload={planCurrentDownload}
          onAutoNextEnabledChange={(enabled) => {
            setAutoNextCancelled(false);
            onAutoNextEnabledChange?.(enabled);
          }}
          onPlayNext={playNextNow}
          onCancelCountdown={cancelAutoNext}
        />
        <PlayerOverlays
          // 设置面板已经承担当前交互焦点；暂停/缓冲大按钮继续悬在上方会遮住中间“观看”页签。
          buffering={buffering && !moreOpen && !episodePanelOpen}
          hasUrl={hasUrl}
          error={error}
          paused={paused && !moreOpen && !episodePanelOpen && !ended}
          locked={locked}
          fullscreen={fullscreen.active}
          onPlay={() => void player.play()}
          onReload={() => void player.reload()}
          onSwitchBackup={() => { if (alternateSource) void player.switchSource(alternateSource.id); }}
          canSwitchBackup={Boolean(alternateSource)}
          onUnlock={() => setLocked(false)}
        />
        <PlayerControlBar
          visible={controlsVisible || paused || moreOpen || episodePanelOpen}
          locked={locked}
          disabled={!hasUrl}
          fullscreen={fullscreen.active}
          controlsTone=""
          iconSize={16}
          buttonSize={fullscreen.active ? "lg" : "md"}
          compact={!fullscreen.active}
          paused={paused}
          currentTime={player.stats.currentTime}
          duration={player.stats.duration}
          bufferedPercent={percent(player.stats.bufferedEnd, player.stats.duration)}
          progressPercent={percent(player.stats.currentTime, player.stats.duration)}
          markers={bookmarks.map((bookmark) => ({ id: bookmark.id, time: bookmark.startSeconds, label: bookmark.label }))}
          progressPreviewTime={previewTime}
          previewSource={activeSource}
          previewSessionKey={mediaSessionKey}
          previewFallbackVideo={video}
          isDraggingProgress={dragging}
          volume={player.preferences.volume}
          muted={player.preferences.muted}
          rate={player.preferences.rate}
          seekStep={player.preferences.seekStep}
          qualityLabel={qualityLabel}
          fillLabel={fillLabel(player.preferences.fillMode)}
          fitLabel={player.preferences.fitMode === "auto" ? `自动${detectedFit === "vertical" ? "竖屏" : "横屏"}` : player.preferences.fitMode === "vertical" ? "竖屏" : "横屏"}
          orientationLabel={orientationLabel(player.preferences.orientationMode)}
          brightness={player.preferences.brightness}
          moreOpen={moreOpen}
          morePanel={morePanel}
          previewOptions={previewOptions}
          activePreviewKey={activeSource?.id || ""}
          previewSourceLabel={activeSource?.label || "等待线路"}
          playerStatus={player.status}
          currentLineLabel={activeSource?.label || "未检票"}
          fullscreenDiagnosticLabel={fullscreen.diagnostic}
          rateOptions={[0.75, 1, 1.25, 1.5, 2]}
          seekStepOptions={[5, 10, 30, 60]}
          qualities={player.qualities}
          qualityLevel={player.qualityLevel}
          fitMode={player.preferences.fitMode}
          orientationMode={player.preferences.orientationMode}
          orientationRequested={fullscreen.active}
          networkMode={player.preferences.networkMode}
          gestureLayout={player.preferences.gestureLayout}
          onSeekStart={onSeekStart}
          onSeekMove={onSeekMove}
          onSeekEnd={onSeekEnd}
          onSeekCancel={onSeekCancel}
          onKeyboardSeek={player.seekBy}
          onMarkerSelect={(_id, time) => player.seekTo(time)}
          onTogglePlay={() => void player.togglePlay()}
          onSeekBack={() => player.seekBy(-player.preferences.seekStep)}
          onSeekForward={() => player.seekBy(player.preferences.seekStep)}
          onToggleMore={() => { setEpisodePanelOpen(false); setMoreOpen((value) => !value); revealControls(true); }}
          onCloseMore={() => setMoreOpen(false)}
          onToggleLock={() => setLocked((value) => !value)}
          onToggleFullscreen={() => void fullscreen.toggle()}
          onToggleMute={() => player.setVolume(player.preferences.volume || 0.8, !player.preferences.muted)}
          onVolumeChange={(volume) => player.setVolume(volume, volume <= 0)}
          onCycleRate={cycleRate}
          onSetRate={player.setRate}
          onSetSeekStep={player.setSeekStep}
          onSetMorePanel={setMorePanel}
          onSelectPreview={(key) => void player.switchSource(key)}
          onSetQuality={player.setQuality}
          onCycleFit={cycleFit}
          onCycleFill={cycleFill}
          onCycleOrientation={cycleOrientation}
          onScreenshot={() => void player.screenshot(`${session.title || "糖果影院截图"}.png`)?.catch(() => {})}
          onReload={() => void player.reload()}
          onPip={() => player.togglePip()}
          onRecenter={() => { player.setFitMode("auto"); player.setFillMode("contain"); }}
          onCopyDiagnostic={() => onAction("copy-playback-health-report", { movieId: session.movieId })}
          onBrightnessChange={player.setBrightness}
          onSetNetworkMode={player.setNetworkMode}
          onSetGestureLayout={player.setGestureLayout}
          onFocusWithinChange={setControlsFocused}
        />
      </div>
    </div>
  );
}
