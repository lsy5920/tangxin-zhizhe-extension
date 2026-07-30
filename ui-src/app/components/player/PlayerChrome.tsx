import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Zap
} from "lucide-react";
import { CtrlButton, PlayerProgressBar } from "./PlayerControls";
import { PlayerMenuSheet, type PlayerMorePanelKey, type PlayerPreviewOption } from "./PlayerMenuSheet";
import type { PlayerGestureLayout } from "../../playback/gestureLayout";
import type { PlaybackSource } from "../../playback/types";

export { PlayerContextMenu, PlayerOverlays, PlayerTopBar } from "./PlayerStatusOverlays";
export type { PlayerMorePanelKey, PlayerPreviewOption } from "./PlayerMenuSheet";

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
  markers?: Array<{ id: string; time: number; label?: string }>;
  progressPreviewTime: number | null;
  previewSource?: PlaybackSource | null;
  previewSessionKey: string;
  previewFallbackVideo?: HTMLVideoElement | null;
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
  fitMode: "auto" | "wide" | "vertical";
  orientationMode: "auto" | "landscape" | "portrait";
  orientationRequested: boolean;
  networkMode: "data-saver" | "balanced" | "high-quality";
  gestureLayout: PlayerGestureLayout;
  onSeekStart: (ratio: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekMove: (ratio: number) => void;
  onSeekEnd: (ratio: number) => void;
  onSeekCancel: () => void;
  onKeyboardSeek: (seconds: number) => void;
  onMarkerSelect?: (id: string, time: number) => void;
  onTogglePlay: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onToggleMore: () => void;
  onCloseMore: () => void;
  onToggleLock: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onCycleRate: () => void;
  onSetRate: (rate: number) => void;
  onSetSeekStep: (step: number) => void;
  onSetMorePanel: (panel: PlayerMorePanelKey) => void;
  onSelectPreview: (key: string) => void;
  onSetQuality: (level: number) => void;
  onCycleFit: () => void;
  onCycleFill: () => void;
  onCycleOrientation: () => void;
  onScreenshot: () => void;
  onReload: () => void;
  onPip: () => void;
  onRecenter: () => void;
  onCopyDiagnostic: () => void;
  onBrightnessChange: (value: number) => void;
  onFocusWithinChange?: (focused: boolean) => void;
  onSetNetworkMode: (mode: "data-saver" | "balanced" | "high-quality") => void;
  onSetGestureLayout: (layout: PlayerGestureLayout) => void;
  compact?: boolean;
};

/**
 * 播放器悬浮控制层。
 * 高频动作固定在主控栏，低频能力进入片源、观看、工具三类设置，避免重复入口互相覆盖。
 */
