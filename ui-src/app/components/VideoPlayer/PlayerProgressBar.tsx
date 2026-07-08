import { useState, useRef, useEffect, useCallback } from "react";
import { formatDuration } from "../../helpers";

type Props = {
  progress: number;   // 0-100
  buffered: number;   // 0-100
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
};

/**
 * 播放器进度条（重构版）
 *
 * 优化：
 * - 悬停时进度条放大更明显（h-1 → h-2.5）
 * - 拖拽手柄始终可见（不再仅拖拽时显示）
 * - 拖拽时显示时间气泡跟随鼠标
 * - 触摸拖拽更顺滑（touch-action: none）
 * - 进度渐变色更鲜亮
 */
export function PlayerProgressBar({
  progress,
  buffered,
  currentTime,
  duration,
  onSeek
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  // 计算某 clientX 对应的视频时间
  const calcTime = useCallback((clientX: number): number => {
    if (!barRef.current || duration <= 0) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  // 悬停预览
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setHoverX(Math.max(0, Math.min(e.clientX - rect.left, rect.width)));
    setHoverTime(calcTime(e.clientX));
  };

  const handleMouseLeave = () => {
    if (!isDragging) setHoverTime(null);
  };

  // 点击跳转
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    onSeek(calcTime(e.clientX));
  };

  // 鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragTime(calcTime(e.clientX));
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const t = calcTime(e.clientX);
      setDragTime(t);
      onSeek(t);
    };
    const onUp = () => {
      setIsDragging(false);
      setDragTime(null);
      setHoverTime(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, calcTime, onSeek]);

  // 触摸拖拽
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const t = calcTime(e.touches[0].clientX);
    setDragTime(t);
    onSeek(t);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragTime(null);
  };

  // 显示用进度百分比（拖拽时实时跟随）
  const displayProgress = isDragging && dragTime !== null
    ? (dragTime / duration) * 100
    : progress;

  const displayTime = isDragging ? dragTime : hoverTime;
  const tipX = isDragging
    ? `${Math.min(Math.max(displayProgress, 0), 100)}%`
    : `${hoverX}px`;

  return (
    <div className="relative w-full group/bar">
      {/* 时间提示气泡 */}
      {displayTime !== null && duration > 0 && (
        <div
          className="absolute bottom-full mb-2 px-2 py-1 bg-black/90 rounded text-white text-xs whitespace-nowrap pointer-events-none z-10 transition-opacity"
          style={{
            left: tipX,
            transform: "translateX(-50%)"
          }}
        >
          {formatDuration(displayTime)}
        </div>
      )}

      {/* 进度条轨道 */}
      <div
        ref={barRef}
        className={[
          "relative w-full rounded-full cursor-pointer transition-all duration-150",
          "h-1.5 group-hover/bar:h-2.5",
          isDragging ? "h-2.5" : ""
        ].join(" ")}
        style={{ background: "rgba(255,255,255,0.2)" }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 缓冲进度 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(buffered, 100)}%`,
            background: "rgba(255,255,255,0.30)"
          }}
        />

        {/* 播放进度（渐变色） */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(displayProgress, 100)}%`,
            background: "linear-gradient(90deg, #ec4899 0%, #a855f7 100%)",
            transition: isDragging ? "none" : "width 0.1s linear"
          }}
        />

        {/* 拖拽手柄（悬停或拖拽时放大显示） */}
        <div
          className={[
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full shadow-lg transition-all duration-150",
            "w-3.5 h-3.5 bg-white opacity-0 group-hover/bar:opacity-100",
            isDragging ? "opacity-100 scale-125" : ""
          ].join(" ")}
          style={{ left: `${Math.min(displayProgress, 100)}%` }}
        />
      </div>
    </div>
  );
}
