/**
 * XGPlayer 引擎适配器
 *
 * 将 XGPlayer 适配为统一的播放器引擎接口
 */

import Player from 'xgplayer';
import HlsPlayer from 'xgplayer-hls';
import type {
  PlayerEngineConfig,
  PlayerEngineInstance,
  PlayerQuality,
  PlayerStats,
  PlayerEvent
} from './types';

export class XGPlayerEngine implements PlayerEngineInstance {
  private player: any;
  private eventListeners = new Map<string, Set<Function>>();
  private isHlsStream = false;

  constructor(config: PlayerEngineConfig) {
    this.isHlsStream = /\.m3u8(?:[?#]|$)/i.test(config.url);

    const commonConfig = {
      el: config.container,
      url: config.url,
      autoplay: config.autoplay ?? false,
      volume: config.volume ?? 0.8,
      muted: config.muted ?? false,
      poster: config.poster,
      fluid: true,
      fitVideoSize: 'fixWidth',
      videoInit: true,
      download: true,
      playbackRate: [0.5, 0.75, 1, 1.25, 1.5, 2],
      defaultPlaybackRate: 1,
      screenShot: true,
      pip: true,
      cssFullscreen: true,
      rotateFullscreen: true,
      lang: 'zh-cn',
      // 优化的配置
      preloadTime: 30,
      minCachedTime: 5,
      nullUrlStart: false,
      closeVideoClick: true,
      closeVideoDblclick: false,
      leaveHidePause: false,
      closeVideoTouch: false,
      // 全屏优化
      rotateFullscreenClick: true,
      allowPlayAfterEnded: true,
      errorTips: '视频加载失败，请稍后重试'
    };

    // 根据是否为 HLS 流选择播放器类型
    if (this.isHlsStream) {
      this.player = new HlsPlayer({
        ...commonConfig,
        // HLS 特定配置
        isLive: false,
        softDecode: false
      });
    } else {
      this.player = new Player(commonConfig);
    }

    // 绑定事件
    this.bindPlayerEvents();
  }

  private bindPlayerEvents(): void {
    this.player.once('ready', () => this.emit('ready'));
    this.player.on('play', () => this.emit('play'));
    this.player.on('pause', () => this.emit('pause'));
    this.player.on('ended', () => this.emit('ended'));
    this.player.on('timeupdate', () => this.emit('timeupdate', this.getStats()));
    this.player.on('volumechange', () => this.emit('volumechange', this.getVolume()));
    this.player.on('ratechange', () => this.emit('ratechange', this.getPlaybackRate()));
    this.player.on('error', (error: any) => this.emit('error', error));
    this.player.on('seeking', () => this.emit('seeking'));
    this.player.on('seeked', () => this.emit('seeked'));
    this.player.on('requestFullscreen', () => this.emit('fullscreenchange', true));
    this.player.on('exitFullscreen', () => this.emit('fullscreenchange', false));
  }

  private emit(event: PlayerEvent, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(...args));
    }
  }

  // 播放控制
  async play(): Promise<void> {
    await this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  seek(time: number): void {
    this.player.currentTime = time;
  }

  // 音量控制
  setVolume(volume: number): void {
    this.player.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.player.volume;
  }

  mute(): void {
    this.player.muted = true;
  }

  unmute(): void {
    this.player.muted = false;
  }

  // 播放速率
  setPlaybackRate(rate: number): void {
    this.player.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this.player.playbackRate;
  }

  // 清晰度控制
  getQualities(): PlayerQuality[] {
    // XGPlayer 的清晰度管理
    if (this.isHlsStream && this.player.hls) {
      const levels = this.player.hls.levels || [];
      return levels.map((level: any, index: number) => ({
        level: index,
        label: level.name || (level.height ? `${level.height}P` : `档位 ${index + 1}`),
        width: level.width,
        height: level.height,
        bitrate: level.bitrate
      }));
    }
    return [];
  }

  getCurrentQuality(): number {
    if (this.isHlsStream && this.player.hls) {
      return this.player.hls.currentLevel ?? -1;
    }
    return -1;
  }

  setQuality(level: number): void {
    if (this.isHlsStream && this.player.hls) {
      this.player.hls.currentLevel = level;
    }
  }

  // 全屏控制
  async requestFullscreen(): Promise<void> {
    this.player.getFullscreen();
    this.emit('fullscreenchange', true);
  }

  async exitFullscreen(): Promise<void> {
    this.player.exitFullscreen();
    this.emit('fullscreenchange', false);
  }

  isFullscreen(): boolean {
    return this.player.isFullscreen || false;
  }

  // 状态获取
  getStats(): PlayerStats {
    const video = this.player.video;
    const buffered = video.buffered.length
      ? video.buffered.end(video.buffered.length - 1)
      : 0;

    return {
      currentTime: this.player.currentTime,
      duration: this.player.duration,
      bufferedEnd: buffered,
      paused: this.player.paused,
      volume: this.player.volume,
      rate: this.player.playbackRate
    };
  }

  isPaused(): boolean {
    return this.player.paused;
  }

  getDuration(): number {
    return this.player.duration;
  }

  getCurrentTime(): number {
    return this.player.currentTime;
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
      const video = this.player.video;
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
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    this.eventListeners.clear();
  }

  // 原始实例访问
  getNativePlayer(): any {
    return this.player;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.player?.video || null;
  }
}
