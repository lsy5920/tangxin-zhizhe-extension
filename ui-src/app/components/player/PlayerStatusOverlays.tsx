import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Activity, BookmarkPlus, ChevronLeft, Copy, ExternalLink, Film, Play, RefreshCw, Repeat2, Route, TimerReset, Unlock, X } from "lucide-react";
import { CtrlButton } from "./PlayerControls";

export type PlayerOverlayProps = {
  buffering: boolean;
  hasUrl: boolean;
  error: string;
  paused: boolean;
  locked: boolean;
  fullscreen: boolean;
  onPlay: () => void;
  onReload: () => void;
  onSwitchBackup: () => void;
  canSwitchBackup: boolean;
  onUnlock: () => void;
};

/** 播放画面状态覆盖层：所有状态互斥、反馈明确，并始终保留恢复路径。 */
export function PlayerOverlays({
  buffering,
  hasUrl,
  error,
  paused,
  locked,
  fullscreen,
  onPlay,
  onReload,
  onSwitchBackup,
  canSwitchBackup,
  onUnlock
}: PlayerOverlayProps) {
  const unlockRef = useRef<HTMLButtonElement | null>(null);
  const focusBeforeLockRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!fullscreen || !locked) return undefined;
    const button = unlockRef.current;
    const root = button?.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    focusBeforeLockRef.current = active instanceof HTMLElement ? active : null;
    const frame = window.requestAnimationFrame(() => button?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      const previous = focusBeforeLockRef.current;
      focusBeforeLockRef.current = null;
      window.requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, [fullscreen, locked]);

  return (
    <>
      {!hasUrl && (
        <div className="pointer-events-none absolute inset-0 z-[14] flex items-center justify-center p-5" role="status" aria-live="polite">
          <div className="max-w-xs text-center text-white/72">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8">
              <Film size={20} />
            </span>
            <p className="mt-3 text-[12px] font-semibold text-white/88">等待播放链接</p>
            <p className="mt-1 text-[10px] leading-relaxed text-white/48">打开网站视频详情页后，播放器会在此加载可用线路。</p>
          </div>
        </div>
      )}

      {buffering && hasUrl && !error && (
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/58 px-4 py-3 text-white shadow-xl backdrop-blur-md">
            <div className="txzz-player-spinner !h-7 !w-7" />
            <div className="text-left">
              <p className="text-[11px] font-semibold">正在缓冲</p>
              <p className="mt-0.5 text-[10px] text-white/52">网络恢复后会自动继续</p>
            </div>
          </div>
        </div>
      )}

      {hasUrl && paused && !buffering && !error && !locked && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <button
            type="button"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onPlay(); }}
            onPointerDown={(event) => event.stopPropagation()}
            className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/18 bg-black/52 text-white shadow-2xl backdrop-blur-md outline-none transition hover:scale-105 hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95"
            title="开始播放"
            aria-label="开始播放"
          >
            <Play size={23} className="ml-1 fill-white" />
          </button>
        </div>
      )}

      {hasUrl && error && paused && !buffering && !locked && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4" role="alert">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-rose-300/15 bg-black/82 p-4 text-center text-white shadow-2xl backdrop-blur-md">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/12 text-amber-200"><Activity size={19} /></span>
            <p className="mt-2 text-[12px] font-semibold">播放暂时中断</p>
            <p className="mt-1.5 line-clamp-3 text-[10px] leading-relaxed text-white/58">{error}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CtrlButton title="重新加载当前线路" accent="sky" size="sm" onClick={onReload} className="w-full"><RefreshCw size={13} /> 重载</CtrlButton>
              <CtrlButton title="切换到备用线路" active accent="emerald" size="sm" disabled={!canSwitchBackup} onClick={onSwitchBackup} className="w-full"><Route size={13} /> 切备用</CtrlButton>
            </div>
          </div>
        </div>
      )}

      {fullscreen && locked && (
        <button
          ref={unlockRef}
          type="button"
          onClick={(event) => { event.stopPropagation(); onUnlock(); }}
          className="txzz-player-unlock-fab absolute bottom-[max(18px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/58 text-white shadow-xl backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95"
          title="解锁播放器控制"
          aria-label="解锁播放器控制"
        >
          <Unlock size={18} />
        </button>
      )}
    </>
  );
}

export type PlayerContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onCopyLink: () => void;
  onOpenLink: () => void;
  onDiagnostic: () => void;
  onBookmark: () => void;
  onLoopStart: () => void;
  onLoopEnd: () => void;
  onClearLoop: () => void;
  loopStarted: boolean;
  loopActive: boolean;
};

