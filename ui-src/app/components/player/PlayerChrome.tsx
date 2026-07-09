import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Film,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  PictureInPicture2,
  Play,
  Ratio,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Route,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sun,
  Unlock,
  Volume2,
  VolumeX,
  Zap
} from "lucide-react";
import { formatDuration } from "../../helpers";

export type PlayerMorePanelKey = "line" | "display" | "sound" | "tools";
export type PlayerPreviewOption = {
  key: string;
  label: string;
  url: string;
  hint: string;
};

/** 兼容旧 HUD 字段；完整手势反馈已迁移到 PlayerGestureSystem。 */
export type PlayerGestureHudView = {
  kind: string;
  text: string;
  percent?: number;
};

type CtrlButtonProps = {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  accent?: "sky" | "amber" | "pink" | "emerald" | "rose" | "none";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
};

/** 统一主控按钮：圆角、按压反馈、禁用态、高亮态一套样式，避免各处 class 漂移。 */
export function CtrlButton({
  title,
  onClick,
  disabled,
  active,
  accent = "none",
  size = "md",
  className = "",
  children
}: CtrlButtonProps) {
  const sizeClass = size === "lg" ? "min-h-12 min-w-12 px-2.5 text-xs" : size === "sm" ? "min-h-8 min-w-8 px-2 text-[10px]" : "min-h-10 min-w-10 px-2 text-[11px]";
  const accentClass = active
    ? accent === "amber"
      ? "bg-amber-400/90 text-white shadow-md shadow-amber-500/25"
      : accent === "pink"
        ? "bg-pink-500/90 text-white shadow-md shadow-pink-500/25"
        : accent === "emerald"
          ? "bg-emerald-500/90 text-white shadow-md shadow-emerald-500/25"
          : accent === "rose"
            ? "bg-rose-500/90 text-white shadow-md shadow-rose-500/25"
            : "bg-sky-500 text-white shadow-md shadow-sky-500/30"
    : accent === "sky"
      ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30"
      : accent === "amber"
        ? "bg-amber-400/85 text-white"
        : accent === "pink"
          ? "bg-pink-500/85 text-white"
          : accent === "emerald"
            ? "bg-emerald-400/85 text-white"
            : accent === "rose"
              ? "bg-rose-500/80 text-white"
              : "bg-white/14 text-white hover:bg-white/22";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
      }}
      className={`txzz-player-control-button inline-flex items-center justify-center gap-1 rounded-xl font-medium transition-all duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${sizeClass} ${accentClass} ${className}`}
    >
      {children}
    </button>
  );
}

type ChipProps = {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
};

