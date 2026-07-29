import shaka from "shaka-player";
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
  | { type: "adaptive"; message: string };

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

let shakaPolyfillsInstalled = false;
const shakaTransmuxWorkerUrl = globalThis.chrome?.runtime?.getURL?.("dist-ui/shaka-player.transmuxer-worker.js") || "";

function installShakaPolyfills() {
  if (shakaPolyfillsInstalled) return;
  shaka.polyfill.installAll();
  shakaPolyfillsInstalled = true;
}

function shakaErrorMessage(error: unknown) {
  const detail = error as { code?: number; message?: string; data?: unknown[] } | null;
  const code = Number(detail?.code || 0);
  const message = String(detail?.message || "").trim();
  const data = Array.isArray(detail?.data)
    ? detail.data.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean).join(" · ")
    : "";
  return [code ? `Shaka ${code}` : "", message, data].filter(Boolean).join(" · ") || "媒体内核发生未知错误";
}

function errorKind(category: number): "network" | "media" | "other" {
  if (category === shaka.util.Error.Category.NETWORK) return "network";
  if (category === shaka.util.Error.Category.MEDIA) return "media";
  return "other";
}

function qualityLabel(track: shaka.extern.Track) {
  if (Number(track.height) > 0) return `${track.height}P`;
  if (Number(track.bandwidth) > 0) return `${Math.round(track.bandwidth / 1000)}K`;
  return `档位 ${track.id}`;
}

