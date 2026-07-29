import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { formatDuration } from "../../helpers";
import { PlayerScrubPreview } from "./PlayerScrubPreview";

type CtrlButtonProps = {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  accent?: "sky" | "amber" | "emerald" | "rose" | "none";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
};

/** 播放器主控按钮统一承担触控尺寸、状态语义和按压反馈。 */
export function CtrlButton({
  title,
  onClick,
  disabled,
  active,
  accent = "none",
  size = "md",
  className = "",
  children
}: CtrlButtonProps) {
  const sizeClass = size === "lg"
    ? "min-h-11 min-w-11 px-2.5 text-[12px]"
    : size === "sm"
      ? "min-h-9 min-w-9 px-2 text-[11px]"
      : "min-h-10 min-w-10 px-2 text-[11px]";
  const activeClass = active
    ? accent === "amber"
      ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
      : accent === "emerald"
        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
        : accent === "rose"
          ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
          : "bg-sky-500 text-white shadow-md shadow-sky-500/25"
    : accent === "sky"
      ? "bg-sky-500 text-white shadow-sm shadow-sky-500/25 hover:bg-sky-400"
      : "bg-white/10 text-white hover:bg-white/18";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      className={`txzz-player-control-button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black/70 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35 ${sizeClass} ${activeClass} ${className}`}
    >
      {children}
    </button>
  );
}

type ChipProps = {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
};

/** 设置面板选项按钮，保持可读标签和 40px 以上点击高度。 */
export function CtrlChip({ active, disabled, title, onClick, children, className = "" }: ChipProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`txzz-player-chip inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold leading-tight outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35 ${
        active
          ? "border-sky-400/80 bg-sky-500 text-white shadow-sm shadow-sky-500/20"
          : "border-white/8 bg-white/8 text-white/85 hover:border-white/16 hover:bg-white/14 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

type ProgressProps = {
  duration: number;
  currentTime: number;
  bufferedPercent: number;
  progressPercent: number;
  previewTime: number | null;
  previewVideo?: HTMLVideoElement | null;
  dragging: boolean;
  fullscreen: boolean;
  seekStep: number;
  lineLabel: string;
  qualityLabel: string;
  markers?: Array<{ id: string; time: number; label?: string }>;
  onMarkerSelect?: (id: string, time: number) => void;
  onSeekStart: (ratio: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekMove: (ratio: number) => void;
  onSeekEnd: (ratio: number) => void;
  onSeekCancel: () => void;
  onKeyboardSeek: (seconds: number) => void;
};

export function progressPreviewAlignment(percent: number): "start" | "center" | "end" {
  if (percent <= 15) return "start";
  if (percent >= 85) return "end";
  return "center";
}

export function PlayerProgressBar({
  duration,
  currentTime,
  bufferedPercent,
  progressPercent,
  previewTime,
  previewVideo,
  dragging,
  fullscreen,
  seekStep,
  lineLabel,
  qualityLabel,
  markers = [],
  onMarkerSelect,
  onSeekStart,
  onSeekMove,
  onSeekEnd,
  onSeekCancel,
  onKeyboardSeek
}: ProgressProps) {
  const shownTime = previewTime !== null ? previewTime : currentTime;
  const shownPercent = duration > 0 && previewTime !== null
    ? Math.max(0, Math.min(100, (previewTime / duration) * 100))
    : progressPercent;

  const ratioFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!duration) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "PageUp" && event.key !== "PageDown") return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowLeft" || event.key === "PageDown" ? -1 : 1;
    const multiplier = event.key === "PageUp" || event.key === "PageDown" ? 3 : 1;
    onKeyboardSeek(direction * seekStep * multiplier);
  };

  return (
    <div className={`txzz-player-progress-wrap ${fullscreen ? "mb-2" : "mb-2.5"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] tabular-nums text-white/72">
        <span className="shrink-0 font-semibold text-white">
          <span className={previewTime !== null ? "text-sky-300" : ""}>{formatDuration(shownTime)}</span>
          <span className="px-1 text-white/35">/</span>
          <span>{duration ? formatDuration(duration) : "--:--"}</span>
        </span>
        <span className="min-w-0 truncate text-right">
          {lineLabel} · {qualityLabel}{!fullscreen ? ` · 缓冲 ${bufferedPercent}%` : ""}
        </span>
      </div>
      <div
        role="slider"
        tabIndex={duration ? 0 : -1}
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(shownTime || 0)}
        aria-valuetext={`${formatDuration(shownTime)} / ${duration ? formatDuration(duration) : "未知"}`}
        title="点击或拖动定位；聚焦后可用方向键快退快进"
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!duration) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // 浏览器不支持指针捕获时仍可使用点击定位。
          }
          onSeekStart(ratioFromEvent(event), event);
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          if (!dragging || !duration) return;
          onSeekMove(ratioFromEvent(event));
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (!dragging) return;
          onSeekEnd(ratioFromEvent(event));
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // 指针捕获可能已经由浏览器释放。
          }
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          onSeekCancel();
        }}
        onClick={(event) => event.stopPropagation()}
        className={`txzz-player-progress group/progress relative cursor-pointer rounded-full bg-white/16 outline-none transition-[height,box-shadow] focus-visible:ring-2 focus-visible:ring-sky-300 ${
          dragging ? "h-3.5" : fullscreen ? "h-3 hover:h-3.5" : "h-2.5 hover:h-3"
        }`}
      >
        {previewTime !== null && duration > 0 && (
          <div
            className="pointer-events-none absolute bottom-full z-[7] mb-3"
            style={{ left: `${shownPercent}%` }}
          >
            <div className="txzz-player-progress-preview" data-align={progressPreviewAlignment(shownPercent)}>
              <PlayerScrubPreview video={previewVideo} time={previewTime} />
            </div>
            <span className="absolute -bottom-2 left-0 h-2 w-px bg-sky-300/90 shadow-[0_0_6px_rgba(125,211,252,.75)]" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-white/20" style={{ width: `${bufferedPercent}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.45)]" style={{ width: `${shownPercent}%` }} />
        {markers.filter((marker) => duration > 0 && marker.time >= 0 && marker.time <= duration).map((marker) => (
          <button
            key={marker.id}
            type="button"
            aria-label={`跳转到书签 ${marker.label || formatDuration(marker.time)}`}
            title={marker.label || `书签 ${formatDuration(marker.time)}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMarkerSelect?.(marker.id, marker.time);
            }}
            className="absolute top-1/2 z-[3] h-4 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 bg-fuchsia-400 shadow-[0_0_8px_rgba(244,114,182,.8)] outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ left: `${Math.max(0, Math.min(100, (marker.time / duration) * 100))}%` }}
          />
        ))}
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg ring-2 ring-sky-300/45 transition-transform ${
            dragging ? "scale-110" : "group-hover/progress:scale-105"
          }`}
          style={{ left: `${shownPercent}%` }}
        />
      </div>
    </div>
  );
}
