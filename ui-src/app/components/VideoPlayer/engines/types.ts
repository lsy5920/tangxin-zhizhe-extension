/**
 * 播放器引擎抽象接口定义
 *
 * 此文件定义了统一的播放器引擎接口，支持多种播放器内核
 */

export type PlayerEngine = 'artplayer' | 'xgplayer';

export interface PlayerQuality {
  level: number;
  label: string;
  width?: number;
  height?: number;
  bitrate?: number;
}

export interface PlayerStats {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  paused: boolean;
  volume: number;
  rate: number;
  bitrate?: number;
  fps?: number;
}

export interface PlayerEngineConfig {
  container: HTMLElement;
  url: string;
  autoplay?: boolean;
  volume?: number;
  muted?: boolean;
  poster?: string;
  theme?: string;
}

export interface PlayerEngineInstance {
  // 播放控制
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;

  // 音量控制
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unmute(): void;

  // 播放速率
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;

  // 清晰度控制
  getQualities(): PlayerQuality[];
  getCurrentQuality(): number;
  setQuality(level: number): void;

  // 全屏控制
  requestFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  isFullscreen(): boolean;

  // 状态获取
  getStats(): PlayerStats;
  isPaused(): boolean;
  getDuration(): number;
  getCurrentTime(): number;

  // 事件监听
  on(event: PlayerEvent, callback: (...args: any[]) => void): void;
  off(event: PlayerEvent, callback: (...args: any[]) => void): void;

  // 截图
  screenshot(): Promise<string>;

  // 销毁
  destroy(): void;

  // 原始实例访问（用于高级功能）
  getNativePlayer(): any;
  getVideoElement(): HTMLVideoElement | null;
}

export type PlayerEvent =
  | 'ready'
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'volumechange'
  | 'ratechange'
  | 'qualitychange'
  | 'error'
  | 'buffering'
  | 'buffered'
  | 'seeking'
  | 'seeked'
  | 'fullscreenchange';

export interface PlayerEventMap {
  ready: () => void;
  play: () => void;
  pause: () => void;
  ended: () => void;
  timeupdate: (stats: PlayerStats) => void;
  volumechange: (volume: number) => void;
  ratechange: (rate: number) => void;
  qualitychange: (level: number) => void;
  error: (error: Error | string) => void;
  buffering: () => void;
  buffered: () => void;
  seeking: () => void;
  seeked: () => void;
  fullscreenchange: (isFullscreen: boolean) => void;
}
