import Artplayer from "artplayer";
import Hls from "hls.js";
import type { PlaybackSource } from "./types";
import type { PlaybackNetworkMode, PlayerFillMode } from "./preferences";

export type MediaSnapshot = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  rate: number;
};

export type MediaQuality = { level: number; label: string };

export type MediaKernelEvent =
  | { type: "ready" }
  | { type: "playing" }
  | { type: "pause" }
  | { type: "waiting" }
  | { type: "time"; snapshot: MediaSnapshot }
  | { type: "ended" }
  | { type: "fatal"; kind: "network" | "media" | "other"; message: string }
  | { type: "qualities"; qualities: MediaQuality[]; level: number }
  | { type: "quality"; level: number }
  | { type: "adaptive"; message: string }
  | { type: "error"; message: string };

export type MediaKernelOptions = {
  container: HTMLDivElement;
  onEvent: (event: MediaKernelEvent) => void;
};

const emptySnapshot: MediaSnapshot = {
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
  paused: true,
  volume: 0.8,
  muted: false,
  rate: 1
};

/**
 * ArtPlayer 与 hls.js 的唯一所有者。页面和状态机不接触第三方实例，
 * 因此切会话时可以一次性销毁全部旧事件和网络任务。
 */
export class MediaKernel {
  private readonly container: HTMLDivElement;
  private readonly onEvent: (event: MediaKernelEvent) => void;
  private art: Artplayer | null = null;
  private hls: Hls | null = null;
  private destroyed = false;
  private loadGeneration = 0;
  private networkMode: PlaybackNetworkMode = "balanced";
  private lastAdaptiveDowngradeAt = 0;

  constructor(options: MediaKernelOptions) {
    this.container = options.container;
    this.onEvent = options.onEvent;
  }

  get video() {
    return this.art?.video || null;
  }

  snapshot(): MediaSnapshot {
    const video = this.video;
    if (!video) return emptySnapshot;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    return {
      currentTime,
      duration,
      bufferedEnd: Number.isFinite(bufferedEnd) ? bufferedEnd : 0,
      paused: video.paused,
      volume: video.volume,
      muted: video.muted,
      rate: video.playbackRate || 1
    };
  }

  async load(
    source: PlaybackSource,
    snapshot: Partial<MediaSnapshot> = {},
    fillMode: PlayerFillMode = "contain",
    networkMode: PlaybackNetworkMode = "balanced"
  ) {
    const loadGeneration = this.loadGeneration + 1;
    this.loadGeneration = loadGeneration;
    this.destroyCurrent();
    this.destroyed = false;
    this.networkMode = networkMode;
    this.lastAdaptiveDowngradeAt = 0;
    const useHls = source.protocol === "hls" || /m3u8/i.test(source.url);
    const art = new Artplayer({
      container: this.container,
      url: source.url,
      type: useHls ? "m3u8" : "mp4",
      autoplay: false,
      muted: Boolean(snapshot.muted),
      volume: Number.isFinite(snapshot.volume) ? Number(snapshot.volume) : 0.8,
      playbackRate: true,
      setting: false,
      hotkey: false,
      fullscreen: false,
      fullscreenWeb: false,
      pip: false,
      screenshot: true,
      controls: [],
      contextmenu: [],
      customType: useHls ? {
        m3u8: (video, url) => this.attachHls(video, url, loadGeneration, networkMode)
      } : {}
    });
    this.art = art;
    const active = () => !this.destroyed && this.loadGeneration === loadGeneration && this.art === art;
    let readyEmitted = false;
    const emitReadyOnce = () => {
      if (readyEmitted || !active()) return;
      readyEmitted = true;
      this.emit({ type: "ready" });
    };
    art.on("ready", () => {
      if (!active()) return;
      const video = art.video;
      video.style.objectFit = fillMode;
      video.style.objectPosition = "50% 50%";
      video.playsInline = true;
      if (Number(snapshot.rate) > 0) video.playbackRate = Number(snapshot.rate);
      if (Number(snapshot.currentTime) > 0 && Number.isFinite(Number(snapshot.currentTime))) {
        try { video.currentTime = Number(snapshot.currentTime); } catch { /* 元数据到达后由控制器再恢复一次。 */ }
      }
      emitReadyOnce();
      this.emitTime();
    });
    art.on("video:loadedmetadata", () => {
      if (!active()) return;
      if (Number(snapshot.currentTime) > 0 && art.video.duration > Number(snapshot.currentTime)) {
        art.video.currentTime = Number(snapshot.currentTime);
      }
      emitReadyOnce();
      this.emitTime();
    });
    art.on("video:playing", () => { if (active()) this.emit({ type: "playing" }); });
    art.on("video:pause", () => { if (active()) { this.emit({ type: "pause" }); this.emitTime(); } });
    art.on("video:waiting", () => { if (active()) this.emit({ type: "waiting" }); });
    art.on("video:timeupdate", () => {
      if (!active()) return;
      this.applyBufferProtection();
      this.emitTime();
    });
    art.on("video:progress", () => { if (active()) this.emitTime(); });
    art.on("video:ratechange", () => { if (active()) this.emitTime(); });
    art.on("video:volumechange", () => { if (active()) this.emitTime(); });
    art.on("video:ended", () => { if (active()) this.emit({ type: "ended" }); });
    art.on("video:error", () => {
      if (!active()) return;
      const mediaError = art.video.error;
      this.emit({ type: "error", message: mediaError?.message || `媒体错误 ${mediaError?.code || "unknown"}` });
    });
  }

