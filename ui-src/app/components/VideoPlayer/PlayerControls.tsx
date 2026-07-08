import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Settings,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  MonitorPlay,
  LayoutTemplate
} from "lucide-react";
import type { PlayerControlsState, PlayerFullscreenDiagnostic } from "./types";
import type { PlayerOrientationMode } from "./types";
import type { PlayerEngine } from "./engines/types";
import { PlayerProgressBar } from "./PlayerProgressBar";
import { PlayerSettingsMenu } from "./PlayerSettingsMenu";
import { formatDuration } from "../../helpers";

type Props = {
  playerState: PlayerControlsState;
  fullscreenActive: boolean;
  immersive: boolean;
  pipActive: boolean;
  diagnostic: PlayerFullscreenDiagnostic;
  currentEngine: PlayerEngine;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onRateChange: (rate: number) => void;
  onQualityChange: (level: number) => void;
  onEngineChange: (engine: PlayerEngine) => void;
  onRequestFullscreen: () => void;
  onExitFullscreen: () => void;
  onToggleImmersive: () => void;
  onRequestPip: () => void;
  onExitPip: () => void;
  onOrientationModeChange?: (mode: PlayerOrientationMode) => void;
};

const ENGINE_LABELS: Record<PlayerEngine, string> = {
  artplayer: "Artplayer",
  xgplayer: "西瓜播放器"
};

/**
 * 播放器控制层组件（重构版）
 *
 * 新增功能：
 * - 画中画切换按钮
 * - 沉浸模式切换
 * - 播放器引擎切换（引擎快捷标签）
 * - 全屏状态信息栏优化
 * - 控制栏自动隐藏动画流畅化
 */
