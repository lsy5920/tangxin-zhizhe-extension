import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { Download, X } from "lucide-react";
import type { NoticeTone } from "../../model/workspaceViewModel";
import { BrandCompanion } from "./BrandCompanion";

const noticeToneClasses: Record<NoticeTone, string> = {
  success: "border-success-100 bg-success-50 text-success-600",
  warning: "border-warning-100 bg-warning-50 text-warning-600",
  danger: "border-danger-100 bg-danger-50 text-danger-600",
  info: "border-info-100 bg-info-50 text-info-600"
};

const noticeDotClasses: Record<NoticeTone, string> = {
  success: "bg-success-500",
  warning: "bg-warning-500 animate-pulse",
  danger: "bg-danger-500",
  info: "bg-info-500"
};

type Props = {
  position: { x: number; y: number };
  activeDownloads: number;
  updateAvailable: boolean;
  showNotice: boolean;
  noticeText: string;
  noticeTone: NoticeTone;
  launcherRef: RefObject<HTMLButtonElement>;
  onHideNotice: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onOpen: () => void;
};

export function FloatingCompanion({
  position,
  activeDownloads,
  updateAvailable,
  showNotice,
  noticeText,
  noticeTone,
  launcherRef,
  onHideNotice,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onOpen
}: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <>
      {showNotice && noticeText && (
        <button
          type="button"
          className={`txzz-flow-bubble txzz-candy-interactive fixed z-40 flex max-w-[min(30rem,calc(100vw-5rem))] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left text-[12px] font-semibold shadow-xl backdrop-blur ${noticeToneClasses[noticeTone]}`}
          style={{
            top: "max(1rem, env(safe-area-inset-top))",
            left: "max(1rem, env(safe-area-inset-left))"
          }}
          onClick={onHideNotice}
          title="点击收起状态提示"
          aria-live="polite"
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white/55 ${noticeDotClasses[noticeTone]}`} />
          <span className="min-w-0 flex-1 truncate">{noticeText}</span>
          <X size={13} className="shrink-0 opacity-60" />
        </button>
      )}

      <button
        ref={launcherRef}
        data-testid="txzz-floating-companion"
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        className="txzz-floating-launcher txzz-candy-interactive fixed z-50 cursor-grab select-none touch-none border-0 bg-transparent p-0 active:cursor-grabbing"
        style={{
          right: "max(1.25rem, env(safe-area-inset-right))",
          bottom: "max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
          transform: `translate(${position.x}px, ${position.y}px)`
        }}
        title="打开糖心志者"
        aria-label={`打开糖心志者${activeDownloads > 0 ? `，有 ${activeDownloads} 个下载任务` : ""}${updateAvailable ? "，有新版本" : ""}`}
      >
        <span className="txzz-floating-launcher-halo" />
        <BrandCompanion />
        <span
          className={`txzz-floating-launcher-status ${updateAvailable ? "bg-warning-500 animate-pulse" : activeDownloads > 0 ? "bg-info-500 animate-pulse" : "bg-success-500"}`}
        />
        {activeDownloads > 0 && (
          <span className="txzz-floating-launcher-badge">
            <Download size={10} />
            {activeDownloads}
          </span>
        )}
      </button>
    </>
  );
}
