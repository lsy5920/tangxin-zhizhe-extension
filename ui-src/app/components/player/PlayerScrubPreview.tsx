import { useEffect, useRef, useState } from "react";
import { formatDuration } from "../../helpers";

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

type Props = {
  video?: HTMLVideoElement | null;
  time: number;
};

/**
 * 横滑与进度条共用的实时画面预览。
 * 只复用主 video 的已解码输出，不创建第二个 ArtPlayer/Hls，也不重新请求签名线路。
 */
export function PlayerScrubPreview({ video, time }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const livePreviewRef = useRef<HTMLVideoElement>(null);
  const [livePreviewReady, setLivePreviewReady] = useState(false);

  useEffect(() => {
    const preview = livePreviewRef.current;
    if (!preview || !video) return undefined;
    setLivePreviewReady(false);
    const source = video as CapturableVideo;
    const capture = source.captureStream || source.mozCaptureStream;
    if (!capture) return undefined;

    let stream: MediaStream;
    try {
      stream = capture.call(source);
    } catch {
      return undefined;
    }
    const markReady = () => setLivePreviewReady(true);
    preview.srcObject = stream;
    preview.addEventListener("loadeddata", markReady);
    preview.addEventListener("playing", markReady);
    void preview.play().catch(() => {});
    return () => {
      preview.removeEventListener("loadeddata", markReady);
      preview.removeEventListener("playing", markReady);
      preview.srcObject = null;
      for (const track of stream.getTracks()) track.stop();
    };
  }, [video]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    let animationFrame = 0;
    let videoFrame = 0;

    const draw = () => {
      context.fillStyle = "#020617";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      // seeked 可能属于上一次节流定位；只接受与当前目标足够接近的帧。
      if (Math.abs(Number(video.currentTime || 0) - time) > 1.25) return;
      try {
        // contain 保持真实比例，9:16 画面在缩略图内不被裁切。
        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      } catch {
        // 个别浏览器会拒绝跨域 canvas 合成；此时保留黑色安全占位。
      }
    };
    const scheduleDraw = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(draw);
    };
    video?.addEventListener("seeked", scheduleDraw);
    scheduleDraw();
    if (video?.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(scheduleDraw);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (videoFrame && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame);
      video?.removeEventListener("seeked", scheduleDraw);
    };
  }, [time, video]);

  return (
    <div className="txzz-player-scrub-preview relative overflow-hidden rounded-lg border border-white/15 bg-slate-950 shadow-lg">
      <canvas ref={canvasRef} width={240} height={135} className="block h-full w-full object-contain" aria-hidden="true" />
      <video
        ref={livePreviewRef}
        className={`absolute inset-0 h-full w-full bg-slate-950 object-contain transition-opacity duration-100 ${livePreviewReady ? "opacity-100" : "opacity-0"}`}
        muted
        playsInline
        aria-hidden="true"
      />
      {!livePreviewReady && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/64 px-1.5 py-0.5 text-[9px] font-medium text-white/82">
          正在定位画面
        </span>
      )}
      <span className="absolute bottom-1 right-1 rounded bg-black/72 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-white">
        {formatDuration(time)}
      </span>
    </div>
  );
}
