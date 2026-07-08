import { useEffect, useRef, useState } from "react";
import type { PlayerSnapshot, PlayerQualityOption, PlayerFullscreenDiagnostic } from "./types";
import type { PlayerEngine } from "./engines/types";
import { PlayerControls } from "./PlayerControls";
import { PlayerGestures } from "./PlayerGestures";
import { useEnhancedPlayer } from "../../hooks/useEnhancedPlayer";
import { useEnhancedFullscreen } from "../../hooks/useEnhancedFullscreen";

type Props = {
  url: string;
  title: string;
  sourceLabel: string;
  preferredEngine?: PlayerEngine;
  onStatusChange?: (status: string) => void;
  onErrorChange?: (error: string) => void;
  onStatsChange?: (stats: PlayerSnapshot) => void;
  onQualitiesChange?: (qualities: PlayerQualityOption[]) => void;
  onQualityChange?: (level: number) => void;
  autoFullscreenSignal?: number;
};

/**
 * 视频播放器容器组件（重构版）
 *
 * 职责：
 * - 管理播放器引擎实例（支持多引擎切换：Artplayer / XGPlayer）
 * - 处理视频加载和播放逻辑
 * - 提供播放器控制接口
 * - 处理全屏逻辑（浏览器全屏 + 沉浸模式 + 画中画）
 * - 移动端手势支持
 */
export function VideoPlayer({
  url,
  title,
  sourceLabel,
  preferredEngine,
  onStatusChange,
  onErrorChange,
  onStatsChange,
  onQualitiesChange,
  onQualityChange,
  autoFullscreenSignal = 0
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // 当前选中的引擎（用户可在设置中切换）
  const [selectedEngine, setSelectedEngine] = useState<PlayerEngine>(preferredEngine || "artplayer");

  const {
    playerState,
    dispatch,
    playerInstance,
    videoRef,
    isReady
  } = useEnhancedPlayer({
    url,
    containerRef,
    preferredEngine: selectedEngine,
    onStatusChange,
    onErrorChange,
    onStatsChange: (stats) => {
      onStatsChange?.({
        currentTime: stats.currentTime,
        duration: stats.duration,
        bufferedEnd: stats.bufferedEnd,
        paused: stats.paused,
        rate: stats.rate
      });
    },
    onQualitiesChange,
    onQualityChange
  });

  const {
    fullscreenActive,
    immersive,
    pipActive,
    diagnostic,
    requestFullscreen,
    exitFullscreen,
    toggleImmersive,
    requestPictureInPicture,
    exitPictureInPicture,
    isMobile
  } = useEnhancedFullscreen({
    shellRef,
    playerShellClass: "txzz-player-fullscreen-mode",
    videoElement: videoRef.current
  });

  // 响应外部全屏请求信号
  useEffect(() => {
    if (autoFullscreenSignal > 0 && url) {
      requestFullscreen();
    }
  }, [autoFullscreenSignal, url, requestFullscreen]);

  // ——— 播放控制 ———
  const handleSeek = (time: number) => {
    playerInstance?.seek(time);
  };

  const handlePlayPause = () => {
    if (!playerInstance) return;
    if (playerState.paused) {
      playerInstance.play();
    } else {
      playerInstance.pause();
    }
  };

  const handleVolumeChange = (volume: number) => {
    playerInstance?.setVolume(Math.max(0, Math.min(1, volume)));
    dispatch({ type: "SET_VOLUME", volume });
  };

  const handleRateChange = (rate: number) => {
    playerInstance?.setPlaybackRate(rate);
    dispatch({ type: "SET_RATE", rate });
  };

  const handleQualityChange = (level: number) => {
    playerInstance?.setQuality(level);
    dispatch({ type: "SET_QUALITY", level });
  };

  const handleEngineChange = (engine: PlayerEngine) => {
    setSelectedEngine(engine);
    // 引擎切换会触发 url 依赖项变化，自动重建播放器
  };

  // ——— 全屏控制 ———
  const handleFullscreenToggle = () => {
    if (fullscreenActive) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  };

  // ——— 手势支持 ———
  const handleGestureSeek = (time: number) => {
    playerInstance?.seek(time);
  };

  const handleGestureRate = (rate: number) => {
    playerInstance?.setPlaybackRate(rate);
    dispatch({ type: "SET_RATE", rate });
  };

  const handleGestureVolume = (volume: number) => {
    playerInstance?.setVolume(volume);
    dispatch({ type: "SET_VOLUME", volume });
  };

  const getCurrentTime = () => playerInstance?.getCurrentTime() ?? 0;
  const getVolume = () => playerInstance?.getVolume() ?? playerState.volume;

  return (
    <div
      ref={shellRef}
      className={[
        "txzz-player-shell",
        "relative w-full overflow-hidden",
        fullscreenActive ? "txzz-player-shell--fullscreen" : "",
        immersive ? "txzz-player-shell--immersive" : "",
        isMobile ? "txzz-player-shell--mobile" : ""
      ].filter(Boolean).join(" ")}
      style={{
        aspectRatio: (fullscreenActive || immersive) ? undefined : "16 / 9",
        background: "#000",
        ...(immersive ? {
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          width: "100vw",
          height: "100dvh"
        } : {})
      }}
    >
      {/* 播放器渲染容器 */}
      <div
        ref={containerRef}
        className="w-full h-full"
      />

      {/* 加载状态层 */}
      {!isReady && url && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-white/20 border-t-pink-400 rounded-full animate-spin" />
            <span className="text-white/70 text-sm">{playerState.status}</span>
          </div>
        </div>
      )}

      {/* 错误提示层 */}
      {playerState.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none z-10">
          <div className="px-6 py-4 bg-red-900/80 backdrop-blur-sm rounded-2xl text-center max-w-xs">
            <div className="text-red-400 text-2xl mb-2">⚠</div>
            <p className="text-white text-sm">{playerState.error}</p>
          </div>
        </div>
      )}

      {url && (
        <>
          {/* 手势控制层（在控制栏之下） */}
          <PlayerGestures
            containerRef={containerRef}
            onSeek={handleGestureSeek}
            onRateChange={handleGestureRate}
            onVolumeChange={handleGestureVolume}
            getCurrentTime={getCurrentTime}
            getVolume={getVolume}
            seekStep={10}
          />

          {/* 控制栏 */}
          <PlayerControls
            playerState={{
              ...playerState,
              seekStep: 10,
              fillMode: "contain",
              brightness: 100
            }}
            fullscreenActive={fullscreenActive}
            immersive={immersive}
            pipActive={pipActive}
            diagnostic={diagnostic}
            currentEngine={selectedEngine}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onRateChange={handleRateChange}
            onQualityChange={handleQualityChange}
            onEngineChange={handleEngineChange}
            onRequestFullscreen={requestFullscreen}
            onExitFullscreen={exitFullscreen}
            onToggleImmersive={toggleImmersive}
            onRequestPip={requestPictureInPicture}
            onExitPip={exitPictureInPicture}
          />
        </>
      )}
    </div>
  );
}
