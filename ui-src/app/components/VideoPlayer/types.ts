/**
 * 播放器相关类型定义
 */

export type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  paused: boolean;
  rate: number;
};

export type PlayerQualityOption = {
  level: number;
  label: string;
};

export type PlayerFillMode = "contain" | "cover" | "fill";
export type PlayerOrientationMode = "auto" | "landscape" | "portrait";

export type PlayerFullscreenDiagnostic = {
  source: "未全屏" | "播放器壳层" | "插件宿主" | "沉浸兜底" | "未知";
  shellSize: string;
  viewportSize: string;
  coverage: number;
  ok: boolean;
  issue: string;
};

export type PlayerControlsState = {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  seekStep: number;
  fillMode: PlayerFillMode;
  orientationMode: PlayerOrientationMode;
  brightness: number;
  qualities: PlayerQualityOption[];
  currentQuality: number;
  status: string;
  error: string;
};
