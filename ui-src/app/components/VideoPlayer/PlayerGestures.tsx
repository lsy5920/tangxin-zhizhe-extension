import { useEffect, useRef, useState } from "react";
import { SkipBack, SkipForward, Zap } from "lucide-react";

type Props = {
  containerRef: React.RefObject<HTMLDivElement>;
  onSeek: (time: number) => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
  getCurrentTime: () => number;
  getVolume: () => number;
  seekStep: number;
};

type GestureHint = {
  type: "seek-forward" | "seek-backward" | "speed-up" | "volume-up" | "volume-down";
  value?: number;
};

/**
 * 播放器手势处理组件
 *
 * 职责：
 * - 处理双击快进/快退
 * - 处理长按加速
 * - 处理滑动调节音量
 * - 显示手势提示
 */
export function PlayerGestures({
  containerRef,
  onSeek,
  onRateChange,
  onVolumeChange,
  getCurrentTime,
  getVolume,
  seekStep
}: Props) {
  const [hint, setHint] = useState<GestureHint | null>(null);
  const clickTimerRef = useRef<number>();
  const lastClickRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const longPressTimerRef = useRef<number>();
  const longPressActiveRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // 显示手势提示
  const showHint = (type: GestureHint["type"], value?: number) => {
    setHint({ type, value });
    setTimeout(() => setHint(null), 1000);
  };

  // 双击检测
  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const clickX = e.clientX;
    const timeSinceLastClick = now - lastClickRef.current.time;

    // 双击判定：300ms 内且位置相近
    if (timeSinceLastClick < 300 && Math.abs(clickX - lastClickRef.current.x) < 50) {
      // 双击触发
      handleDoubleClick(clickX);
      lastClickRef.current = { time: 0, x: 0 }; // 重置
    } else {
      // 记录本次点击
      lastClickRef.current = { time: now, x: clickX };
    }
  };

  // 双击快进/快退
  const handleDoubleClick = (clientX: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;

    // 左侧 1/3 快退，右侧 1/3 快进
    if (x < width / 3) {
      // 快退
      const currentTime = getCurrentTime();
      const newTime = Math.max(0, currentTime - seekStep);
      onSeek(newTime);
      showHint("seek-backward", seekStep);
    } else if (x > (width * 2) / 3) {
      // 快进
      const currentTime = getCurrentTime();
      onSeek(currentTime + seekStep);
      showHint("seek-forward", seekStep);
    }
  };

  // 长按加速
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键

    longPressTimerRef.current = window.setTimeout(() => {
      longPressActiveRef.current = true;
      onRateChange(2); // 2倍速
      showHint("speed-up", 2);
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      onRateChange(1); // 恢复正常速度
    }
  };

  // 触摸滑动调节音量
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !swipeStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;

    // 竖直滑动调节音量
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 20) {
      e.preventDefault();

      const currentVolume = getVolume();
      const volumeDelta = -deltaY / 300; // 向上增加音量
      const newVolume = Math.max(0, Math.min(1, currentVolume + volumeDelta));

      onVolumeChange(newVolume);

      if (deltaY < 0) {
        showHint("volume-up", Math.round(newVolume * 100));
      } else {
        showHint("volume-down", Math.round(newVolume * 100));
      }

      // 重置起点，实现连续调节
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = () => {
    swipeStartRef.current = null;
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* 手势捕获层 */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* 手势提示 */}
      {hint && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 bg-black/80 backdrop-blur-sm rounded-2xl shadow-2xl">
            <div className="flex flex-col items-center gap-2">
              {hint.type === "seek-forward" && (
                <>
                  <SkipForward className="w-12 h-12 text-white" />
                  <span className="text-white text-lg font-medium">快进 {hint.value}秒</span>
                </>
              )}
              {hint.type === "seek-backward" && (
                <>
                  <SkipBack className="w-12 h-12 text-white" />
                  <span className="text-white text-lg font-medium">快退 {hint.value}秒</span>
                </>
              )}
              {hint.type === "speed-up" && (
                <>
                  <Zap className="w-12 h-12 text-yellow-400" />
                  <span className="text-white text-lg font-medium">{hint.value}x 倍速</span>
                </>
              )}
              {hint.type === "volume-up" && (
                <>
                  <div className="text-4xl">🔊</div>
                  <span className="text-white text-lg font-medium">音量 {hint.value}%</span>
                </>
              )}
              {hint.type === "volume-down" && (
                <>
                  <div className="text-4xl">🔉</div>
                  <span className="text-white text-lg font-medium">音量 {hint.value}%</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
