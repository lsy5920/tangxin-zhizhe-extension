import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import type { PlayerSnapshot, PlayerQualityOption, PlayerFullscreenDiagnostic } from "./types";
import { PlayerControls } from "./PlayerControls";
import { usePlayer } from "../../hooks/usePlayer";
import { useFullscreen } from "../../hooks/useFullscreen";

type Props = {
  url: string;
  title: string;
  sourceLabel: string;
  onStatusChange?: (status: string) => void;
  onErrorChange?: (error: string) => void;
  onStatsChange?: (stats: PlayerSnapshot) => void;
  onQualitiesChange?: (qualities: PlayerQualityOption[]) => void;
  onQualityChange?: (level: number) => void;
  autoFullscreenSignal?: number;
};

/**
 * 视频播放器容器组件
 *
 * 职责：
 * - 管理 ArtPlayer 和 hls.js 实例
 * - 处理视频加载和播放逻辑
 * - 提供播放器控制接口
 * - 处理全屏逻辑
 */
export function VideoPlayer({
  url,
  title,
  sourceLabel,
  onStatusChange,
  onErrorChange,
  onStatsChange,
  onQualitiesChange,
  onQualityChange,
  autoFullscreenSignal = 0
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const {
    playerState,
    dispatch,
    artRef,
    hlsRef,
    videoRef
  } = usePlayer({
    url,
    containerRef,
    onStatusChange,
    onErrorChange,
    onStatsChange,
    onQualitiesChange,
    onQualityChange
  });

  const {
    fullscreenActive,
    immersive,
    diagnostic,
    requestFullscreen,
    exitFullscreen,
    toggleImmersive
  } = useFullscreen({
    shellRef,
    playerShellClass: "txzz-player-fullscreen-mode"
  });

  // 响应外部全屏请求
  useEffect(() => {
    if (autoFullscreenSignal > 0 && url) {
      requestFullscreen();
    }
  }, [autoFullscreenSignal, url, requestFullscreen]);

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (playerState.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const handleVolumeChange = (volume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, volume));
      dispatch({ type: "SET_VOLUME", volume });
    }
  };

  const handleRateChange = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      dispatch({ type: "SET_RATE", rate });
    }
  };

  const handleQualityChange = (level: number) => {
    if (hlsRef.current && hlsRef.current.levels.length > 0) {
      hlsRef.current.currentLevel = level;
      dispatch({ type: "SET_QUALITY", level });
    }
  };

  return (
    <div
      ref={shellRef}
      className={`relative w-full ${fullscreenActive ? 'player-shell-fullscreen' : ''}`}
      style={{
        aspectRatio: fullscreenActive ? undefined : '16 / 9',
        background: '#000'
      }}
    >
      <div
        ref={containerRef}
        className="w-full h-full"
      />

      {url && (
        <PlayerControls
          playerState={playerState}
          fullscreenActive={fullscreenActive}
          immersive={immersive}
          diagnostic={diagnostic}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onRateChange={handleRateChange}
          onQualityChange={handleQualityChange}
          onRequestFullscreen={requestFullscreen}
          onExitFullscreen={exitFullscreen}
          onToggleImmersive={toggleImmersive}
        />
      )}
    </div>
  );
}