export function CtrlChip({ active, disabled, title, onClick, children, className = "" }: ChipProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-xl px-2.5 text-[10px] font-medium transition-all active:scale-95 disabled:opacity-40 ${
        active ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30" : "bg-white/12 text-white/90 hover:bg-white/18"
      } ${className}`}
    >
      {children}
    </button>
  );
}

type ProgressProps = {
  duration: number;
  currentTime: number;
  bufferedPercent: number;
  progressPercent: number;
  previewTime: number | null;
  dragging: boolean;
  fullscreen: boolean;
  onSeekStart: (ratio: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekMove: (ratio: number) => void;
  onSeekEnd: (ratio: number) => void;
  onSeekCancel: () => void;
};

export function PlayerProgressBar({
  duration,
  currentTime,
  bufferedPercent,
  progressPercent,
  previewTime,
  dragging,
  fullscreen,
  onSeekStart,
  onSeekMove,
  onSeekEnd,
  onSeekCancel
}: ProgressProps) {
  const shownTime = previewTime !== null ? previewTime : currentTime;
  const shownPercent = duration > 0 && previewTime !== null ? Math.max(0, Math.min(100, Math.round((previewTime / duration) * 100))) : progressPercent;

  const ratioFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  };

  return (
    <div className={`txzz-player-progress-wrap ${fullscreen ? "mb-1.5" : "mb-2.5"}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] tabular-nums text-white/75">
        <span className={previewTime !== null ? "font-semibold text-sky-300" : ""}>{formatDuration(shownTime)}</span>
        <span className="truncate opacity-80">
          {duration ? formatDuration(duration) : "--:--"}
          {!fullscreen && ` · 缓冲 ${bufferedPercent}%`}
        </span>
      </div>
      <div
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(shownTime || 0)}
        title="拖动或点击跳转播放进度"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!duration) return;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          onSeekStart(ratioFromEvent(event), event);
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          if (!dragging || !duration) return;
          onSeekMove(ratioFromEvent(event));
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (!dragging) return;
          onSeekEnd(ratioFromEvent(event));
        }}
        onPointerCancel={onSeekCancel}
        onClick={(event) => event.stopPropagation()}
        className={`txzz-player-progress group/bar relative cursor-pointer rounded-full bg-white/18 transition-all duration-100 ${
          dragging ? "h-3.5" : fullscreen ? "h-3 hover:h-3.5" : "h-2.5 hover:h-3"
        }`}
      >
        {dragging && previewTime !== null && duration > 0 && (
          <div
            className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/88 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/10"
            style={{ left: `${shownPercent}%` }}
          >
            {formatDuration(previewTime)} / {formatDuration(duration)}
          </div>
        )}
        <div className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-white/22" style={{ width: `${bufferedPercent}%` }} />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.5)]"
          style={{ width: `${shownPercent}%` }}
        />
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-2 ring-sky-300/45 transition-transform ${
            dragging ? "scale-110" : "group-hover/bar:scale-105"
          }`}
          style={{ left: `${shownPercent}%` }}
        />
      </div>
    </div>
  );
}

type OverlayProps = {
  holdSeekHint: string;
  gestureHud: PlayerGestureHudView;
  buffering: boolean;
  hasUrl: boolean;
  error: string;
  paused: boolean;
  locked: boolean;
  fullscreen: boolean;
  onPlay: () => void;
  onReload: () => void;
  onSwitchBackup: () => void;
  canSwitchBackup: boolean;
  onUnlock: () => void;
};

export function PlayerOverlays({
  holdSeekHint,
  gestureHud,
  buffering,
  hasUrl,
  error,
  paused,
  locked,
  fullscreen,
  onPlay,
  onReload,
  onSwitchBackup,
  canSwitchBackup,
  onUnlock
}: OverlayProps) {
  return (
    <>
      {holdSeekHint && (
        <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center px-4">
          <div className="txzz-player-gesture-chip max-w-[70%] truncate rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm">
            {holdSeekHint}
          </div>
        </div>
      )}

      {gestureHud.kind && !holdSeekHint && (
        <div className="pointer-events-none absolute inset-0 z-[24] flex items-center justify-center px-6">
          <div className="txzz-player-gesture-hud flex max-w-[min(12rem,72vw)] items-center gap-2 rounded-2xl bg-black/65 px-3 py-2 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-sm">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12">
              {gestureHud.kind === "volume" && ((gestureHud.percent || 0) <= 0 ? <VolumeX size={14} /> : <Volume2 size={14} />)}
              {gestureHud.kind === "brightness" && <Sun size={14} />}
              {gestureHud.kind === "seek-back" && <ChevronLeft size={16} />}
              {gestureHud.kind === "seek-forward" && <ChevronRight size={16} />}
              {gestureHud.kind === "lock" && <Lock size={13} />}
              {gestureHud.kind === "unlock" && <Unlock size={13} />}
              {gestureHud.kind === "rate" && <Zap size={14} />}
            </div>
            <div className="min-w-0">
              <span className="block truncate text-[11px] font-semibold tracking-wide">{gestureHud.text}</span>
              {typeof gestureHud.percent === "number" && (
                <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-white/18">
                  <div
                    className={`h-full rounded-full transition-all duration-100 ${
                      gestureHud.kind === "brightness"
                        ? "bg-amber-300"
                        : gestureHud.kind === "seek-back" || gestureHud.kind === "seek-forward"
                          ? "bg-emerald-300"
                          : gestureHud.kind === "rate"
                            ? "bg-violet-300"
                            : "bg-sky-400"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, gestureHud.percent))}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {buffering && hasUrl && !error && (
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/55 px-5 py-4 backdrop-blur">
            <div className="txzz-player-spinner" />
            <span className="text-[11px] font-medium text-white/85">缓冲中…</span>
          </div>
        </div>
      )}

      {hasUrl && paused && !buffering && !error && !locked && (
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPlay();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            className="pointer-events-auto flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-black/55 text-white shadow-xl ring-1 ring-white/25 backdrop-blur transition-transform hover:scale-105 active:scale-95"
            title="播放"
          >
            <Play size={28} className="ml-1 fill-white" />
          </button>
        </div>
      )}

      {hasUrl && error && paused && !buffering && !locked && (
        <div className="pointer-events-none absolute inset-0 z-[16] flex items-center justify-center p-4">
          <div className="pointer-events-auto w-full max-w-xs rounded-2xl bg-black/78 p-4 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <Activity size={22} className="mx-auto mb-2 text-amber-300" />
            <p className="mb-3 text-[11px] leading-relaxed text-white/85">{error}</p>
            <div className="grid grid-cols-2 gap-2">
              <CtrlButton title="重载播放" accent="sky" size="sm" onClick={onReload} className="w-full">
                <RefreshCw size={12} /> 重载播放
              </CtrlButton>
              <CtrlButton title="切换备用线路" accent="emerald" size="sm" disabled={!canSwitchBackup} onClick={onSwitchBackup} className="w-full">
                <Route size={12} /> 切换备用
              </CtrlButton>
            </div>
          </div>
        </div>
      )}

      {fullscreen && locked && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUnlock();
          }}
          className="txzz-player-unlock-fab absolute bottom-[max(18px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] z-30 flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-xl ring-1 ring-white/25 backdrop-blur transition-transform active:scale-95"
          title="解锁控制层"
        >
          <Unlock size={18} />
        </button>
      )}
    </>
  );
}