export function PlayerControls({
  playerState,
  fullscreenActive,
  immersive,
  pipActive,
  diagnostic,
  currentEngine,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onRateChange,
  onQualityChange,
  onEngineChange,
  onRequestFullscreen,
  onExitFullscreen,
  onToggleImmersive,
  onRequestPip,
  onExitPip,
  onOrientationModeChange
}: Props) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [showEngineTag, setShowEngineTag] = useState(false);
  const hideTimer = useRef<number>();
  const cursorTimer = useRef<number>();

  const { currentTime, duration, buffered, paused, volume, muted, rate, seekStep, qualities, currentQuality } = playerState;

  // 暂停、有错误、开着设置时不自动隐藏
  const shouldStayVisible = paused || settingsOpen || Boolean(playerState.error);

  const resetHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (cursorTimer.current) clearTimeout(cursorTimer.current);
    setControlsVisible(true);
    setCursorHidden(false);

    if (!shouldStayVisible) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3500);
      cursorTimer.current = window.setTimeout(() => setCursorHidden(true), 3500);
    }
  };

  // 鼠标/触摸移动时显示控制层
  useEffect(() => {
    const handleActivity = () => resetHideTimer();
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("touchstart", handleActivity);
    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, [shouldStayVisible]);

  useEffect(() => { resetHideTimer(); }, [paused, settingsOpen, playerState.error]);

  const handleSeekBackward = () => onSeek(Math.max(0, currentTime - seekStep));
  const handleSeekForward = () => onSeek(Math.min(duration, currentTime + seekStep));

  const handleToggleMute = () => {
    onVolumeChange(muted ? (volume || 0.8) : 0);
  };

  const handleFullscreenToggle = () => {
    if (fullscreenActive) onExitFullscreen();
    else onRequestFullscreen();
  };

  const handleImmersiveToggle = () => {
    onToggleImmersive();
  };

  const handlePipToggle = () => {
    if (pipActive) onExitPip();
    else onRequestPip();
  };

  // 切换播放器引擎时短暂显示引擎标签
  const handleEngineToggle = () => {
    const next: PlayerEngine = currentEngine === "artplayer" ? "xgplayer" : "artplayer";
    onEngineChange(next);
    setShowEngineTag(true);
    setTimeout(() => setShowEngineTag(false), 2000);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      className={[
        "absolute inset-0 z-20 transition-opacity duration-300 select-none",
        controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        cursorHidden ? "cursor-none" : ""
      ].join(" ")}
    >
      {/* 顶部渐变 */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)" }}
      />
      {/* 底部渐变 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-36 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)" }}
      />

      {/* ——— 顶部信息栏（全屏模式） ——— */}
      {(fullscreenActive || immersive) && (
        <div className="absolute top-0 left-0 right-0 px-5 pt-4 flex items-start justify-between pointer-events-none z-10">
          {/* 全屏诊断信息 */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: diagnostic.ok ? "#34d399" : "#fbbf24" }}
            />
            <span className="text-white/80 text-xs">
              {diagnostic.ok
                ? `${diagnostic.source} · 覆盖 ${diagnostic.coverage}%`
                : `${diagnostic.issue} · ${diagnostic.coverage}%`}
            </span>
          </div>

          {/* 引擎切换标签 */}
          {showEngineTag && (
            <div className="px-3 py-1.5 bg-pink-600/80 backdrop-blur-sm rounded-lg text-white text-xs font-medium animate-pulse">
              切换至 {ENGINE_LABELS[currentEngine]}
            </div>
          )}
        </div>
      )}

      {/* ——— 底部主控制栏 ——— */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
        {/* 进度条 */}
        <PlayerProgressBar
          progress={progress}
          buffered={bufferedProgress}
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
        />

        {/* 控制按钮行 */}
        <div className="flex items-center justify-between mt-3">
          {/* ——— 左侧：播放控制 + 时间 ——— */}
          <div className="flex items-center gap-2">
            {/* 后退 */}
            <button
              onClick={handleSeekBackward}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
              title={`后退 ${seekStep} 秒`}
            >
              <SkipBack className="w-5 h-5 text-white" />
            </button>

            {/* 播放/暂停 */}
            <button
              onClick={onPlayPause}
              className="p-2.5 hover:bg-white/10 active:bg-white/20 rounded-full transition-colors touch-manipulation"
              title={paused ? "播放" : "暂停"}
            >
              {paused
                ? <Play className="w-6 h-6 text-white fill-white" />
                : <Pause className="w-6 h-6 text-white" />
              }
            </button>

            {/* 前进 */}
            <button
              onClick={handleSeekForward}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
              title={`前进 ${seekStep} 秒`}
            >
              <SkipForward className="w-5 h-5 text-white" />
            </button>

            {/* 时间显示 */}
            <div className="ml-1 text-white text-xs font-medium tabular-nums">
              {formatDuration(currentTime)}
              <span className="text-white/50 mx-1">/</span>
              {formatDuration(duration)}
            </div>
          </div>

          {/* ——— 右侧：音量、倍速、设置、全屏 ——— */}
          <div className="flex items-center gap-1.5">
            {/* 音量控制 */}
            <div className="flex items-center gap-1 group/vol">
              <button
                onClick={handleToggleMute}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-manipulation"
                title={muted ? "取消静音" : "静音"}
              >
                {muted || volume === 0
                  ? <VolumeX className="w-4 h-4 text-white" />
                  : <Volume2 className="w-4 h-4 text-white" />
                }
              </button>
              {/* 悬停展开音量滑块 */}
              <div className="hidden group-hover/vol:flex items-center transition-all">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={muted ? 0 : volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="w-20 h-1 rounded-lg appearance-none cursor-pointer"
                  style={{
                    accentColor: "#ec4899",
                    background: `linear-gradient(to right, #ec4899 ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.25) ${(muted ? 0 : volume) * 100}%)`
                  }}
                />
              </div>
            </div>

            {/* 倍速标签（非 1x 时显示） */}
            {rate !== 1 && (
              <div className="px-2 py-0.5 bg-pink-600/70 rounded text-white text-xs font-medium">
                {rate}×
              </div>
            )}

            {/* 引擎切换（仅全屏时显示） */}
            {(fullscreenActive || immersive) && (
              <button
                onClick={handleEngineToggle}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-manipulation"
                title={`当前引擎：${ENGINE_LABELS[currentEngine]}，点击切换`}
              >
                <MonitorPlay className="w-4 h-4 text-white/70" />
              </button>
            )}

            {/* 画中画 */}
            <button
              onClick={handlePipToggle}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-manipulation"
              title={pipActive ? "退出画中画" : "画中画"}
            >
              <PictureInPicture2
                className={`w-4 h-4 ${pipActive ? "text-pink-400" : "text-white"}`}
              />
            </button>

            {/* 设置菜单 */}
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`p-2 hover:bg-white/10 rounded-lg transition-colors touch-manipulation ${settingsOpen ? "bg-white/10" : ""}`}
                title="设置"
              >
                <Settings className={`w-4 h-4 ${settingsOpen ? "text-pink-400" : "text-white"}`} />
              </button>

              {settingsOpen && (
                <PlayerSettingsMenu
                  playerState={playerState}
                  currentEngine={currentEngine}
                  onRateChange={onRateChange}
                  onQualityChange={onQualityChange}
                  onEngineChange={onEngineChange}
                  onOrientationModeChange={onOrientationModeChange}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>

            {/* 沉浸模式（全屏降级时显示） */}
            <button
              onClick={handleImmersiveToggle}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-manipulation"
              title={immersive ? "退出沉浸模式" : "沉浸模式"}
            >
              <LayoutTemplate
                className={`w-4 h-4 ${immersive ? "text-pink-400" : "text-white"}`}
              />
            </button>

            {/* 全屏 */}
            <button
              onClick={handleFullscreenToggle}
              className="p-2 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
              title={fullscreenActive ? "退出全屏" : "全屏 (F)"}
            >
              {fullscreenActive
                ? <Minimize2 className="w-5 h-5 text-white" />
                : <Maximize2 className="w-5 h-5 text-white" />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
