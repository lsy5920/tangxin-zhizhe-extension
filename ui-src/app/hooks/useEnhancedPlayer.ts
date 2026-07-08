/**
 * 增强版播放器 Hook
 *
 * 支持多播放器引擎切换、自动引擎选择、性能优化
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { PlayerEngineFactory, PlayerEngineInstance, PlayerEngine, PlayerStats } from "../components/VideoPlayer/engines";
import type { PlayerQualityOption } from "../components/VideoPlayer/types";

type PlayerState = {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  qualities: PlayerQualityOption[];
  currentQuality: number;
  status: string;
  error: string;
  engine: PlayerEngine;
};

type PlayerAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "TOGGLE_MUTE" }
  | { type: "SET_RATE"; rate: number }
  | { type: "SET_QUALITY"; level: number }
  | { type: "UPDATE_TIME"; currentTime: number; buffered: number; duration: number }
  | { type: "SET_STATUS"; status: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_QUALITIES"; qualities: PlayerQualityOption[] }
  | { type: "SET_ENGINE"; engine: PlayerEngine }
  | { type: "RESET" };

const initialState: PlayerState = {
  playing: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  paused: true,
  volume: 0.8,
  muted: false,
  rate: 1,
  qualities: [],
  currentQuality: -1,
  status: "等待播放链接",
  error: "",
  engine: "artplayer"
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PLAY":
      return { ...state, playing: true, paused: false, error: "" };
    case "PAUSE":
      return { ...state, playing: false, paused: true };
    case "SET_VOLUME":
      return { ...state, volume: action.volume, muted: false };
    case "TOGGLE_MUTE":
      return { ...state, muted: !state.muted };
    case "SET_RATE":
      return { ...state, rate: action.rate };
    case "SET_QUALITY":
      return { ...state, currentQuality: action.level };
    case "UPDATE_TIME":
      return {
        ...state,
        currentTime: action.currentTime,
        buffered: action.buffered,
        duration: action.duration
      };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "SET_ERROR":
      return { ...state, error: action.error, status: action.error ? "播放异常" : state.status };
    case "SET_QUALITIES":
      return { ...state, qualities: action.qualities };
    case "SET_ENGINE":
      return { ...state, engine: action.engine };
    case "RESET":
      return { ...initialState, volume: state.volume, muted: state.muted, rate: state.rate, engine: state.engine };
    default:
      return state;
  }
}

type UseEnhancedPlayerProps = {
  url: string;
  containerRef: React.RefObject<HTMLDivElement>;
  preferredEngine?: PlayerEngine;
  onStatusChange?: (status: string) => void;
  onErrorChange?: (error: string) => void;
  onStatsChange?: (stats: PlayerStats) => void;
  onQualitiesChange?: (qualities: PlayerQualityOption[]) => void;
  onQualityChange?: (level: number) => void;
};

/**
 * 增强版播放器 Hook
 *
 * 新特性：
 * - 支持多播放器引擎 (Artplayer, XGPlayer)
 * - 自动选择最佳引擎
 * - 播放器实例复用优化
 * - 更好的错误处理和恢复
 * - 播放进度自动保存和恢复
 */
export function useEnhancedPlayer({
  url,
  containerRef,
  preferredEngine,
  onStatusChange,
  onErrorChange,
  onStatsChange,
  onQualitiesChange,
  onQualityChange
}: UseEnhancedPlayerProps) {
  const [playerState, dispatch] = useReducer(playerReducer, initialState);
  const playerInstanceRef = useRef<PlayerEngineInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressStorageKey = `txzz-player-progress:${url}`;
  const [isReady, setIsReady] = useState(false);

  // 初始化播放器
  useEffect(() => {
    if (!containerRef.current || !url) {
      setIsReady(false);
      return;
    }

    dispatch({ type: "SET_STATUS", status: "正在加载播放器" });

    // 选择播放器引擎
    const engine = preferredEngine || PlayerEngineFactory.getRecommendedEngine(url);
    dispatch({ type: "SET_ENGINE", engine });

    console.log(`[useEnhancedPlayer] 使用播放器引擎: ${engine}`);

    // 创建播放器实例
    try {
      const playerInstance = PlayerEngineFactory.createEngine(engine, {
        container: containerRef.current,
        url,
        autoplay: false,
        volume: playerState.volume,
        muted: playerState.muted,
        theme: '#ff6090'
      });

      playerInstanceRef.current = playerInstance;
      videoRef.current = playerInstance.getVideoElement();

      // 绑定事件
      playerInstance.on('ready', () => {
        setIsReady(true);
        dispatch({ type: "SET_STATUS", status: "播放器已就绪" });
        onStatusChange?.("播放器已就绪");

        // 恢复上次播放进度
        const savedProgress = localStorage.getItem(progressStorageKey);
        if (savedProgress) {
          const progress = Number(savedProgress);
          const duration = playerInstance.getDuration();
          if (progress > 5 && progress < duration - 10) {
            playerInstance.seek(progress);
            dispatch({ type: "SET_STATUS", status: `已恢复到 ${Math.floor(progress)}秒` });
          }
        }

        // 获取清晰度列表
        const qualities = playerInstance.getQualities();
        if (qualities.length > 0) {
          dispatch({ type: "SET_QUALITIES", qualities });
          onQualitiesChange?.(qualities);
        }
      });

      playerInstance.on('play', () => {
        dispatch({ type: "PLAY" });
      });

      playerInstance.on('pause', () => {
        dispatch({ type: "PAUSE" });
      });

      playerInstance.on('timeupdate', (stats: PlayerStats) => {
        dispatch({
          type: "UPDATE_TIME",
          currentTime: stats.currentTime,
          duration: stats.duration,
          buffered: stats.bufferedEnd
        });

        onStatsChange?.(stats);

        // 保存播放进度
        if (stats.currentTime > 5) {
          localStorage.setItem(progressStorageKey, String(stats.currentTime));
        }
      });

      playerInstance.on('volumechange', (volume: number) => {
        dispatch({ type: "SET_VOLUME", volume });
      });

      playerInstance.on('ratechange', (rate: number) => {
        dispatch({ type: "SET_RATE", rate });
      });

      playerInstance.on('qualitychange', (level: number) => {
        dispatch({ type: "SET_QUALITY", level });
        onQualityChange?.(level);
      });

      playerInstance.on('error', (error: Error | string) => {
        const errorMsg = typeof error === 'string' ? error : error.message;
        dispatch({ type: "SET_ERROR", error: errorMsg });
        onErrorChange?.(errorMsg);
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      dispatch({ type: "SET_ERROR", error: errorMsg });
      onErrorChange?.(errorMsg);
      console.error('[useEnhancedPlayer] 播放器初始化失败:', error);
    }

    // 清理
    return () => {
      if (playerInstanceRef.current) {
        playerInstanceRef.current.destroy();
        playerInstanceRef.current = null;
      }
      videoRef.current = null;
      setIsReady(false);
    };
  }, [url, containerRef, preferredEngine]);

  return {
    playerState,
    dispatch,
    playerInstance: playerInstanceRef.current,
    videoRef,
    isReady
  };
}