export function PlayerControlBar(props: PlayerControlBarProps) {
  const {
    visible, locked, disabled, fullscreen, controlsTone, iconSize, buttonSize, compact = false,
    paused, currentTime, duration, bufferedPercent, progressPercent, markers, progressPreviewTime, previewSource, previewSessionKey, previewFallbackVideo,
    isDraggingProgress, volume, muted, rate, seekStep, qualityLabel, fillLabel, fitLabel,
    orientationLabel, brightness, moreOpen, morePanel, previewOptions, activePreviewKey,
    previewSourceLabel, playerStatus, currentLineLabel, fullscreenDiagnosticLabel,
    rateOptions, seekStepOptions, qualities, qualityLevel,
    fitMode, orientationMode, orientationRequested, networkMode, gestureLayout, onSeekStart, onSeekMove,
    onSeekEnd, onSeekCancel, onKeyboardSeek, onMarkerSelect, onTogglePlay, onSeekBack, onSeekForward,
    onToggleMore, onCloseMore, onToggleLock, onToggleFullscreen, onToggleMute,
    onVolumeChange, onCycleRate, onSetRate, onSetSeekStep, onSetMorePanel, onSelectPreview,
    onSetQuality, onCycleFit, onCycleFill, onCycleOrientation, onScreenshot,
    onReload, onPip, onRecenter, onCopyDiagnostic,
    onBrightnessChange, onFocusWithinChange, onSetNetworkMode, onSetGestureLayout
  } = props;
  const volumePercent = muted ? 0 : Math.round(volume * 100);
  const controlsInactive = !visible || locked;

  return (
    <div
      aria-hidden={controlsInactive}
      {...(controlsInactive ? { inert: "" } : {})}
      onFocusCapture={() => onFocusWithinChange?.(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusWithinChange?.(false);
      }}
      className={`txzz-player-control-panel absolute ${controlsTone} ${moreOpen ? "z-[38]" : "z-20"} text-white transition-all duration-200 ${compact ? "txzz-player-control-panel--compact" : ""} ${
        visible && !locked ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <PlayerMenuSheet
        open={moreOpen}
        panel={morePanel}
        disabled={disabled}
        fullscreen={fullscreen}
        muted={muted}
        volume={volume}
        rate={rate}
        seekStep={seekStep}
        brightness={brightness}
        rateOptions={rateOptions}
        seekStepOptions={seekStepOptions}
        qualities={qualities}
        qualityLevel={qualityLevel}
        qualityLabel={qualityLabel}
        previewOptions={previewOptions}
        activePreviewKey={activePreviewKey}
        previewSourceLabel={previewSourceLabel}
        playerStatus={playerStatus}
        currentLineLabel={currentLineLabel}
        fillLabel={fillLabel}
        fitLabel={fitLabel}
        orientationLabel={orientationLabel}
        fullscreenDiagnosticLabel={fullscreenDiagnosticLabel}
        fitMode={fitMode}
        orientationMode={orientationMode}
        orientationRequested={orientationRequested}
        networkMode={networkMode}
        gestureLayout={gestureLayout}
        onClose={onCloseMore}
        onSetPanel={onSetMorePanel}
        onSelectPreview={onSelectPreview}
        onSetQuality={onSetQuality}
        onSetRate={onSetRate}
        onSetSeekStep={onSetSeekStep}
        onCycleFit={onCycleFit}
        onCycleFill={onCycleFill}
        onCycleOrientation={onCycleOrientation}
        onVolumeChange={onVolumeChange}
        onBrightnessChange={onBrightnessChange}
        onScreenshot={onScreenshot}
        onReload={onReload}
        onPip={onPip}
        onRecenter={onRecenter}
        onDiagnostic={onCopyDiagnostic}
        onSetNetworkMode={onSetNetworkMode}
        onSetGestureLayout={onSetGestureLayout}
      />

      <PlayerProgressBar
        duration={duration}
        currentTime={currentTime}
        bufferedPercent={bufferedPercent}
        progressPercent={progressPercent}
        previewTime={progressPreviewTime}
        previewSource={previewSource}
        previewSessionKey={previewSessionKey}
        previewFallbackVideo={previewFallbackVideo}
        dragging={isDraggingProgress}
        fullscreen={fullscreen || compact}
        seekStep={seekStep}
        lineLabel={currentLineLabel}
        qualityLabel={qualityLabel}
        markers={markers}
        onMarkerSelect={onMarkerSelect}
        onSeekStart={onSeekStart}
        onSeekMove={onSeekMove}
        onSeekEnd={onSeekEnd}
        onSeekCancel={onSeekCancel}
        onKeyboardSeek={onKeyboardSeek}
      />

      <div className="txzz-player-control-row flex w-full items-center justify-between gap-2">
        <div className="txzz-player-control-left flex min-w-0 items-center gap-1.5">
          <CtrlButton title={paused ? "播放（空格/K）" : "暂停（空格/K）"} disabled={disabled} size={buttonSize} onClick={onTogglePlay}>
            {paused ? <Play size={iconSize + 1} className="fill-white" /> : <Pause size={iconSize + 1} className="fill-white" />}
          </CtrlButton>
          <CtrlButton title={`后退 ${seekStep} 秒（←）`} disabled={disabled} size={buttonSize} onClick={onSeekBack}>
            <SkipBack size={iconSize} />
            <span className="tabular-nums text-[10px]">{seekStep}</span>
          </CtrlButton>
          <CtrlButton title={`前进 ${seekStep} 秒（→）`} disabled={disabled} size={buttonSize} onClick={onSeekForward}>
            <SkipForward size={iconSize} />
            <span className="tabular-nums text-[10px]">{seekStep}</span>
          </CtrlButton>
        </div>

        <div className="txzz-player-control-right flex shrink-0 items-center gap-1.5">
          <CtrlButton
            title={muted ? "取消静音（M）" : `静音（当前 ${volumePercent}%）`}
            disabled={disabled}
            size={buttonSize}
            active={muted}
            accent={muted ? "rose" : "none"}
            onClick={onToggleMute}
            className="txzz-player-control-secondary"
          >
            {muted || volumePercent <= 0 ? <VolumeX size={iconSize} /> : <Volume2 size={iconSize} />}
          </CtrlButton>
          <CtrlButton
            title={`切换倍速（当前 ${rate}x）`}
            disabled={disabled}
            size={buttonSize}
            active={rate !== 1}
            accent={rate !== 1 ? "amber" : "none"}
            onClick={onCycleRate}
            className="txzz-player-control-secondary min-w-[3.5rem]"
          >
            <Zap size={iconSize - 1} />
            <span className="tabular-nums">{rate}x</span>
          </CtrlButton>
          <CtrlButton
            title="打开播放器设置"
            disabled={disabled}
            size={buttonSize}
            active={moreOpen}
            onClick={onToggleMore}
          >
            <SlidersHorizontal size={iconSize} />
            {!compact && <span className="hidden xl:inline">设置</span>}
          </CtrlButton>
          {fullscreen && (
            <CtrlButton title="锁定播放器控制（L）" disabled={disabled} size={buttonSize} onClick={onToggleLock}>
              <Lock size={iconSize} />
            </CtrlButton>
          )}
          <CtrlButton
            title={fullscreen ? "退出全屏（F/Esc）" : "进入全屏（F）"}
            disabled={disabled}
            size={buttonSize}
            accent="sky"
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <Minimize2 size={iconSize + 1} /> : <Maximize2 size={iconSize + 1} />}
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

export function playerChromeStyleVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}
