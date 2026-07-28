import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { PlayerContextMenu, PlayerControlBar, PlayerOverlays, PlayerTopBar, type PlayerMorePanelKey } from "../player/PlayerChrome";
import { PlayerGestureHudOverlay, PlayerGestureSurface, type GestureHudState } from "../player/PlayerGestureSystem";
import { isBrowserFullscreen } from "../player/browserFullscreen";
import { usePlaybackController } from "../../playback/usePlaybackController";
import { useFullscreenController } from "../../playback/useFullscreenController";
import type { PlaybackSession } from "../../playback/types";

type Props = {
  session: PlaybackSession;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPlayingChange?: (playing: boolean) => void;
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

export function ScreeningStage({ session, onAction, onPlayingChange }: Props) {
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
  const [morePanel, setMorePanel] = useState<PlayerMorePanelKey>("line");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [gestureHud, setGestureHud] = useState<GestureHudState>({ kind: "", text: "" });
  const [holdHint, setHoldHint] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const controlsTimerRef = useRef<number>();
  const hudTimerRef = useRef<number>();
  const previousRateRef = useRef(1);
  const activeSource = player.activeSource;
  const hasUrl = Boolean(activeSource?.url);
  const paused = player.stats.paused;
  const buffering = player.runtime.phase === "buffering" || player.runtime.phase === "switching" || player.runtime.phase === "loading";
  const error = player.runtime.phase === "error" ? player.runtime.error : "";

  const video = player.video();
  const detectedFit = Number(video?.videoHeight || 0) > Number(video?.videoWidth || 0) ? "vertical" : "wide";
  const fit = player.preferences.fitMode === "auto" ? detectedFit : player.preferences.fitMode;
  const stageAspect = fit === "vertical" ? "9 / 16" : "16 / 9";
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
    if (!pin && !moreOpen && !controlsFocused && !locked && player.runtime.phase === "playing") {
      controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), fullscreen.active ? 2200 : 3000);
    }
  };

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen.active, locked, moreOpen, controlsFocused, player.runtime.phase]);

  useEffect(() => {
    if (!fullscreen.active && locked) setLocked(false);
  }, [fullscreen.active, locked]);

  useEffect(() => {
    onPlayingChange?.(player.runtime.phase === "playing");
    return () => onPlayingChange?.(false);
  }, [onPlayingChange, player.runtime.phase]);

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
  const onSeekStart = (ratio: number, _event: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(true);
    setPreviewTime(seekFromRatio(ratio));
  };
  const onSeekMove = (ratio: number) => {
    if (dragging) setPreviewTime(seekFromRatio(ratio));
  };
  const onSeekEnd = (ratio: number) => {
    player.seekTo(seekFromRatio(ratio));
    setDragging(false);
    setPreviewTime(null);
  };

  const copyCurrentLink = () => onAction("copy-play-link", { url: activeSource?.url || "", label: `${activeSource?.label || "当前线路"}完整链接` });
  const openCurrentLink = () => onAction("open-playback-url", { url: activeSource?.url || "", label: activeSource?.label || "当前线路" });
  const downloadCurrent = () => onAction("plan-full-video-download", { movieId: session.movieId, sourceId: activeSource?.id || "" });

  const shellStyle = fullscreen.active
    ? ({ background: "#000" } as CSSProperties)
    : ({ aspectRatio: stageAspect } as CSSProperties);

  return (
    <div
      ref={fullscreen.shellRef}
      className={`txzz-player-shell txzz-candy-interactive select-none overflow-hidden bg-black ${fullscreen.active ? "txzz-player-fullscreen-shell txzz-fullscreen-active fixed inset-0 z-[2147483647] rounded-none" : "relative rounded-[1.35rem] shadow-2xl shadow-violet-950/20 ring-1 ring-black/25"}`}
      style={shellStyle}
      data-playback-phase={player.runtime.phase}
      tabIndex={0}
      aria-label={`糖果影院播放器：${session.title}`}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button,input,textarea,select,[role='slider'],[contenteditable='true']")) return;
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={() => revealControls()}
      onPointerLeave={() => { if (!moreOpen && player.runtime.phase === "playing") setControlsVisible(false); }}
    >
      <div className="txzz-player-orientation-stage absolute inset-0">
        <div ref={player.containerRef} className="txzz-player-clean txzz-player-card-body absolute inset-0 h-full w-full bg-black" />
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
          holdRate={3}
          onShowHud={showHud}
          onToggleControls={(show) => show ? revealControls(true) : setControlsVisible(false)}
          onTogglePlay={() => void player.togglePlay()}
          onSeekBy={player.seekBy}
          onSeekTo={player.seekTo}
          onVolume={player.setVolume}
          onBrightness={player.setBrightness}
          onHoldRateStart={(rate) => {
            previousRateRef.current = player.preferences.rate;
            player.setTransientRate(rate);
            setHoldHint(`${rate}x 糖果加速中 · 松开恢复`);
          }}
          onHoldRateEnd={() => {
            player.setTransientRate(previousRateRef.current);
            setHoldHint("");
          }}
          onLockHint={() => setHoldHint("控制已锁定，点右下角糖果锁解开")}
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
          onDiagnostic={() => onAction("copy-playback-health-report", { movieId: session.movieId })}
        />
        <PlayerTopBar
          visible={controlsVisible || paused || Boolean(error)}
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
        <PlayerOverlays
          buffering={buffering}
          hasUrl={hasUrl}
          error={error}
          paused={paused}
          locked={locked}
          fullscreen={fullscreen.active}
          onPlay={() => void player.play()}
          onReload={() => void player.reload()}
          onSwitchBackup={() => { if (alternateSource) void player.switchSource(alternateSource.id); }}
          canSwitchBackup={Boolean(alternateSource)}
          onUnlock={() => setLocked(false)}
        />
        <PlayerControlBar
          visible={controlsVisible || paused || moreOpen}
          locked={locked}
          disabled={!hasUrl}
          fullscreen={fullscreen.active}
          controlsTone="inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/66 to-transparent px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-14 sm:px-5"
          iconSize={16}
          buttonSize={fullscreen.active ? "lg" : "md"}
          compact={!fullscreen.active}
          paused={paused}
          currentTime={player.stats.currentTime}
          duration={player.stats.duration}
          bufferedPercent={percent(player.stats.bufferedEnd, player.stats.duration)}
          progressPercent={percent(player.stats.currentTime, player.stats.duration)}
          progressPreviewTime={previewTime}
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
          canBackup={Boolean(alternateSource)}
          isBackupActive={activeSource?.id === "backup"}
          hasMovieId={Boolean(session.movieId)}
          fitMode={player.preferences.fitMode}
          fillMode={player.preferences.fillMode}
          orientationMode={player.preferences.orientationMode}
          orientationRequested={fullscreen.active}
          networkMode={player.preferences.networkMode}
          onSeekStart={onSeekStart}
          onSeekMove={onSeekMove}
          onSeekEnd={onSeekEnd}
          onSeekCancel={() => { setDragging(false); setPreviewTime(null); }}
          onKeyboardSeek={player.seekBy}
          onTogglePlay={() => void player.togglePlay()}
          onSeekBack={() => player.seekBy(-player.preferences.seekStep)}
          onSeekForward={() => player.seekBy(player.preferences.seekStep)}
          onToggleMore={() => { setMoreOpen((value) => !value); revealControls(true); }}
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
          onSwitchBackup={() => { if (alternateSource) void player.switchSource(alternateSource.id); }}
          onScreenshot={() => void player.screenshot(`${session.title || "糖果影院截图"}.png`)?.catch(() => {})}
          onReload={() => void player.reload()}
          onPip={() => player.togglePip()}
          onRecenter={() => { player.setFitMode("auto"); player.setFillMode("contain"); }}
          onCopyLink={copyCurrentLink}
          onOpenLink={openCurrentLink}
          onDownload={downloadCurrent}
          onCopyDiagnostic={() => onAction("copy-playback-health-report", { movieId: session.movieId })}
          onBrightnessChange={player.setBrightness}
          onSetNetworkMode={player.setNetworkMode}
          onFocusWithinChange={setControlsFocused}
        />
      </div>
    </div>
  );
}