/** 右键菜单由 React 手势层承接，避免 ArtPlayer 禁用指针后入口失效。 */
export function PlayerContextMenu({
  open,
  x,
  y,
  onClose,
  onCopyLink,
  onOpenLink,
  onDiagnostic,
  onBookmark,
  onLoopStart,
  onLoopEnd,
  onClearLoop,
  loopStarted,
  loopActive
}: PlayerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const menu = menuRef.current;
    const parent = menu.offsetParent as HTMLElement | null;
    const parentWidth = parent?.clientWidth || window.innerWidth;
    const parentHeight = parent?.clientHeight || window.innerHeight;
    const left = Math.max(8, Math.min(x, parentWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(y, parentHeight - menu.offsetHeight - 8));
    setPosition({ left, top });
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const run = (action: () => void) => {
    action();
    onClose();
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
    if (!items.length) return;
    const index = items.indexOf(event.target as HTMLButtonElement);
    const next = event.shiftKey
      ? items[(index - 1 + items.length) % items.length]
      : items[(index + 1) % items.length];
    event.preventDefault();
    next.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="播放器右键菜单"
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="txzz-player-context-menu absolute z-[42] overflow-y-auto rounded-2xl border border-white/12 bg-slate-950/96 p-1.5 text-white shadow-2xl backdrop-blur-xl"
      style={{
        width: "min(12rem, calc(100% - 1rem))",
        maxHeight: "calc(100% - 1rem)",
        left: position.left,
        top: position.top
      }}
    >
      <ContextMenuButton icon={Copy} label="复制完整链接" onClick={() => run(onCopyLink)} />
      <ContextMenuButton icon={ExternalLink} label="新窗口打开" onClick={() => run(onOpenLink)} />
      <ContextMenuButton icon={BookmarkPlus} label="保存当前位置书签" onClick={() => run(onBookmark)} />
      <ContextMenuButton icon={TimerReset} label={loopStarted ? "重新设置 A 点" : "设为片段 A 点"} onClick={() => run(onLoopStart)} />
      <ContextMenuButton icon={Repeat2} label="设为 B 点并循环" onClick={() => run(onLoopEnd)} />
      {loopActive && <ContextMenuButton icon={X} label="结束片段循环" onClick={() => run(onClearLoop)} />}
      <ContextMenuButton icon={Activity} label="查看播放器诊断" onClick={() => run(onDiagnostic)} />
      <div className="my-1 h-px bg-white/8" />
      <ContextMenuButton icon={X} label="关闭菜单" onClick={onClose} />
    </div>
  );
}

function ContextMenuButton({ icon: Icon, label, onClick }: { icon: typeof X; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[11px] font-semibold text-white/82 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/12 focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      <Icon size={14} className="shrink-0 text-sky-300" />
      <span>{label}</span>
    </button>
  );
}

export type PlayerTopBarProps = {
  visible: boolean;
  locked: boolean;
  fullscreen: boolean;
  title: string;
  status: string;
  hasUrl: boolean;
  fillLabel: string;
  metaVisible: boolean;
  diagnosticLabel: string;
  diagnosticOk: boolean;
  resumeTip: string;
  error: string;
  onBack: () => void;
};

/** 顶部悬浮信息只保留上下文与退出入口，诊断信息会在全屏稳定后自动收起。 */
export function PlayerTopBar({
  visible,
  locked,
  fullscreen,
  title,
  status,
  hasUrl,
  fillLabel,
  metaVisible,
  diagnosticLabel,
  diagnosticOk,
  resumeTip,
  error,
  onBack
}: PlayerTopBarProps) {
  const interactive = visible && !locked;
  return (
    <div
      aria-hidden={!interactive}
      className={`txzz-player-top-bar pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/88 via-black/34 to-transparent px-3 pb-12 pt-[max(10px,env(safe-area-inset-top))] text-white transition-opacity duration-200 sm:px-5 ${
        interactive ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {fullscreen && (
            <button
              type="button"
              disabled={!interactive}
              tabIndex={interactive ? 0 : -1}
              onClick={(event) => { event.stopPropagation(); onBack(); }}
              className={`${interactive ? "pointer-events-auto" : "pointer-events-none"} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/42 text-white shadow-sm backdrop-blur outline-none transition hover:bg-black/58 focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95 disabled:opacity-0`}
              title="退出全屏"
              aria-label="退出全屏"
            >
              <ChevronLeft size={19} />
            </button>
          )}
          <div className="min-w-0 rounded-xl border border-white/8 bg-black/38 px-3 py-2 shadow-sm backdrop-blur">
            <span className="block max-w-[13rem] truncate text-[11px] font-semibold sm:max-w-[30rem]">{title}</span>
            {resumeTip && <span className="mt-0.5 block truncate text-[10px] text-emerald-200/85">{resumeTip}</span>}
          </div>
        </div>
        <div className={`flex shrink-0 flex-wrap justify-end gap-1 transition-opacity ${fullscreen && !metaVisible && !error ? "opacity-0" : "opacity-100"}`}>
          <span role="status" className={`rounded-full px-2.5 py-1 text-[10px] font-medium backdrop-blur ${hasUrl ? "bg-emerald-500/76" : "bg-rose-500/76"}`}>{status}</span>
          {fullscreen && <span className="rounded-full bg-sky-500/76 px-2.5 py-1 text-[10px] font-medium backdrop-blur">{fillLabel}</span>}
          {fullscreen && metaVisible && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium backdrop-blur ${diagnosticOk ? "bg-black/42" : "bg-amber-500/88"}`} title={diagnosticLabel}>
              {diagnosticLabel}
            </span>
          )}
        </div>
      </div>
      {error && <p className="mt-2 max-w-xl rounded-xl border border-rose-300/12 bg-black/48 px-3 py-2 text-[10px] leading-relaxed text-rose-100 backdrop-blur">{error}</p>}
    </div>
  );
}
