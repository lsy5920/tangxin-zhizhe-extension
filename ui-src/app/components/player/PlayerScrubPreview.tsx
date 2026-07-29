import { useEffect, useRef, useState } from "react";
import type shaka from "shaka-player";
import { formatDuration } from "../../helpers";
import type { PlaybackSource } from "../../playback/types";

type Props = {
  source?: PlaybackSource | null;
  sessionKey: string;
  time: number;
  active: boolean;
  fallbackVideo?: HTMLVideoElement | null;
};

type ThumbnailFrame = {
  url: string;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  positionX: number;
  positionY: number;
};

const shakaTransmuxWorkerUrl = globalThis.chrome?.runtime?.getURL?.("dist-ui/shaka-player.transmuxer-worker.js") || "";
let shakaRuntimePromise: Promise<typeof shaka> | null = null;

function loadShakaRuntime() {
  shakaRuntimePromise ||= import("shaka-player").then((module) => module.default);
  return shakaRuntimePromise;
}

function sourceMimeType(source: PlaybackSource) {
  if (source.protocol === "hls" || /\.m3u8(?:$|[?#])/i.test(source.url)) return "application/x-mpegurl";
  if (/\.webm(?:$|[?#])/i.test(source.url)) return "video/webm";
  return "video/mp4";
}

function thumbnailFrame(thumbnail: shaka.extern.Thumbnail | null): ThumbnailFrame | null {
  const url = thumbnail?.uris?.[0];
  if (!thumbnail || !url) return null;
  return {
    url,
    width: Math.max(1, thumbnail.width),
    height: Math.max(1, thumbnail.height),
    imageWidth: Math.max(1, thumbnail.imageWidth || thumbnail.width),
    imageHeight: Math.max(1, thumbnail.imageHeight || thumbnail.height),
    positionX: Math.max(0, thumbnail.positionX),
    positionY: Math.max(0, thumbnail.positionY)
  };
}

/**
 * 独立的目标帧预览器。
 *
 * 优先读取 Shaka 识别出的 HLS 图片/I-frame 缩略图轨；目标站没有缩略图轨时，
 * 启用短缓存、低码率的第二解码会话。主播放器在整个拖动期间不会 seek，因而
 * 画面、音频、续播记录和 Media Session 都保持在手势起点，直到用户松手。
 */
export function PlayerScrubPreview({ source, sessionKey, time, active, fallbackVideo }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<shaka.Player | null>(null);
  const engineGenerationRef = useRef(0);
  const targetTimeRef = useRef(time);
  const seekTimerRef = useRef<number>();
  const seekTimeoutRef = useRef<number>();
  const frameCallbackRef = useRef<number>();
  const seekListenerCleanupRef = useRef<(() => void) | null>(null);
  const seekRequestRef = useRef(0);
  const imageTrackIdRef = useRef<number | null>(null);
  const activeRetryUsedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState<ThumbnailFrame | null>(null);
  const [engineRevision, setEngineRevision] = useState(0);
  const [fallbackReady, setFallbackReady] = useState(false);

  const clearPendingSeek = () => {
    if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    if (seekTimeoutRef.current) window.clearTimeout(seekTimeoutRef.current);
    if (frameCallbackRef.current && videoRef.current?.cancelVideoFrameCallback) {
      videoRef.current.cancelVideoFrameCallback(frameCallbackRef.current);
    }
    seekListenerCleanupRef.current?.();
    seekTimerRef.current = undefined;
    seekTimeoutRef.current = undefined;
    frameCallbackRef.current = undefined;
    seekListenerCleanupRef.current = null;
  };

  const renderLatestTarget = async () => {
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video || failed) return;
    const requestId = seekRequestRef.current + 1;
    seekRequestRef.current = requestId;
    const requestedTime = Number(targetTimeRef.current);
    const target = Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : 0;
    setBusy(true);
    clearPendingSeek();

    const imageTrackId = imageTrackIdRef.current;
    if (imageTrackId !== null) {
      try {
        const nextFrame = thumbnailFrame(await player.getThumbnails(imageTrackId, target));
        if (requestId !== seekRequestRef.current) return;
        if (nextFrame) {
          setFrame(nextFrame);
          setReady(true);
          setBusy(false);
          return;
        }
      } catch {
        // 图片轨偶发失效时降级到视频帧，不让缩略图错误影响主播放会话。
        imageTrackIdRef.current = null;
      }
    }

    setFrame(null);
    const settle = () => {
      if (requestId !== seekRequestRef.current) return;
      video.pause();
      clearPendingSeek();
      setReady(true);
      setBusy(false);
    };
    const onSeeked = () => {
      if (requestId !== seekRequestRef.current) return;
      if (seekTimeoutRef.current) window.clearTimeout(seekTimeoutRef.current);
      if (video.requestVideoFrameCallback) {
        frameCallbackRef.current = video.requestVideoFrameCallback(() => settle());
        // 某些 Android WebView 在暂停态完成 seek 后不派发 video-frame 回调；
        // seeked 已保证目标帧可用，短兜底不能让预览长期卡在“定位中”。
        seekTimeoutRef.current = window.setTimeout(settle, 240);
      } else {
        window.requestAnimationFrame(settle);
      }
    };
    const onMediaError = () => {
      if (requestId !== seekRequestRef.current) return;
      clearPendingSeek();
      setBusy(false);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onMediaError, { once: true });
    seekListenerCleanupRef.current = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onMediaError);
    };
    video.pause();
    const boundedTarget = Math.min(target, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : target);
    if (Math.abs(video.currentTime - boundedTarget) <= 0.04 && video.readyState >= 2) {
      onSeeked();
    } else {
      // 暂停态 seek 会让浏览器只解码目标帧，不启动音频时钟，也不会像 play/pause
      // 预览那样触发额外缓冲和播放状态抖动。
      video.currentTime = boundedTarget;
    }
    seekTimeoutRef.current = window.setTimeout(() => {
      if (requestId !== seekRequestRef.current) return;
      video.pause();
      // 保留上一张已解码帧，不用黑屏覆盖用户已经获得的视觉参照。
      clearPendingSeek();
      setBusy(false);
    }, 4_500);
  };

  useEffect(() => {
    targetTimeRef.current = time;
    if (!active || !playerRef.current || failed) return;
    if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    // 合并高速 pointermove，只解码用户最近停留的目标，避免排队下载过期 TS 分片。
    seekTimerRef.current = window.setTimeout(() => void renderLatestTarget(), 90);
  // renderLatestTarget 只读取 refs；将其放入依赖会让每一帧重建解码会话。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, active, failed]);

  useEffect(() => {
    if (!active) {
      activeRetryUsedRef.current = false;
      return;
    }
    if (failed && !activeRetryUsedRef.current) {
      // 预热可能被 CDN 的一次性 Content-Length 错误打断；真实手势到来时允许重建一次。
      activeRetryUsedRef.current = true;
      setEngineRevision((value) => value + 1);
    }
  }, [active, failed]);

  useEffect(() => {
    if (!active || !fallbackVideo) return;
    const canvas = fallbackCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || fallbackVideo.readyState < 2 || !fallbackVideo.videoWidth || !fallbackVideo.videoHeight) return;
    try {
      context.fillStyle = "#020617";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / fallbackVideo.videoWidth, canvas.height / fallbackVideo.videoHeight);
      const width = fallbackVideo.videoWidth * scale;
      const height = fallbackVideo.videoHeight * scale;
      context.drawImage(fallbackVideo, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      setFallbackReady(true);
    } catch {
      setFallbackReady(false);
    }
  }, [active, fallbackVideo, sessionKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source?.url) {
      setFailed(true);
      return undefined;
    }
    const generation = engineGenerationRef.current + 1;
    engineGenerationRef.current = generation;
    targetTimeRef.current = time;
    setReady(false);
    setBusy(true);
    setFailed(false);
    setFrame(null);
    imageTrackIdRef.current = null;
    let player: shaka.Player | null = null;
    let disposed = false;

    const boot = async () => {
      try {
        const shakaRuntime = await loadShakaRuntime();
        if (disposed || generation !== engineGenerationRef.current) return;
        shakaRuntime.polyfill.installAll();
        player = new shakaRuntime.Player();
        playerRef.current = player;
        await player.attach(video);
        if (disposed || generation !== engineGenerationRef.current) return;
        player.configure({
          streaming: {
            bufferingGoal: 2,
            rebufferingGoal: 0.25,
            bufferBehind: 0,
            stopFetchingOnPause: true,
            segmentPrefetchLimit: 0,
            lowLatencyMode: false,
            retryParameters: {
              maxAttempts: 2,
              baseDelay: 250,
              backoffFactor: 1,
              fuzzFactor: 0,
              timeout: 8_000,
              stallTimeout: 5_000,
              connectionTimeout: 5_000
            }
          },
          abr: {
            enabled: true,
            restrictToElementSize: true,
            restrictToScreenSize: false,
            restrictions: { maxHeight: 360, maxBandwidth: 900_000 }
          },
          mediaSource: { transmuxWorkerUrl: shakaTransmuxWorkerUrl }
        });
        const requestedStartTime = Number(targetTimeRef.current);
        const startTime = Number.isFinite(requestedStartTime) ? Math.max(0, requestedStartTime) : 0;
        await player.load(source.url, startTime, sourceMimeType(source));
        if (disposed || generation !== engineGenerationRef.current) return;
        imageTrackIdRef.current = player.getImageTracks()[0]?.id ?? null;
        await renderLatestTarget();
      } catch {
        if (disposed || generation !== engineGenerationRef.current) return;
        setFailed(true);
        setBusy(false);
      }
    };
    // 延迟一帧启动，pointerdown 后立即移动时直接采用最新目标，少加载一次旧分片。
    const bootTimer = window.setTimeout(() => void boot(), 0);
    return () => {
      disposed = true;
      window.clearTimeout(bootTimer);
      engineGenerationRef.current += 1;
      seekRequestRef.current += 1;
      clearPendingSeek();
      playerRef.current = null;
      imageTrackIdRef.current = null;
      video.pause();
      video.removeAttribute("src");
      void player?.destroy().catch(() => {});
    };
  // sessionKey 是媒体 URL 指纹的一部分；线路更新必须销毁旧签名请求。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, source?.url, engineRevision]);

  const spriteStyle = frame ? {
    backgroundImage: `url("${frame.url.replace(/"/g, "%22")}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${(frame.imageWidth / frame.width) * 100}% ${(frame.imageHeight / frame.height) * 100}%`,
    backgroundPosition: `${frame.imageWidth > frame.width ? (frame.positionX / (frame.imageWidth - frame.width)) * 100 : 0}% ${frame.imageHeight > frame.height ? (frame.positionY / (frame.imageHeight - frame.height)) * 100 : 0}%`
  } : undefined;

  return (
    <div className="txzz-player-scrub-preview relative overflow-hidden rounded-lg border border-white/15 bg-slate-950 shadow-lg">
      <canvas
        ref={fallbackCanvasRef}
        width={240}
        height={135}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-100 ${fallbackReady ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
      {frame ? (
        <div className="absolute inset-0 bg-slate-950 bg-cover" style={spriteStyle} aria-hidden="true" />
      ) : (
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full bg-slate-950 object-contain transition-opacity duration-100 ${ready ? "opacity-100" : "opacity-0"}`}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )}
      {(busy || !ready) && !failed && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/64 px-1.5 py-0.5 text-[9px] font-medium text-white/82">
          {ready ? "正在更新画面" : "正在定位画面"}
        </span>
      )}
      {failed && (
        <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[9px] font-medium text-white/65">
          {fallbackReady ? "预览线路较慢" : "当前线路仅显示目标时间"}
        </span>
      )}
      <span className="absolute bottom-1 right-1 rounded bg-black/72 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-white">
        {formatDuration(time)}
      </span>
    </div>
  );
}
