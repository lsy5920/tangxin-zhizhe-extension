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
  Minimize2
} from "lucide-react";
import type { PlayerControlsState, PlayerFullscreenDiagnostic } from "./types";
import { PlayerProgressBar } from "./PlayerProgressBar";
import { PlayerSettingsMenu } from "./PlayerSettingsMenu";
import { formatDuration } from "../../helpers";

type Props = {
  playerState: PlayerControlsState;
  fullscreenActive: boolean;
  immersive: boolean;
  diagnostic: PlayerFullscreenDiagnostic;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onRateChange: (rate: number) => void;
  onQualityChange: (level: number) => void;
  onRequestFullscreen: () => void;
  onExitFullscreen: () => void;
  onToggleImmersive: () => void;
};

/**
 * 播放器控制层组件
 *
 * 职责：
 * - 显示播放控制按钮
 * - 显示进度条
 * - 显示设置菜单
 * - 处理用户交互
 * - 自动隐藏控制层
 */
export function PlayerControls({
  playerState,
  fullscreenActive,
  immersive,
  diagnostic,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onRateChange,
  onQualityChange,
  onRequestFullscreen,
  onExitFullscreen,
  onToggleImmersive
}: Props) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const hideTimer = useRef<number>();
  const cursorTimer = useRef<number>();

  const { currentTime, duration, buffered, paused, volume, muted, rate, seekStep } = playerState;

  // 自动隐藏控制层逻辑
  const shouldStayVisible = paused || settingsOpen || Boolean(playerState.error);

  const resetHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }

    setControlsVisible(true);
    setCursorHidden(false);

    if (!shouldStayVisible) {
      hideTimer.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 3000);

      cursorTimer.current = window.setTimeout(() => {
        setCursorHidden(true);
      }, 3000);
    }
  };

  // 鼠标移动时显示控制层
  useEffect(() => {
    const handleMouseMove = () => resetHideTimer();
    const handleTouch = () => resetHideTimer();

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchstart", handleTouch);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchstart", handleTouch);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, [shouldStayVisible]);

  // 播放状态变化时重置定时器
  useEffect(() => {
    resetHideTimer();
  }, [paused, settingsOpen, playerState.error]);

  const handleSeekBackward = () => {
    onSeek(Math.max(0, currentTime - seekStep));
  };

  const handleSeekForward = () => {
    onSeek(Math.min(duration, currentTime + seekStep));
  };

  const handleToggleMute = () => {
    if (muted) {
      onVolumeChange(volume || 0.8);
    } else {
      onVolumeChange(0);
    }
  };

  const handleFullscreenToggle = () => {
    if (fullscreenActive) {
      onExitFullscreen();
    } else {
      onRequestFullscreen();
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-200 ${
        controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      } ${cursorHidden ? "cursor-none" : ""}`}
      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 40%)" }}
    >
      {/* 全屏诊断提示 */}
      {fullscreenActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 rounded-lg text-white text-sm backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className={diagnostic.ok ? "text-emerald-400" : "text-amber-400"}>
              {diagnostic.source}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-300">覆盖 {diagnostic.coverage}%</span>
            {!diagnostic.ok && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-amber-400">{diagnostic.issue}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 主控制栏 */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
        {/* 进度条 */}
        <PlayerProgressBar
          progress={progress}
          buffered={bufferedProgress}
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
        />

        {/* 控制按钮 */}
        <div className="flex items-center justify-between mt-3">
          {/* 左侧：播放控制 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSeekBackward}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title={`后退 ${seekStep} 秒`}
            >
              <SkipBack className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={onPlayPause}
              className="p-3 hover:bg-white/10 rounded-lg transition-colors"
              title={paused ? "播放" : "暂停"}
            >
              {paused ? (
                <Play className="w-6 h-6 text-white fill-white" />
              ) : (
                <Pause className="w-6 h-6 text-white" />
              )}
            </button>

            <button
              onClick={handleSeekForward}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title={`前进 ${seekStep} 秒`}
            >
              <SkipForward className="w-5 h-5 text-white" />
            </button>

            <div className="ml-2 text-white text-sm font-medium">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>
          </div>

          {/* 右侧：音量和设置 */}
          <div className="flex items-center gap-3">
            {/* 音量控制 */}
            <div className="flex items-center gap-2 group">
              <button
                onClick={handleToggleMute}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title={muted ? "取消静音" : "静音"}
              >
                {muted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>

              <div className="hidden group-hover:flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, white ${volume * 100}%, rgba(255,255,255,0.3) ${volume * 100}%)`
                  }}
                />
              </div>
            </div>

            {/* 倍速显示 */}
            {rate !== 1 && (
              <div className="px-2 py-1 bg-white/10 rounded text-white text-xs">
                {rate}x
              </div>
            )}

            {/* 设置菜单 */}
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="设置"
              >
                <Settings className="w-5 h-5 text-white" />
              </button>

              {settingsOpen && (
                <PlayerSettingsMenu
                  playerState={playerState}
                  onRateChange={onRateChange}
                  onQualityChange={onQualityChange}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>

            {/* 全屏 */}
            <button
              onClick={handleFullscreenToggle}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title={fullscreenActive ? "退出全屏" : "全屏"}
            >
              {fullscreenActive ? (
                <Minimize2 className="w-5 h-5 text-white" />
              ) : (
                <Maximize2 className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