  async play() {
    if (!this.art) throw new Error("播放器尚未加载资源");
    await Promise.resolve(this.art.play());
  }

  pause() {
    this.art?.pause();
  }

  seek(time: number) {
    if (!this.art) return;
    const duration = Number.isFinite(this.art.duration) ? this.art.duration : 0;
    this.art.currentTime = Math.max(0, duration ? Math.min(duration, time) : time);
  }

  setVolume(volume: number, muted = false) {
    if (!this.art) return;
    this.art.volume = Math.max(0, Math.min(1, volume));
    this.art.muted = muted;
  }

  setRate(rate: number) {
    if (this.art) this.art.playbackRate = rate;
  }

  setFill(fillMode: PlayerFillMode) {
    if (this.video) this.video.style.objectFit = fillMode;
  }

  setNetworkMode(networkMode: PlaybackNetworkMode) {
    this.networkMode = networkMode;
    if (!this.hls) return;
    this.hls.config.capLevelToPlayerSize = networkMode !== "high-quality";
    if (networkMode === "data-saver") {
      const cappedLevel = this.hls.levels.reduce((best, level, index) => (
        Number(level.height || 0) <= 720 && Number(level.bitrate || 0) <= 2_500_000 ? index : best
      ), -1);
      this.hls.autoLevelCapping = cappedLevel >= 0 ? cappedLevel : 0;
    } else {
      this.hls.autoLevelCapping = -1;
    }
  }

  setQuality(level: number) {
    if (!this.hls) return;
    this.hls.currentLevel = level;
    this.emit({ type: "quality", level });
  }

  recoverNetwork() {
    this.hls?.startLoad();
  }

  recoverMedia() {
    this.hls?.recoverMediaError();
  }

  async screenshot(name: string) {
    if (!this.art) throw new Error("播放器尚未加载资源");
    await this.art.screenshot(name);
  }

  togglePip() {
    if (!this.art) return false;
    this.art.pip = !this.art.pip;
    return this.art.pip;
  }

  destroy() {
    this.destroyed = true;
    this.loadGeneration += 1;
    this.destroyCurrent();
  }

  private attachHls(video: HTMLVideoElement, url: string, loadGeneration: number, networkMode: PlaybackNetworkMode) {
    this.hls?.destroy();
    this.hls = null;
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: networkMode !== "high-quality",
        maxBufferLength: 45,
        backBufferLength: 30,
        fragLoadingMaxRetry: 1,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1
      });
      this.hls = hls;
      const active = () => !this.destroyed && this.loadGeneration === loadGeneration && this.hls === hls;
      hls.attachMedia(video);
      hls.loadSource(url);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (!active()) return;
        const qualities = (data.levels || []).map((level, index) => ({
          level: index,
          label: level.height ? `${level.height}P` : level.bitrate ? `${Math.round(level.bitrate / 1000)}K` : `档位 ${index + 1}`
        }));
        if (networkMode === "data-saver") {
          const cappedLevel = (data.levels || []).reduce((best, level, index) => {
            const height = Number(level.height || 0);
            const bitrate = Number(level.bitrate || 0);
            return height <= 720 && bitrate <= 2_500_000 ? index : best;
          }, -1);
          hls.autoLevelCapping = cappedLevel >= 0 ? cappedLevel : 0;
        } else if (networkMode === "high-quality") {
          hls.autoLevelCapping = -1;
        }
        this.emit({ type: "qualities", qualities: [{ level: -1, label: "自动" }, ...qualities], level: hls.currentLevel });
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => { if (active()) this.emit({ type: "quality", level: data.level }); });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!active()) return;
        if (!data.fatal) return;
        const kind = data.type === Hls.ErrorTypes.NETWORK_ERROR
          ? "network"
          : data.type === Hls.ErrorTypes.MEDIA_ERROR
            ? "media"
            : "other";
        this.emit({ type: "fatal", kind, message: `${data.details || data.type || "HLS fatal error"}` });
      });
      return;
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return;
    }
    this.emit({ type: "error", message: "当前浏览器不支持 HLS 播放" });
  }

  private emit(event: MediaKernelEvent) {
    if (!this.destroyed) this.onEvent(event);
  }

  private applyBufferProtection() {
    if (this.networkMode !== "high-quality" || !this.hls || !this.video || this.video.paused) return;
    const snapshot = this.snapshot();
    const bufferAhead = snapshot.bufferedEnd - snapshot.currentTime;
    const currentLevel = this.hls.currentLevel;
    if (bufferAhead >= 5 || currentLevel <= 0 || Date.now() - this.lastAdaptiveDowngradeAt < 10_000) return;
    this.lastAdaptiveDowngradeAt = Date.now();
    this.hls.nextAutoLevel = Math.max(0, currentLevel - 1);
    this.emit({ type: "adaptive", message: "缓冲不足 5 秒，已临时降低一档清晰度" });
  }

  private emitTime() {
    this.emit({ type: "time", snapshot: this.snapshot() });
  }

  private destroyCurrent() {
    this.hls?.destroy();
    this.hls = null;
    if (this.art) {
      try { this.art.destroy(false); } catch { /* 旧实例已销毁时保持幂等。 */ }
    }
    this.art = null;
    this.container.replaceChildren();
  }
}
