import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { Download } from "lucide-react";
import { BrandCompanion } from "./BrandCompanion";

type Props = {
  position: { x: number; y: number };
  activeDownloads: number;
  updateAvailable: boolean;
  launcherRef: RefObject<HTMLButtonElement>;
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
  launcherRef,
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
        <span
          className="txzz-floating-launcher-badge"
        >
          <Download size={10} />
          {activeDownloads}
        </span>
      )}
    </button>
  );
}
