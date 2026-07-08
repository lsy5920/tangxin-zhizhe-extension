import { useEffect, useReducer, useRef } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import type { PlayerSnapshot, PlayerQualityOption } from "../components/VideoPlayer/types";

type PlayerState = {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  seekStep: number;
  fillMode: "contain" | "cover" | "fill";
  brightness: number;
  currentUrl: string;
  qualities: PlayerQualityOption[];
  currentQuality: number;
  status: string;
  error: string;
};

type PlayerAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SEEK"; time: number }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "TOGGLE_MUTE" }
  | { type: "SET_RATE"; rate: number }
  | { type: "SET_SEEK_STEP"; step: number }
  | { type: "SET_FILL_MODE"; mode: "contain" | "cover" | "fill" }
  | { type: "SET_BRIGHTNESS"; brightness: number }
  | { type: "SET_QUALITY"; level: number }
  | { type: "UPDATE_TIME"; currentTime: number; buffered: number; duration: number }
  | { type: "SET_STATUS"; status: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_QUALITIES"; qualities: PlayerQualityOption[] }
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
  seekStep: 10,
  fillMode: "contain",
  brightness: 100,
  currentUrl: "",
  qualities: [],
  currentQuality: -1,
  status: "等待播放链接",
  error: ""
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PLAY":
      return { ...state, playing: true, paused: false, error: "" };
    case "PAUSE":
      return { ...state, playing: false, paused: true };
    case "SEEK":
      return { ...state, currentTime: action.time };
    case "SET_VOLUME":
      return { ...state, volume: action.volume, muted: false };
    case "TOGGLE_MUTE":
      return { ...state, muted: !state.muted };
    case "SET_RATE":
      return { ...state, rate: action.rate };
    case "SET_SEEK_STEP":
      return { ...state, seekStep: action.step };
    case "SET_FILL_MODE":
      return { ...state, fillMode: action.mode };
    case "SET_BRIGHTNESS":
      return { ...state, brightness: action.brightness };
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
    case "RESET":
      return { ...initialState, volume: state.volume, muted: state.muted, rate: state.rate };
    default:
      return state;
  }
}

type UsePlayerProps = {
  url: string;
  containerRef: React.RefObject<HTMLDivElement>;
  onStatusChange?: (status: string) => void;
  onErrorChange?: (error: string) => void;
  onStatsChange?: (stats: PlayerSnapshot) => void;
  onQualitiesChange?: (qualities: PlayerQualityOption[]) => void;
  onQualityChange?: (level: number) => void;
};

/**
 * 播放器核心逻辑 Hook
 *
 * 职责：
 * - 管理播放器状态
 * - 初始化和销毁 ArtPlayer 和 hls.js
 * - 处理播放事件
 * - 提供播放控制方法
 */
export function usePlayer({
  url,
  containerRef,
  onStatusChange,
  onErrorChange,
  onStatsChange,
  onQualitiesChange,
  onQualityChange
}: UsePlayerProps) {
  const [playerState, dispatch] = useReducer(playerReducer, initialState);
  const artRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressStorageKey = `txzz-player-progress:${url}`;

  // 初始化播放器
  useEffect(() => {
    if (!containerRef.current || !url) return;

    dispatch({ type: "SET_STATUS", status: "正在加载播放器" });

    const isHls = /\.m3u8(?:[?#]|$)/i.test(url);

    // 创建 ArtPlayer 实例
    const art = new Artplayer({
      container: containerRef.current,
      url: isHls ? "" : url, // HLS 由 hls.js 处理
      volume: playerState.volume,
      muted: playerState.muted,
      autoplay: false,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      screenshot: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      theme: "#ff6090",
      lang: "zh-cn",
      whitelist: ["*"],
      moreVideoAttr: {
        crossOrigin: "anonymous",
        preload: "auto"
      }
    });

    artRef.current = art;
    videoRef.current = art.video;

    // HLS 支持
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDuration: 3,
        liveMaxLatencyDuration: 10,
        enableWorker: true,
        lowLatencyMode: false
      });

      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(art.video);

      // HLS 事件监听
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        dispatch({ type: "SET_STATUS", status: "播放列表已解析" });

        // 提取清晰度选项
        const levels = hls.levels.map((level, index) => ({
          level: index,
          label: level.name || level.height ? `${level.height}P` : `档位 ${index + 1}`
        }));
        dispatch({ type: "SET_QUALITIES", qualities: levels });
        onQualitiesChange?.(levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        dispatch({ type: "SET_QUALITY", level: data.level });
        onQualityChange?.(data.level);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          const errorMsg = `HLS 错误: ${data.type}`;
          dispatch({ type: "SET_ERROR", error: errorMsg });
          onErrorChange?.(errorMsg);

          // 尝试恢复
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("尝试从网络错误恢复");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("尝试从媒体错误恢复");
              hls.recoverMediaError();
              break;
            default:
              console.error("无法恢复的错误:", data);
              break;
          }
        }
      });
    }

    // 视频事件监听
    art.on("ready", () => {
      dispatch({ type: "SET_STATUS", status: "播放器已就绪" });
      onStatusChange?.("播放器已就绪");

      // 恢复上次播放进度
      const savedProgress = localStorage.getItem(progressStorageKey);
      if (savedProgress) {
        const progress = Number(savedProgress);
        if (progress > 5 && progress < art.duration - 10) {
          art.currentTime = progress;
          dispatch({ type: "SET_STATUS", status: `已恢复到 ${Math.floor(progress)}秒` });
        }
      }
    });

    art.on("play", () => {
      dispatch({ type: "PLAY" });
    });

    art.on("pause", () => {
      dispatch({ type: "PAUSE" });
    });

    art.on("timeupdate", () => {
      const currentTime = art.currentTime;
      const duration = art.duration;
      const buffered = art.video.buffered.length
        ? art.video.buffered.end(art.video.buffered.length - 1)
        : 0;

      dispatch({
        type: "UPDATE_TIME",
        currentTime,
        duration,
        buffered
      });

      onStatsChange?.({
        currentTime,
        duration,
        bufferedEnd: buffered,
        paused: art.video.paused,
        rate: art.video.playbackRate
      });

      // 保存播放进度
      if (currentTime > 5) {
        localStorage.setItem(progressStorageKey, String(currentTime));
      }
    });

    art.on("error", (error) => {
      const errorMsg = `播放器错误: ${error?.message || "未知错误"}`;
      dispatch({ type: "SET_ERROR", error: errorMsg });
      onErrorChange?.(errorMsg);
    });

    // 清理
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (artRef.current) {
        artRef.current.destroy();
        artRef.current = null;
      }
      videoRef.current = null;
    };
  }, [url, containerRef]);

  return {
    playerState,
    dispatch,
    artRef,
    hlsRef,
    videoRef
  };
}