function mimeTypeOf(source: PlaybackSource) {
  if (source.protocol === "hls" || /\.m3u8(?:$|[?#])/i.test(source.url)) return "application/x-mpegurl";
  if (/\.webm(?:$|[?#])/i.test(source.url)) return "video/webm";
  return "video/mp4";
}

/**
 * Shaka Player 媒体适配器。
 *
 * 页面只接触稳定的 load/play/pause/seek/quality 接口；HLS、AES-128、ABR、
 * MSE 恢复和 TS→fMP4 转封装全部交给成熟内核。每次加载都使用 generation
 * 与实例身份双重守卫，旧线路事件不能写回新会话。
 */
export class MediaKernel {
  private readonly container: HTMLDivElement;
  private readonly onEvent: (event: MediaKernelEvent) => void;
  private player: shaka.Player | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private destroyed = false;
  private loadGeneration = 0;
  private networkMode: PlaybackNetworkMode = "balanced";
  private manualTrackId = -1;
  private readyEmitted = false;
  private listenerCleanups: Array<() => void> = [];
  private pendingDestroy: Promise<void> = Promise.resolve();

  constructor(options: MediaKernelOptions) {
    this.container = options.container;
    this.onEvent = options.onEvent;
    installShakaPolyfills();
  }

  get video() {
    return this.videoElement;
  }

  snapshot(): MediaSnapshot {
    const video = this.video;
    if (!video) return emptySnapshot;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    let bufferedEnd = 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);
      if (currentTime >= start - 0.25 && currentTime <= end + 0.25) bufferedEnd = end;
      else if (!bufferedEnd) bufferedEnd = Math.max(bufferedEnd, end);
    }
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
    await this.destroyCurrent();
    // destroy() 或后发 load() 可能在旧实例销毁期间抢先建立新边界。
    // 此处绝不能复活过期装载，否则会重新插入第二个 video/Shaka 实例。
    if (this.destroyed || this.loadGeneration !== loadGeneration) return;
    this.networkMode = networkMode;
    this.manualTrackId = -1;
    this.readyEmitted = false;

    const video = document.createElement("video");
    video.className = "txzz-shaka-video";
    video.playsInline = true;
    video.preload = "auto";
    video.controls = false;
    video.autoplay = false;
    video.muted = Boolean(snapshot.muted);
    video.volume = Number.isFinite(snapshot.volume) ? Number(snapshot.volume) : 0.8;
    video.playbackRate = Number(snapshot.rate) > 0 ? Number(snapshot.rate) : 1;
    video.style.objectFit = fillMode;
    video.style.objectPosition = "50% 50%";
    this.container.replaceChildren(video);

    const player = new shaka.Player();
    this.player = player;
    this.videoElement = video;
    const active = () => !this.destroyed
      && this.loadGeneration === loadGeneration
      && this.player === player
      && this.videoElement === video;

    try {
      this.bindEvents(player, video, active);
      await player.attach(video);
      if (!active()) return;
      player.configure({
        streaming: {
          // 旧实现一次追 35～50 秒缓冲，会让移动端同时承担过量下载、AES 解密和 TS 转封装。
          // 保留足够抗抖余量，但把前台 CPU/内存预算收回到更接近 Shaka 官方默认的范围。
          bufferingGoal: networkMode === "data-saver" ? 12 : networkMode === "high-quality" ? 30 : 20,
          rebufferingGoal: 2,
          bufferBehind: networkMode === "data-saver" ? 12 : 24,
          lowLatencyMode: false,
          stopFetchingOnPause: false,
          segmentPrefetchLimit: networkMode === "data-saver" ? 0 : 1,
          retryParameters: {
            maxAttempts: 2,
            baseDelay: 500,
            backoffFactor: 2,
            fuzzFactor: 0.25,
            timeout: 20_000,
            stallTimeout: 12_000,
            connectionTimeout: 10_000
          }
        },
        ...(shakaTransmuxWorkerUrl ? {
          mediaSource: {
            // TS 转封装放进扩展自带 Worker，避免移动端拖慢 React 与手势主线程。
            transmuxWorkerUrl: shakaTransmuxWorkerUrl
          }
        } : {}),
        manifest: {
          retryParameters: {
            maxAttempts: 2,
            baseDelay: 500,
            backoffFactor: 2,
            fuzzFactor: 0.25,
            timeout: 15_000,
            stallTimeout: 10_000,
            connectionTimeout: 10_000
          }
        }
      });
      this.applyNetworkMode();

      const initialTime = Number(snapshot.currentTime) > 0 ? Number(snapshot.currentTime) : 0;
      await player.load(source.url, initialTime, mimeTypeOf(source));
      if (!active()) return;

      video.playbackRate = Number(snapshot.rate) > 0 ? Number(snapshot.rate) : 1;
      this.readyEmitted = true;
      this.refreshQualities();
      this.emit({ type: "ready" });
      this.emitTime();
    } catch (error) {
      // 后发线路或 destroy() 已接管时，旧 attach/load 的拒绝属于正常取消，不能污染新会话。
      const reportable = !this.destroyed
        && this.loadGeneration === loadGeneration
        && this.player === player
        && this.videoElement === video;
      if (!reportable) return;
      const message = shakaErrorMessage(error);
      await this.destroyCurrent();
      throw new Error(message);
    }
  }

  async play() {
    const video = this.video;
    if (!video) throw new Error("播放器尚未加载资源");
    await video.play();
  }

  pause() {
    this.video?.pause();
  }

  seek(time: number) {
    const video = this.video;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.max(0, duration ? Math.min(duration, time) : time);
  }

  setVolume(volume: number, muted = false) {
    const video = this.video;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, volume));
    video.muted = muted;
  }

  setRate(rate: number) {
    if (this.video) this.video.playbackRate = rate;
  }

  setFill(fillMode: PlayerFillMode) {
    if (this.video) this.video.style.objectFit = fillMode;
  }

  setNetworkMode(networkMode: PlaybackNetworkMode) {
    this.networkMode = networkMode;
    this.applyNetworkMode();
  }

  setQuality(level: number) {
    const player = this.player;
    if (!player) return;
    if (level < 0) {
      this.manualTrackId = -1;
      player.configure("abr.enabled", true);
      this.emit({ type: "quality", level: -1 });
      return;
    }
    const track = player.getVariantTracks().find((item) => item.id === level);
    if (!track) return;
    this.manualTrackId = track.id;
    player.configure("abr.enabled", false);
    player.selectVariantTrack(track, true, 2);
    this.emit({ type: "quality", level: track.id });
  }

  recoverNetwork() {
    this.player?.retryStreaming(0);
  }

  recoverMedia() {
    this.player?.retryStreaming(0);
  }

  async screenshot(name: string) {
    const video = this.video;
    if (!video || !video.videoWidth || !video.videoHeight) throw new Error("播放器尚未解码画面");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建截图画布");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("截图编码失败")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async togglePip() {
    const video = this.video;
    if (!video || !document.pictureInPictureEnabled) return false;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return false;
    }
    await video.requestPictureInPicture();
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.loadGeneration += 1;
    void this.destroyCurrent();
  }

  private bindEvents(player: shaka.Player, video: HTMLVideoElement, active: () => boolean) {
    const listen = (target: EventTarget, type: string, listener: EventListener) => {
      target.addEventListener(type, listener);
      this.listenerCleanups.push(() => target.removeEventListener(type, listener));
    };
    listen(video, "playing", () => { if (active()) this.emit({ type: "playing" }); });
    listen(video, "pause", () => {
      if (!active()) return;
      this.emit({ type: "pause" });
      this.emitTime();
    });
    listen(video, "waiting", () => { if (active() && !video.seeking) this.emit({ type: "waiting" }); });
    listen(video, "timeupdate", () => { if (active()) this.emitTime(); });
    listen(video, "progress", () => { if (active()) this.emitTime(); });
    listen(video, "ratechange", () => { if (active()) this.emitTime(); });
    listen(video, "volumechange", () => { if (active()) this.emitTime(); });
    listen(video, "ended", () => { if (active()) this.emit({ type: "ended" }); });
    listen(player, "buffering", ((event: Event & { buffering?: boolean }) => {
      if (active() && event.buffering) this.emit({ type: "waiting" });
    }) as EventListener);
    listen(player, "trackschanged", () => { if (active()) this.refreshQualities(); });
    listen(player, "variantchanged", () => {
      if (!active()) return;
      this.refreshQualities();
      if (this.manualTrackId < 0) {
        const activeTrack = player.getVariantTracks().find((track) => track.active);
        if (activeTrack) this.emit({ type: "adaptive", message: `自适应画质 · ${qualityLabel(activeTrack)}` });
      }
    });
    listen(player, "error", ((event: Event & { detail?: shaka.util.Error }) => {
      if (!active() || !this.readyEmitted) return;
      const detail = event.detail;
      if (!detail || detail.severity !== shaka.util.Error.Severity.CRITICAL) return;
      this.emit({
        type: "fatal",
        kind: errorKind(detail.category),
        message: shakaErrorMessage(detail)
      });
    }) as EventListener);
  }

  private applyNetworkMode() {
    const player = this.player;
    if (!player) return;
    const dataSaver = this.networkMode === "data-saver";
    const highQuality = this.networkMode === "high-quality";
    player.configure({
      abr: {
        enabled: this.manualTrackId < 0,
        restrictToElementSize: !highQuality,
        restrictToScreenSize: false,
        restrictions: {
          maxHeight: dataSaver ? 720 : Infinity,
          maxBandwidth: dataSaver ? 2_500_000 : Infinity
        }
      }
    });
  }

  private refreshQualities() {
    const player = this.player;
    if (!player) return;
    const seen = new Set<number>();
    const qualities = player.getVariantTracks()
      .filter((track) => {
        if (seen.has(track.id)) return false;
        seen.add(track.id);
        return true;
      })
      .sort((left, right) => Number(left.height || left.bandwidth || 0) - Number(right.height || right.bandwidth || 0))
      .map((track) => ({ level: track.id, label: qualityLabel(track) }));
    this.emit({ type: "qualities", qualities: [{ level: -1, label: "自动" }, ...qualities], level: this.manualTrackId });
  }

  private emit(event: MediaKernelEvent) {
    if (!this.destroyed) this.onEvent(event);
  }

  private emitTime() {
    this.emit({ type: "time", snapshot: this.snapshot() });
  }

  private async destroyCurrent() {
    const player = this.player;
    const video = this.videoElement;
    this.player = null;
    this.videoElement = null;
    this.readyEmitted = false;
    for (const cleanup of this.listenerCleanups.splice(0)) cleanup();
    if (video) {
      video.pause();
      video.removeAttribute("src");
    }
    if (this.container.contains(video)) this.container.replaceChildren();
    if (!player) {
      await this.pendingDestroy;
      return;
    }
    this.pendingDestroy = this.pendingDestroy
      .then(() => player.destroy())
      .then(() => undefined)
      .catch(() => undefined);
    await this.pendingDestroy;
  }
}
