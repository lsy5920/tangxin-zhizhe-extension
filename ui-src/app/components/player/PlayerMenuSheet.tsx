import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Activity,
  Check,
  Film,
  Layers,
  PictureInPicture2,
  Ratio,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Route,
  SkipForward,
  Sun,
  Volume2,
  Wrench,
  X
} from "lucide-react";
import { CtrlButton, CtrlChip } from "./PlayerControls";
import type { PlayerGestureLayout } from "../../playback/gestureLayout";

export type PlayerMorePanelKey = "source" | "view" | "tools";

export type PlayerPreviewOption = {
  key: string;
  label: string;
  url: string;
  hint: string;
};

export type PlayerMenuSheetProps = {
  open: boolean;
  panel: PlayerMorePanelKey;
  disabled: boolean;
  fullscreen: boolean;
  muted: boolean;
  volume: number;
  rate: number;
  seekStep: number;
  brightness: number;
  rateOptions: number[];
  seekStepOptions: number[];
  qualities: { level: number; label: string }[];
  qualityLevel: number;
  qualityLabel: string;
  previewOptions: PlayerPreviewOption[];
  activePreviewKey: string;
  previewSourceLabel: string;
  playerStatus: string;
  currentLineLabel: string;
  fillLabel: string;
  fitLabel: string;
  orientationLabel: string;
  fullscreenDiagnosticLabel: string;
  fitMode: "auto" | "wide" | "vertical";
  orientationMode: "auto" | "landscape" | "portrait";
  orientationRequested: boolean;
  networkMode: "data-saver" | "balanced" | "high-quality";
  gestureLayout: PlayerGestureLayout;
  onClose: () => void;
  onSetPanel: (panel: PlayerMorePanelKey) => void;
  onSelectPreview: (key: string) => void;
  onSetQuality: (level: number) => void;
  onSetRate: (rate: number) => void;
  onSetSeekStep: (step: number) => void;
  onCycleFit: () => void;
  onCycleFill: () => void;
  onCycleOrientation: () => void;
  onVolumeChange: (volume: number) => void;
  onBrightnessChange: (value: number) => void;
  onScreenshot: () => void;
  onReload: () => void;
  onPip: () => void;
  onRecenter: () => void;
  onDiagnostic: () => void;
  onSetNetworkMode: (mode: "data-saver" | "balanced" | "high-quality") => void;
  onSetGestureLayout: (layout: PlayerGestureLayout) => void;
};

function MenuSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="txzz-player-menu-section rounded-2xl border border-white/8 bg-white/[0.055] p-3">
      <div className="mb-2.5">
        <h4 className="text-[11px] font-semibold tracking-wide text-white">{title}</h4>
        {hint && <p className="mt-0.5 text-[10px] leading-relaxed text-white/48">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function PlayerMenuSheet(props: PlayerMenuSheetProps) {
  const {
    open, panel, disabled, fullscreen, muted, volume, rate, seekStep, brightness,
    rateOptions, seekStepOptions, qualities, qualityLevel, qualityLabel,
    previewOptions, activePreviewKey, previewSourceLabel, playerStatus, currentLineLabel,
    fillLabel, fitLabel, orientationLabel, fullscreenDiagnosticLabel,
    fitMode, orientationMode, orientationRequested, networkMode, gestureLayout,
    onClose, onSetPanel, onSelectPreview, onSetQuality, onSetRate, onSetSeekStep,
    onCycleFit, onCycleFill, onCycleOrientation, onVolumeChange,
    onBrightnessChange, onScreenshot, onReload, onPip, onRecenter,
    onDiagnostic, onSetNetworkMode, onSetGestureLayout
  } = props;

  const menuRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    if (!menu) return undefined;
    const root = menu.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    previousFocusRef.current = active instanceof HTMLElement ? active : null;
    const frame = window.requestAnimationFrame(() => {
      menu.querySelector<HTMLElement>("[role='tab'][aria-selected='true'], button:not(:disabled), input:not(:disabled)")?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      window.requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, [open]);

  if (!open) return null;
  const volumePercent = muted ? 0 : Math.round(volume * 100);
  const qualityOptions = Array.from(new Map(
    qualities.filter((item) => item.level >= 0).map((item) => [item.level, item])
  ).values());
  const tabs = [
    { key: "source" as const, label: "片源", icon: Route },
    { key: "view" as const, label: "观看", icon: Ratio },
    { key: "tools" as const, label: "工具", icon: Wrench }
  ];
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"
    ) || []).filter((node) => !node.hasAttribute("aria-hidden"));
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(event.target as HTMLElement);
    const nextIndex = currentIndex < 0
      ? (event.shiftKey ? focusable.length - 1 : 0)
      : event.shiftKey
        ? (currentIndex - 1 + focusable.length) % focusable.length
        : (currentIndex + 1) % focusable.length;
    event.preventDefault();
    focusable[nextIndex].focus();
  };

  return (
    <>
      <div
        className="txzz-player-menu-backdrop"
        aria-hidden="true"
        onClick={(event) => { event.stopPropagation(); onClose(); }}
        onPointerDown={(event) => event.stopPropagation()}
      />
    <div
      ref={menuRef}
      role="dialog"
      aria-modal="true"
      aria-label="播放器设置"
      className="txzz-player-menu-sheet"
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white">播放器设置</p>
          <p className="mt-0.5 truncate text-[10px] text-white/48">{currentLineLabel} · {qualityLabel} · {playerStatus}</p>
        </div>
        <CtrlButton title="关闭播放器设置（Esc）" size="sm" onClick={onClose}>
          <X size={15} />
        </CtrlButton>
      </header>

      <div className="txzz-player-menu-tabs grid gap-1.5 border-b border-white/8 bg-black/15 p-2" role="tablist" aria-label="播放器设置分类">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = panel === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`txzz-player-tab-${item.key}`}
              aria-selected={active}
              aria-controls={active ? `txzz-player-panel-${item.key}` : undefined}
              tabIndex={active ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onSetPanel(item.key);
              }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                const currentIndex = tabs.findIndex((tab) => tab.key === item.key);
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (currentIndex + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
                const next = tabs[nextIndex];
                onSetPanel(next.key);
                window.requestAnimationFrame(() => {
                  menuRef.current?.querySelector<HTMLElement>(`#txzz-player-tab-${next.key}`)?.focus({ preventScroll: true });
                });
              }}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 ${
                active ? "bg-white text-slate-950 shadow-sm" : "text-white/58 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div id={`txzz-player-panel-${panel}`} role="tabpanel" aria-labelledby={`txzz-player-tab-${panel}`} className="txzz-player-menu-body space-y-2.5 overflow-y-auto p-2.5">
        {panel === "source" && (
          <>
            <MenuSection title="播放策略" hint="均衡模式按带宽和播放器尺寸选档；用户明确选择始终优先。">
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ["data-saver", "省流", "720P 上限"],
                  ["balanced", "均衡", "尺寸自适应"],
                  ["high-quality", "高清", "优先高画质"]
                ] as const).map(([key, label, hint]) => (
                  <CtrlChip key={key} active={networkMode === key} onClick={() => onSetNetworkMode(key)} title={`${label}模式：${hint}`} className="min-h-[3.25rem] flex-col gap-0.5">
                    <span>{label}</span><span className="text-[9px] font-normal opacity-55">{hint}</span>
                  </CtrlChip>
                ))}
              </div>
            </MenuSection>

            <MenuSection title="播放线路" hint="手动换线立即生效；自动切线只尝试本场尚未使用的健康线路。">
              <div className="txzz-player-line-grid grid gap-1.5">
                {previewOptions.map((item) => (
                  <CtrlChip
                    key={item.key}
                    active={activePreviewKey === item.key}
                    disabled={!item.url}
                    title={`切换到${item.label}：${item.hint}`}
                    onClick={() => onSelectPreview(item.key)}
                    className="min-h-[3.5rem] flex-col gap-1 px-1.5 py-2"
                  >
                    <span className="flex items-center gap-1 text-[11px]">
                      {activePreviewKey === item.key && <Check size={11} />} {item.label}
                    </span>
                    <span className="max-w-full truncate text-[10px] font-normal opacity-55">{item.hint}</span>
                  </CtrlChip>
                ))}
              </div>
              <p className="mt-2 truncate rounded-lg bg-black/18 px-2.5 py-1.5 text-[10px] text-white/52">
                {previewSourceLabel} · {playerStatus}
              </p>
            </MenuSection>

            <MenuSection title="清晰度" hint={qualityOptions.length ? "自动模式根据网络和缓冲动态选档，也可临时固定清晰度。" : "当前线路没有可切换的 HLS 档位。"}>
              <div className="txzz-player-quality-grid grid gap-1.5">
                <CtrlChip active={qualityLevel < 0} disabled={disabled} onClick={() => onSetQuality(-1)} title="自动清晰度">自动</CtrlChip>
                {qualityOptions.map((item) => (
                  <CtrlChip key={item.level} active={qualityLevel === item.level} onClick={() => onSetQuality(item.level)} title={`固定清晰度 ${item.label}`}>
                    {item.label}
                  </CtrlChip>
                ))}
              </div>
            </MenuSection>
          </>
        )}

        {panel === "view" && (
          <>
            <MenuSection title="播放习惯" hint="主控制栏负责快速操作；这里用于精确设置倍速与跳转步长。">
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <CtrlChip active={gestureLayout === "standard"} onClick={() => onSetGestureLayout("standard")} title="标准手势：左侧快退，右侧快进">
                  左退 · 右进
                </CtrlChip>
                <CtrlChip active={gestureLayout === "mirrored"} onClick={() => onSetGestureLayout("mirrored")} title="镜像手势：左侧快进，右侧快退">
                  左进 · 右退
                </CtrlChip>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {rateOptions.map((item) => (
                  <CtrlChip key={item} active={rate === item} onClick={() => onSetRate(item)} title={`播放倍速 ${item}x`}>{item}x</CtrlChip>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {seekStepOptions.map((item) => (
                  <CtrlChip key={item} active={seekStep === item} onClick={() => onSetSeekStep(item)} title={`快退快进步长 ${item} 秒`}>
                    <SkipForward size={11} /> {item}秒
                  </CtrlChip>
                ))}
              </div>
            </MenuSection>

            <MenuSection title="画面布局" hint="竖屏片源会自动使用受视口约束的影院画布，不再把页面无限撑高。">
              <div className="grid grid-cols-3 gap-1.5">
                <CtrlChip active={fitMode !== "auto"} onClick={onCycleFit} disabled={disabled} title={`切换画面比例，当前${fitLabel}`}>
                  {fitMode === "vertical" ? <RectangleVertical size={12} /> : fitMode === "wide" ? <RectangleHorizontal size={12} /> : <Ratio size={12} />} {fitLabel}
                </CtrlChip>
                <CtrlChip onClick={onCycleFill} disabled={disabled} title={`切换填充方式，当前${fillLabel}`}>
                  <Layers size={12} /> {fillLabel}
                </CtrlChip>
                <CtrlChip active={orientationMode !== "auto" || orientationRequested} onClick={onCycleOrientation} disabled={disabled} title={`切换观看方向，当前${orientationLabel}`}>
                  {orientationRequested || orientationMode === "landscape" ? <RectangleHorizontal size={12} /> : <RectangleVertical size={12} />} {orientationLabel}
                </CtrlChip>
              </div>
            </MenuSection>

            <div className="txzz-player-menu-dual grid gap-2.5">
              <MenuSection title="画面亮度" hint="使用独立遮罩，兼容 Android / Kiwi。">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-300/15 text-amber-200"><Sun size={15} /></span>
                  <input
                    aria-label="画面亮度"
                    type="range"
                    min={60}
                    max={140}
                    step={5}
                    value={brightness}
                    onChange={(event) => onBrightnessChange(Number(event.target.value))}
                    className="txzz-player-range min-w-0 flex-1 accent-amber-300"
                  />
                  <span className="w-11 text-right text-[11px] font-semibold tabular-nums text-white">{brightness}%</span>
                </div>
              </MenuSection>

              <MenuSection title="播放音量" hint="静音保留在主控制栏，避免重复按钮。">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-300/15 text-sky-200"><Volume2 size={15} /></span>
                  <input
                    aria-label="播放音量"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumePercent}
                    onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                    className="txzz-player-range min-w-0 flex-1 accent-sky-400"
                  />
                  <span className="w-11 text-right text-[11px] font-semibold tabular-nums text-white">{volumePercent}%</span>
                </div>
              </MenuSection>
              </div>
          </>
        )}

        {panel === "tools" && (
          <>
            <MenuSection title="播放工具" hint="片源链接和下载统一在下方片源抽屉处理，避免同一动作出现多次。">
              <div className="txzz-player-tool-grid grid gap-1.5">
                <ToolButton icon={RefreshCw} label="重载" hint="重建当前播放源" onClick={onReload} disabled={disabled} />
                <ToolButton icon={PictureInPicture2} label="画中画" hint="悬浮到其他页面" onClick={onPip} disabled={disabled} />
                <ToolButton icon={Film} label="截图" hint="保存当前画面" onClick={onScreenshot} disabled={disabled} />
                <ToolButton icon={Ratio} label="全屏校准" hint={fullscreen ? "重新测量居中" : "进入全屏后可用"} onClick={onRecenter} disabled={disabled || !fullscreen} />
                <ToolButton icon={Activity} label="诊断" hint="页内查看报告" onClick={onDiagnostic} disabled={disabled} />
              </div>
            </MenuSection>
          </>
        )}
      </div>

      <footer className="border-t border-white/8 bg-black/18 px-3 py-2 text-[10px] text-white/48">
        <p className="truncate">{currentLineLabel} · {networkMode === "data-saver" ? "省流" : networkMode === "high-quality" ? "高清" : "均衡"} · {rate}x · {gestureLayout === "mirrored" ? "左进右退" : "左退右进"} · {fillLabel}</p>
        {fullscreen && <p className="mt-0.5 truncate text-sky-200/70">{fullscreenDiagnosticLabel}</p>}
      </footer>
    </div>
    </>
  );
}

function ToolButton({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  active
}: {
  icon: typeof Wrench;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <CtrlChip
      active={active}
      disabled={disabled}
      onClick={onClick}
      title={`${label}：${hint}`}
      className="txzz-player-tool-button min-h-[3.75rem] !items-start !justify-start gap-2.5 px-3 py-2 text-left"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] font-normal opacity-55">{hint}</span>
      </span>
    </CtrlChip>
  );
}