export type PlayerControlBarProps = {
  visible: boolean;
  locked: boolean;
  disabled: boolean;
  fullscreen: boolean;
  controlsTone: string;
  iconSize: number;
  buttonSize: "md" | "lg";
  paused: boolean;
  currentTime: number;
  duration: number;
  bufferedPercent: number;
  progressPercent: number;
  progressPreviewTime: number | null;
  isDraggingProgress: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  seekStep: number;
  qualityLabel: string;
  fillLabel: string;
  fitLabel: string;
  orientationLabel: string;
  brightness: number;
  moreOpen: boolean;
  morePanel: PlayerMorePanelKey;
  volumeOpen: boolean;
  rateOpen: boolean;
  previewOptions: PlayerPreviewOption[];
  activePreviewKey: string;
  previewSourceLabel: string;
  playerStatus: string;
  currentLineLabel: string;
  fullscreenDiagnosticLabel: string;
  rateOptions: number[];
  seekStepOptions: number[];
  qualities: { level: number; label: string }[];
  qualityLevel: number;
  canBackup: boolean;
  isBackupActive: boolean;
  hasMovieId: boolean;
  fitMode: "auto" | "wide" | "vertical";
  fillMode: "contain" | "cover" | "fill";
  orientationMode: "auto" | "landscape" | "portrait";
  orientationRequested: boolean;
  onSeekStart: (ratio: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekMove: (ratio: number) => void;
  onSeekEnd: (ratio: number) => void;
  onSeekCancel: () => void;
  onTogglePlay: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onToggleMore: () => void;
  onToggleLock: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleVolumePanel: () => void;
  onToggleRatePanel: () => void;
  onSetRate: (rate: number) => void;
  onSetSeekStep: (step: number) => void;
  onSetMorePanel: (panel: PlayerMorePanelKey) => void;
  onSelectPreview: (key: string) => void;
  onCycleQuality: () => void;
  onSetQuality: (level: number) => void;
  onCycleFit: () => void;
  onCycleFill: () => void;
  onCycleOrientation: () => void;
  onSwitchBackup: () => void;
  onScreenshot: () => void;
  onReload: () => void;
  onPip: () => void;
  onRecenter: () => void;
  onCopyLink: () => void;
  onOpenLink: () => void;
  onDownload: () => void;
  onCopyDiagnostic: () => void;
  onBrightnessChange: (value: number) => void;
  /** 横屏矮屏紧凑模式：隐藏快捷条与多余文案，避免控制栏占满半屏。 */
  compact?: boolean;
};

export function PlayerControlBar(props: PlayerControlBarProps) {
  const {
    visible,
    locked,
    disabled,
    fullscreen,
    controlsTone,
    iconSize,
    buttonSize,
    paused,
    currentTime,
    duration,
    bufferedPercent,
    progressPercent,
    progressPreviewTime,
    isDraggingProgress,
    volume,
    muted,
    rate,
    seekStep,
    qualityLabel,
    fillLabel,
    fitLabel,
    orientationLabel,
    brightness,
    moreOpen,
    morePanel,
    volumeOpen,
    rateOpen,
    previewOptions,
    activePreviewKey,
    previewSourceLabel,
    playerStatus,
    currentLineLabel,
    fullscreenDiagnosticLabel,
    rateOptions,
    seekStepOptions,
    qualities,
    qualityLevel,
    canBackup,
    isBackupActive,
    hasMovieId,
    fitMode,
    fillMode,
    orientationMode,
    orientationRequested,
    onSeekStart,
    onSeekMove,
    onSeekEnd,
    onSeekCancel,
    onTogglePlay,
    onSeekBack,
    onSeekForward,
    onToggleMore,
    onToggleLock,
    onToggleFullscreen,
    onToggleMute,
    onVolumeChange,
    onToggleVolumePanel,
    onToggleRatePanel,
    onSetRate,
    onSetSeekStep,
    onSetMorePanel,
    onSelectPreview,
    onCycleQuality,
    onSetQuality,
    onCycleFit,
    onCycleFill,
    onCycleOrientation,
    onSwitchBackup,
    onScreenshot,
    onReload,
    onPip,
    onRecenter,
    onCopyLink,
    onOpenLink,
    onDownload,
    onCopyDiagnostic,
    onBrightnessChange,
    compact = false
  } = props;

  const volumePercent = muted ? 0 : Math.round(volume * 100);
  const showLabels = !compact;
  const showQuickRow = !compact;

  return (
    <div
      className={`txzz-player-control-panel absolute ${controlsTone} z-20 text-white transition-all duration-200 ${compact ? "txzz-player-control-panel--compact" : ""} ${
        visible && !locked ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <PlayerProgressBar
        duration={duration}
        currentTime={currentTime}
        bufferedPercent={bufferedPercent}
        progressPercent={progressPercent}
        previewTime={progressPreviewTime}
        dragging={isDraggingProgress}
        fullscreen={fullscreen || compact}
        onSeekStart={onSeekStart}
        onSeekMove={onSeekMove}
        onSeekEnd={onSeekEnd}
        onSeekCancel={onSeekCancel}
      />

      {/* 主控：左播放 · 右功能，中间不塞状态文案，避免横屏中间大片空白。 */}
      <div className="txzz-player-control-row flex w-full items-center justify-between gap-1.5">
        <div className="txzz-player-control-left flex shrink-0 items-center gap-1">
          <CtrlButton title={paused ? "播放" : "暂停"} disabled={disabled} size={buttonSize} onClick={onTogglePlay} className="shrink-0">
            {paused ? <Play size={iconSize} className="fill-white" /> : <Pause size={iconSize} />}
            {showLabels && <span className="hidden lg:inline">{paused ? "播放" : "暂停"}</span>}
          </CtrlButton>
          <CtrlButton title={`后退 ${seekStep} 秒`} disabled={disabled} size={buttonSize} onClick={onSeekBack} className="shrink-0">
            <SkipBack size={iconSize} />
            <span className="tabular-nums text-[10px]">-{seekStep}</span>
          </CtrlButton>
          <CtrlButton title={`前进 ${seekStep} 秒`} disabled={disabled} size={buttonSize} onClick={onSeekForward} className="shrink-0">
            <SkipForward size={iconSize} />
            <span className="tabular-nums text-[10px]">+{seekStep}</span>
          </CtrlButton>
        </div>

        <div className="txzz-player-control-right flex shrink-0 items-center gap-1">
          <div className="relative">
            <CtrlButton
              title={muted ? "取消静音" : "调节音量"}
              disabled={disabled}
              size={buttonSize}
              active={volumeOpen || muted}
              accent={muted ? "rose" : volumeOpen ? "sky" : "none"}
              onClick={onToggleVolumePanel}
              className="shrink-0"
            >
              {muted || volumePercent <= 0 ? <VolumeX size={iconSize} /> : <Volume2 size={iconSize} />}
              {showLabels && <span className="hidden tabular-nums xl:inline">{volumePercent}%</span>}
            </CtrlButton>
            {volumeOpen && (
              <div
                className="absolute bottom-[calc(100%+8px)] right-0 z-30 w-44 rounded-2xl bg-black/82 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between text-[10px] text-white/75">
                  <span>音量</span>
                  <button type="button" className="rounded-lg bg-white/10 px-2 py-0.5 hover:bg-white/16" onClick={onToggleMute}>
                    {muted ? "取消静音" : "静音"}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volumePercent}
                  onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                  className="txzz-player-range w-full accent-sky-400"
                  title="调节播放音量"
                />
              </div>
            )}
          </div>

          <div className="relative">
            <CtrlButton
              title="切换倍速"
              disabled={disabled}
              size={buttonSize}
              active={rateOpen || rate !== 1}
              accent={rateOpen || rate !== 1 ? "amber" : "none"}
              onClick={onToggleRatePanel}
              className="shrink-0 min-w-[3.25rem]"
            >
              <Zap size={iconSize - 1} />
              <span className="tabular-nums">{rate}x</span>
            </CtrlButton>
            {rateOpen && (
              <div
                className="absolute bottom-[calc(100%+8px)] right-0 z-30 grid w-40 grid-cols-3 gap-1.5 rounded-2xl bg-black/82 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {rateOptions.map((item) => (
                  <CtrlChip key={item} active={rate === item} onClick={() => onSetRate(item)} title={`倍速 ${item}x`}>
                    {item}x
                  </CtrlChip>
                ))}
              </div>
            )}
          </div>

          <CtrlButton
            title="更多功能"
            disabled={disabled}
            size={buttonSize}
            active={moreOpen}
            accent={moreOpen ? "amber" : "none"}
            onClick={onToggleMore}
            className="shrink-0"
          >
            <MoreHorizontal size={iconSize} />
            {showLabels && <span className="hidden lg:inline">菜单</span>}
          </CtrlButton>

          {fullscreen && !compact && (
            <CtrlButton title="锁定控制层" disabled={disabled} size={buttonSize} onClick={onToggleLock} className="shrink-0">
              <Lock size={iconSize} />
            </CtrlButton>
          )}

          <CtrlButton
            title={fullscreen ? "退出全屏" : "进入全屏"}
            disabled={disabled}
            size={buttonSize}
            accent="sky"
            onClick={onToggleFullscreen}
            className="shrink-0"
          >
            {fullscreen ? <Minimize2 size={iconSize} /> : <Maximize2 size={iconSize} />}
            {showLabels && <span className="hidden lg:inline">{fullscreen ? "退出" : "全屏"}</span>}
          </CtrlButton>
        </div>
      </div>

      {/* 快捷条：横屏矮屏隐藏，避免控制区占掉大半画面。 */}
      {showQuickRow && (
        <div className="txzz-player-quick-row mt-2 flex flex-wrap items-center gap-1.5">
          <CtrlChip active title="当前清晰度" disabled={disabled || !qualities.length} onClick={onCycleQuality}>
            <SlidersHorizontal size={11} /> {qualityLabel}
          </CtrlChip>
          <CtrlChip title="画面填充" disabled={disabled} onClick={onCycleFill}>
            <Layers size={11} /> {fillLabel}
          </CtrlChip>
          <CtrlChip title="快进步长" disabled={disabled} onClick={() => {
            const index = seekStepOptions.indexOf(seekStep);
            onSetSeekStep(seekStepOptions[(index + 1) % seekStepOptions.length]);
          }}>
            <SkipForward size={11} /> {seekStep}秒
          </CtrlChip>
          {canBackup && (
            <CtrlChip title="切换备用线路" disabled={disabled || isBackupActive} onClick={onSwitchBackup} className={isBackupActive ? "" : "bg-emerald-500/25"}>
              <Route size={11} /> 备用
            </CtrlChip>
          )}
        </div>
      )}

      {moreOpen && (
        <div className="txzz-player-more-sheet mt-2 rounded-2xl bg-black/50 p-2 ring-1 ring-white/8 backdrop-blur-sm">
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {[
              { key: "line" as const, label: "线路", icon: Route },
              { key: "display" as const, label: "画面", icon: Ratio },
              { key: "sound" as const, label: "声音", icon: muted ? VolumeX : Volume2 },
              { key: "tools" as const, label: "工具", icon: SlidersHorizontal }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <CtrlChip key={item.key} active={morePanel === item.key} onClick={() => onSetMorePanel(item.key)} title={item.label}>
                  <Icon size={11} /> {item.label}
                </CtrlChip>
              );
            })}
          </div>

          {morePanel === "line" && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {previewOptions.map((item) => (
                  <CtrlChip
                    key={item.key}
                    active={activePreviewKey === item.key}
                    disabled={!item.url}
                    title={`切换到${item.label}`}
                    onClick={() => onSelectPreview(item.key)}
                    className="min-h-12 flex-col !items-stretch py-1.5"
                  >
                    <span className="text-center font-semibold">{item.label}</span>
                    <span className="truncate text-center text-[9px] opacity-70">{item.hint}</span>
                  </CtrlChip>
                ))}
              </div>
              {qualities.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  <CtrlChip active={qualityLevel < 0} onClick={() => onSetQuality(-1)} title="自动清晰度">
                    自动
                  </CtrlChip>
                  {qualities.map((item) => (
                    <CtrlChip key={item.level} active={qualityLevel === item.level} onClick={() => onSetQuality(item.level)} title={item.label}>
                      {item.label}
                    </CtrlChip>
                  ))}
                </div>
              )}
              <p className="truncate rounded-xl bg-white/8 px-2.5 py-1.5 text-[9px] text-white/65">
                状态：{previewSourceLabel} · {playerStatus} · {qualityLabel}
              </p>
            </div>
          )}

          {morePanel === "display" && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {rateOptions.map((item) => (
                  <CtrlChip key={item} active={rate === item} onClick={() => onSetRate(item)} title={`倍速 ${item}x`}>
                    {item}x
                  </CtrlChip>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {seekStepOptions.map((item) => (
                  <CtrlChip key={item} active={seekStep === item} onClick={() => onSetSeekStep(item)} title={`步长 ${item} 秒`}>
                    {item}秒
                  </CtrlChip>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <CtrlChip onClick={onCycleFit} disabled={disabled} title="画面比例">
                  {fitMode === "vertical" ? <RectangleVertical size={11} /> : fitMode === "wide" ? <RectangleHorizontal size={11} /> : <Ratio size={11} />} {fitLabel}
                </CtrlChip>
                <CtrlChip onClick={onCycleFill} disabled={disabled} title="填充模式">
                  <Layers size={11} /> {fillLabel}
                </CtrlChip>
                <CtrlChip onClick={onCycleOrientation} disabled={disabled} title="观看方向">
                  {orientationRequested || orientationMode === "landscape" ? <RectangleHorizontal size={11} /> : <RectangleVertical size={11} />} {orientationLabel}
                </CtrlChip>
                <CtrlChip onClick={onScreenshot} disabled={disabled} title="截图">
                  <Film size={11} /> 截图
                </CtrlChip>
              </div>
            </div>
          )}

          {morePanel === "sound" && (
            <div className="space-y-3 rounded-xl bg-white/8 p-2.5">
              <div className="flex items-center gap-2">
                <CtrlButton title={muted ? "取消静音" : "静音"} size="sm" accent={muted ? "rose" : "none"} onClick={onToggleMute} disabled={disabled}>
                  {muted ? <VolumeX size={12} /> : <Volume2 size={12} />} {muted ? "静音" : "声音"}
                </CtrlButton>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volumePercent}
                  onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="txzz-player-range min-w-0 flex-1 accent-sky-400"
                  title="调节播放音量"
                />
                <span className="w-10 text-right text-[10px] tabular-nums text-white/75">{volumePercent}%</span>
              </div>
              <div className="flex items-center gap-2 border-t border-white/10 pt-2">
                <span className="flex w-16 items-center justify-center gap-1 rounded-xl bg-white/12 px-2 py-1.5 text-[10px] font-medium text-white">
                  <Sun size={11} /> 亮度
                </span>
                <input
                  type="range"
                  min={60}
                  max={140}
                  step={5}
                  value={brightness}
                  onChange={(event) => onBrightnessChange(Number(event.target.value))}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="txzz-player-range min-w-0 flex-1 accent-amber-300"
                  title="调节画面亮度"
                />
                <span className="w-10 text-right text-[10px] tabular-nums text-white/75">{brightness}%</span>
              </div>
              <p className="text-[9px] leading-relaxed text-white/55">
                快捷键：空格/K 播放 · ←/→ 快退快进 · ↑/↓ 音量 · M 静音 · F 全屏 · L 锁屏
                <br />
                手势：单击显隐控制 · 中双击播放暂停 · 左/右双击快退快进 · 长按左快退/右倍速
                <br />
                滑动：横向调进度 · 左半屏竖滑亮度 · 右半屏竖滑音量 · 滚轮音量 · Shift+滚轮亮度
              </p>
            </div>
          )}

          {morePanel === "tools" && (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              <CtrlChip onClick={onReload} disabled={disabled} title="重载播放器">
                <RefreshCw size={11} /> 重载
              </CtrlChip>
              <CtrlChip onClick={onPip} disabled={disabled} title="画中画">
                <PictureInPicture2 size={11} /> 画中画
              </CtrlChip>
              <CtrlChip onClick={onRecenter} disabled={disabled} title="全屏居中校准" className="bg-sky-500/25">
                <Ratio size={11} /> 居中
              </CtrlChip>
              <CtrlChip onClick={onCopyLink} disabled={disabled} title="复制完整链接">
                <Copy size={11} /> 复制
              </CtrlChip>
              <CtrlChip onClick={onOpenLink} disabled={disabled} title="打开完整链接">
                <ExternalLink size={11} /> 打开
              </CtrlChip>
              <CtrlChip onClick={onDownload} disabled={!hasMovieId} title="下载当前视频" className="bg-pink-500/25">
                <Download size={11} /> 下载
              </CtrlChip>
              <CtrlChip onClick={onCopyDiagnostic} disabled={disabled} title="复制诊断报告">
                <Activity size={11} /> 诊断
              </CtrlChip>
              <CtrlChip onClick={onSwitchBackup} disabled={!canBackup || isBackupActive} title="切换备用线路">
                <Route size={11} /> 备用
              </CtrlChip>
            </div>
          )}

          <p className="mt-2 truncate text-[9px] text-white/50">
            当前：{currentLineLabel} · {rate}x · {muted ? "静音" : `${volumePercent}%`} · 步长{seekStep}秒 · {fitLabel} · {fillLabel} · {orientationLabel} · 亮度{brightness}% · {qualityLabel}
            {fullscreen ? ` · ${fullscreenDiagnosticLabel}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export type PlayerTopBarProps = {
  visible: boolean;
  locked: boolean;
  fullscreen: boolean;
  title: string;
  status: string;
  hasUrl: boolean;
  fillLabel: string;
  metaVisible: boolean;
  diagnosticLabel: string;
  diagnosticOk: boolean;
  resumeTip: string;
  error: string;
  onBack: () => void;
};

export function PlayerTopBar({
  visible,
  locked,
  fullscreen,
  title,
  status,
  hasUrl,
  fillLabel,
  metaVisible,
  diagnosticLabel,
  diagnosticOk,
  resumeTip,
  error,
  onBack
}: PlayerTopBarProps) {
  return (
    <div
      className={`txzz-player-top-bar pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/82 via-black/30 to-transparent px-3 pb-10 pt-[max(10px,env(safe-area-inset-top))] text-white transition-opacity duration-200 sm:px-5 ${
        visible && !locked ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {fullscreen && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onBack();
              }}
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/45 text-white shadow-sm ring-1 ring-white/15 backdrop-blur transition-transform active:scale-95"
              title="退出全屏"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="min-w-0 rounded-full bg-black/42 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur">
            <span className="block max-w-[12rem] truncate sm:max-w-[28rem]">{title}</span>
          </div>
        </div>
        <div className={`flex shrink-0 flex-wrap justify-end gap-1 transition-opacity duration-200 ${fullscreen && !metaVisible && !error ? "opacity-0" : "opacity-100"}`}>
          <span className={`rounded-full px-2.5 py-1 text-[10px] backdrop-blur ${hasUrl ? "bg-emerald-500/75" : "bg-rose-500/75"}`}>{status}</span>
          {fullscreen && <span className="rounded-full bg-sky-500/75 px-2.5 py-1 text-[10px] backdrop-blur">全屏 · {fillLabel}</span>}
          {fullscreen && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] backdrop-blur ${diagnosticOk ? "bg-black/40" : "bg-amber-500/85"}`} title={diagnosticLabel}>
              {diagnosticLabel}
            </span>
          )}
        </div>
      </div>
      {(resumeTip || error) && (
        <div className="mt-1.5 max-w-full rounded-xl bg-black/45 px-2.5 py-1.5 text-[10px] leading-relaxed text-white/85 backdrop-blur">
          {resumeTip && <span className="mr-2 text-emerald-200">{resumeTip}</span>}
          {error && <span className="text-rose-200">{error}</span>}
        </div>
      )}
    </div>
  );
}

export function playerChromeStyleVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}
