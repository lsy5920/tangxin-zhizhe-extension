/**
 * Artplayer 引擎适配器
 *
 * 将 Artplayer 适配为统一的播放器引擎接口
 */

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import type {
  PlayerEngineConfig,
  PlayerEngineInstance,
  PlayerQuality,
  PlayerStats,
  PlayerEvent,
  PlayerEventMap
} from './types';

export class ArtplayerEngine implements PlayerEngineInstance {
  private art: Artplayer;
  private hls: Hls | null = null;
  private eventListeners = new Map<string, Set<Function>>();

  constructor(config: PlayerEngineConfig) {
    const isHls = /\.m3u8(?:[?#]|$)/i.test(config.url);

    // 创建 Artplayer 实例
    this.art = new Artplayer({
      container: config.container,
      url: isHls ? '' : config.url,
      autoplay: config.autoplay ?? false,
      volume: config.volume ?? 0.8,
      muted: config.muted ?? false,
      poster: config.poster,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      screenshot: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      theme: config.theme ?? '#ff6090',
      lang: 'zh-cn',
      whitelist: ['*'],
      moreVideoAttr: {
        crossOrigin: 'anonymous',
        preload: 'auto'
      }
    });

    // HLS 支持
    if (isHls && Hls.isSupported()) {
      this.hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDuration: 3,
        liveMaxLatencyDuration: 10,
        enableWorker: true,
        lowLatencyMode: false,
        // 优化的缓冲配置，提升播放流畅度
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
        startLevel: -1, // 自动选择最佳清晰度
        capLevelToPlayerSize: true
      });

      this.hls.loadSource(config.url);
      this.hls.attachMedia(this.art.video);

      // HLS 事件监听
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.emit('ready');
      });

      this.hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        this.emit('qualitychange', data.level);
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          const error = new Error(`HLS 错误: ${data.type} - ${data.details}`);
          this.emit('error', error);

          // 尝试自动恢复
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('[ArtplayerEngine] 尝试从网络错误恢复');
              this.hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('[ArtplayerEngine] 尝试从媒体错误恢复');
              this.hls?.recoverMediaError();
              break;
            default:
              console.error('[ArtplayerEngine] 无法恢复的错误:', data);
              break;
          }
        }
      });
    }

    // 绑定 Artplayer 事件
    this.bindArtplayerEvents();
  }

  private bindArtplayerEvents(): void {
    this.art.on('ready', () => this.emit('ready'));
    this.art.on('play', () => this.emit('play'));
    this.art.on('pause', () => this.emit('pause'));
    this.art.on('ended', () => this.emit('ended'));
    this.art.on('timeupdate', () => this.emit('timeupdate', this.getStats()));
    this.art.on('volumechange', () => this.emit('volumechange', this.getVolume()));
    this.art.on('error', (error) => this.emit('error', error));
    this.art.on('video:seeking', () => this.emit('seeking'));
    this.art.on('video:seeked', () => this.emit('seeked'));
  }

  private emit(event: PlayerEvent, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(...args));
    }
  }

  // 播放控制
  async play(): Promise<void> {
    await this.art.play();
  }

  pause(): void {
    this.art.pause();
  }

  seek(time: number): void {
    this.art.currentTime = time;
  }

  // 音量控制
  setVolume(volume: number): void {
    this.art.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.art.volume;
  }

  mute(): void {
    this.art.muted = true;
  }

  unmute(): void {
    this.art.muted = false;
  }

  // 播放速率
  setPlaybackRate(rate: number): void {
    this.art.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this.art.playbackRate;
  }

  // 清晰度控制
  getQualities(): PlayerQuality[] {
    if (!this.hls || !this.hls.levels.length) {
      return [];
    }

    return this.hls.levels.map((level, index) => ({
      level: index,
      label: level.name || (level.height ? `${level.height}P` : `档位 ${index + 1}`),
      width: level.width,
      height: level.height,
      bitrate: level.bitrate
    }));
  }

  getCurrentQuality(): number {
    return this.hls?.currentLevel ?? -1;
  }

  setQuality(level: number): void {
    if (this.hls && this.hls.levels.length > 0) {
      this.hls.currentLevel = level;
    }
  }

  // 全屏控制
  async requestFullscreen(): Promise<void> {
    await this.art.fullscreen = true;
    this.emit('fullscreenchange', true);
  }

  async exitFullscreen(): Promise<void> {
    this.art.fullscreen = false;
    this.emit('fullscreenchange', false);
  }

  isFullscreen(): boolean {
    return this.art.fullscreen;
  }

  // 状态获取
  getStats(): PlayerStats {
    const buffered = this.art.video.buffered.length
      ? this.art.video.buffered.end(this.art.video.buffered.length - 1)
      : 0;

    return {
      currentTime: this.art.currentTime,
      duration: this.art.duration,
      bufferedEnd: buffered,
      paused: this.art.video.paused,
      volume: this.art.volume,
      rate: this.art.playbackRate
    };
  }

  isPaused(): boolean {
    return this.art.video.paused;
  }

  getDuration(): number {
    return this.art.duration;
  }

  getCurrentTime(): number {
    return this.art.currentTime;
  }

  // 事件监听
  on(event: PlayerEvent, callback: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: PlayerEvent, callback: (...args: any[]) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  // 截图
  async screenshot(): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const video = this.art.video;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } else {
        resolve('');
      }
    });
  }

  // 销毁
  destroy(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.art) {
      this.art.destroy();
    }
    this.eventListeners.clear();
  }

  // 原始实例访问
  getNativePlayer(): Artplayer {
    return this.art;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.art.video;
  }
}
