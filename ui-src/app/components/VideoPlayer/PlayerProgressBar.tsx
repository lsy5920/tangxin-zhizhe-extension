import { useState, useRef, useEffect } from "react";
import { formatDuration } from "../../helpers";

type Props = {
  progress: number; // 0-100
  buffered: number; // 0-100
  currentTime: number; // 秒
  duration: number; // 秒
  onSeek: (time: number) => void;
};

/**
 * 播放器进度条组件
 *
 * 职责：
 * - 显示播放进度
 * - 显示缓冲进度
 * - 支持点击跳转
 * - 支持拖拽跳转
 * - 悬停显示时间提示
 */
export function PlayerProgressBar({
  progress,
  buffered,
  currentTime,
  duration,
  onSeek
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ time: 0, x: 0 });

  // 计算鼠标位置对应的时间
  const calculateTime = (clientX: number): number => {
    if (!barRef.current) return currentTime;

    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = x / rect.width;
    return percent * duration;
  };

  // 鼠标悬停显示时间
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!barRef.current) return;

    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = calculateTime(e.clientX);

    setHoverX(x);
    setHoverTime(time);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  // 点击跳转
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return; // 拖拽结束时不触发点击

    const time = calculateTime(e.clientX);
    onSeek(time);
  };

  // 拖拽开始
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      time: currentTime,
      x: e.clientX
    };
  };

  // 拖拽中
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = calculateTime(e.clientX);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, duration, onSeek]);

  // 触摸支持
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !isDragging) return;

    const touch = e.touches[0];
    const time = calculateTime(touch.clientX);
    onSeek(time);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div className="w-full">
      {/* 悬停时间提示 */}
      {hoverTime !== null && !isDragging && (
        <div
          className="absolute bottom-full mb-2 px-2 py-1 bg-black/80 rounded text-white text-xs whitespace-nowrap"
          style={{
            left: `${hoverX}px`,
            transform: "translateX(-50%)"
          }}
        >
          {formatDuration(hoverTime)}
        </div>
      )}

      {/* 进度条 */}
      <div
        ref={barRef}
        className="relative w-full h-1 bg-white/30 rounded-full cursor-pointer hover:h-2 transition-all"
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
          className="absolute left-0 top-0 h-full bg-white/40 rounded-full transition-all"
          style={{ width: `${Math.min(buffered, 100)}%` }}
        />

        {/* 播放进度 */}
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />

        {/* 拖拽指示器 */}
        {isDragging && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg"
            style={{ left: `${Math.min(progress, 100)}%`, marginLeft: "-6px" }}
          />
        )}
      </div>
    </div>
  );
}
