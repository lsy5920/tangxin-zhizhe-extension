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
        <div className="txzz-stream-player-state is-empty" role="status" aria-live="polite">
          <div>
            <span>
              <Film size={20} />
            </span>
            <strong>等待播放线路</strong>
            <p>选择影片并完成检票后，画面会在这里就绪。</p>
          </div>
        </div>
      )}

      {buffering && hasUrl && !error && (
        <div className="txzz-stream-player-state is-buffering" role="status" aria-live="polite">
          <div>
            <div className="txzz-player-spinner" />
            <div>
              <strong>正在缓冲</strong>
              <p>网络稳定后自动继续</p>
            </div>
          </div>
        </div>
      )}

      {hasUrl && paused && !buffering && !error && !locked && (
        <div className="txzz-stream-player-paused">
          <button
            type="button"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onPlay(); }}
            onPointerDown={(event) => event.stopPropagation()}
            className="txzz-stream-player-big-play"
            title="开始播放"
            aria-label="开始播放"
          >
            <Play size={23} className="ml-1 fill-white" />
          </button>
        </div>
      )}

      {hasUrl && error && paused && !buffering && !locked && (
        <div className="txzz-stream-player-error" role="alert">
          <div>
            <span><Activity size={19} /></span>
            <strong>播放暂时中断</strong>
            <p>{error}</p>
            <div>
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
          className="txzz-player-unlock-fab txzz-stream-player-unlock"
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

/** 右键菜单由 React 手势层统一承接，媒体内核保持无 UI、无菜单。 */
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
      className="txzz-player-context-menu txzz-stream-player-context-menu"
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
      <div className="txzz-stream-context-divider" />
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
      className="txzz-stream-context-item"
    >
      <Icon size={14} />
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
      className={`txzz-player-top-bar txzz-stream-player-topbar ${interactive ? "is-visible" : ""}`}
    >
      <div>
        <div className="txzz-stream-player-title-block">
          {fullscreen && (
            <button
              type="button"
              disabled={!interactive}
              tabIndex={interactive ? 0 : -1}
              onClick={(event) => { event.stopPropagation(); onBack(); }}
              className={interactive ? "is-interactive" : ""}
              title="退出全屏"
              aria-label="退出全屏"
            >
              <ChevronLeft size={19} />
            </button>
          )}
          <div>
            <span>{title}</span>
            {resumeTip && <small>{resumeTip}</small>}
          </div>
        </div>
        <div className={`txzz-stream-player-meta ${fullscreen && !metaVisible && !error ? "is-hidden" : ""}`}>
          <span role="status" className={hasUrl ? "is-ok" : "is-error"}>{status}</span>
          {fullscreen && <span>{fillLabel}</span>}
          {fullscreen && metaVisible && (
            <span className={diagnosticOk ? "" : "is-warning"} title={diagnosticLabel}>
              {diagnosticLabel}
            </span>
          )}
        </div>
      </div>
      {error && <p className="txzz-stream-player-top-error">{error}</p>}
    </div>
  );
}
