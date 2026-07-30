import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { formatDuration } from "../../helpers";
import type { PlaybackSource } from "../../playback/types";
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
    ? "is-lg"
    : size === "sm"
      ? "is-sm"
      : "is-md";
  const activeClass = active
    ? accent === "amber" ? "is-active is-amber"
      : accent === "emerald" ? "is-active is-emerald"
        : accent === "rose" ? "is-active is-rose"
          : "is-active"
    : accent === "sky"
      ? "is-primary"
      : "";

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
      className={`txzz-player-control-button ${sizeClass} ${activeClass} ${className}`}
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
      className={`txzz-player-chip ${active ? "is-active" : ""} ${className}`}
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
  previewSource?: PlaybackSource | null;
  previewSessionKey: string;
  previewFallbackVideo?: HTMLVideoElement | null;
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
  previewSource,
  previewSessionKey,
  previewFallbackVideo,
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
    <div className={`txzz-player-progress-wrap ${fullscreen ? "is-fullscreen" : ""}`}>
      <div className="txzz-player-progress-meta">
        <span>
          <span className={previewTime !== null ? "is-previewing" : ""}>{formatDuration(shownTime)}</span>
          <span>/</span>
          <span>{duration ? formatDuration(duration) : "--:--"}</span>
        </span>
        <span>
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
        className={`txzz-player-progress ${dragging ? "is-dragging" : ""}`}
      >
        {duration > 0 && (
          <div
            className={`pointer-events-none absolute bottom-full z-[7] mb-3 ${previewTime === null ? "invisible" : "visible"}`}
            style={{ left: `${shownPercent}%` }}
            aria-hidden={previewTime === null}
          >
            <div className="txzz-player-progress-preview" data-align={progressPreviewAlignment(shownPercent)}>
              <PlayerScrubPreview
                source={previewSource}
                sessionKey={previewSessionKey}
                time={previewTime ?? currentTime}
                active={previewTime !== null}
                fallbackVideo={previewFallbackVideo}
              />
            </div>
            {previewTime !== null && (
              <span className="txzz-player-preview-anchor" aria-hidden="true" />
            )}
          </div>
        )}
        <div className="txzz-player-progress-buffer" style={{ width: `${bufferedPercent}%` }} />
        <div className="txzz-player-progress-played" style={{ width: `${shownPercent}%` }} />
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
            className="txzz-player-progress-marker"
            style={{ left: `${Math.max(0, Math.min(100, (marker.time / duration) * 100))}%` }}
          />
        ))}
        <div className="txzz-player-progress-thumb" style={{ left: `${shownPercent}%` }} />
      </div>
    </div>
  );
}
