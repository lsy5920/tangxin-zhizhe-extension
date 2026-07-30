import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { listenBridgeState, notifyUiReady, sendUiAction } from "./bridge";
import type { AccountsPageIntent, BridgeState, Page, SettingsPageIntent } from "./types";
import type { CinemaPrimaryRoute } from "./cinema/appModel";
import { OverviewPage } from "./components/OverviewPage";
import { AccountsPage } from "./components/AccountsPage";
import { SettingsPage } from "./components/SettingsPage";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { UpdateModal } from "./update/UpdateModal";
import { isUpdateAvailableForCurrentBuild } from "./update/helpers";
import { flowItemText } from "./helpers";
import { useDocumentScrollLock } from "./components/ui/primitives";
import { FloatingCompanion } from "./components/layout/FloatingCompanion";
import { WorkspaceShell } from "./components/layout/WorkspaceShell";
import { PAGE_META } from "./model/navigation";
import { buildWorkspaceViewModel } from "./model/workspaceViewModel";
import { clampLauncherPosition, useUiPreferences } from "./hooks/useUiPreferences";
import {
  getPluginHost,
  restoreFullscreenChrome,
  PLAYER_FULLSCREEN_HOST_CLASS
} from "./components/player/browserFullscreen";

function action(actionName: string, payload: Record<string, unknown> = {}) {
  sendUiAction(actionName, payload);
}

function disableHostPlaybackFullscreenMode() {
  restoreFullscreenChrome(getPluginHost());
  // 兼容旧类名清理
  getPluginHost()?.classList.remove(PLAYER_FULLSCREEN_HOST_CLASS);
}

function deepActiveElement() {
  let active: Element | null = document.activeElement;
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

function userIsEnteringText() {
  const active = deepActiveElement();
  if (!(active instanceof HTMLElement)) return false;
  if (active.isContentEditable || active.matches("textarea, select")) return true;
  if (!active.matches("input")) return false;
  const type = String((active as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
}

function pluginShadowRoot() {
  return getPluginHost()?.shadowRoot || null;
}

function automaticUpdatePromptShouldWait() {
  const host = getPluginHost();
  if (document.fullscreenElement || host?.classList.contains(PLAYER_FULLSCREEN_HOST_CLASS)) return true;
  if (userIsEnteringText()) return true;
  return Boolean(pluginShadowRoot()?.querySelector('[data-txzz-modal-sheet="true"]'));
}

function updateCenterIsVisible() {
  return Boolean(pluginShadowRoot()?.querySelector('[data-txzz-settings-section="updates"]'));
}

async function verifyDismissedUpdateStored(updateId: string) {
  for (const delay of [300, 700, 1200]) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
    try {
      const stored = await chrome.storage.local.get("txzzUpdateState");
      const updateState = stored?.txzzUpdateState as { dismissedId?: string } | undefined;
      if (String(updateState?.dismissedId || "") === updateId) return true;
    } catch {
      // 继续完成有限次数核验；最终失败由界面明确提示，不能伪装成已持久化。
    }
  }
  return false;
}

export default function App() {
  const [open, setOpen] = useState(false);
  const {
    page,
    setPage,
    cinemaRoute,
    ballPos,
    setBallPos,
    saveBallPosition
  } = useUiPreferences();
  const [hiddenUpdateBannerId, setHiddenUpdateBannerId] = useState("");
  const [bridgeState, setBridgeState] = useState<BridgeState>({});
  const [accountsIntent, setAccountsIntent] = useState<AccountsPageIntent>({});
  const [settingsIntent, setSettingsIntent] = useState<SettingsPageIntent>({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [dismissedUpdateId, setDismissedUpdateId] = useState("");
  const [updatePersistenceError, setUpdatePersistenceError] = useState("");
  const [toast, setToast] = useState<{ text: string; level: string } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const moved = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const lastToastKey = useRef("");
  const toastStartedAt = useRef(Date.now());
  const showUpdateModalRef = useRef(false);

  const setUpdateModalVisibility = (visible: boolean) => {
    showUpdateModalRef.current = visible;
    setShowUpdateModal(visible);
  };

  useDocumentScrollLock(open);

  useEffect(() => {
    const stop = listenBridgeState((next) => {
      setBridgeState(next);
      if (typeof next.expanded === "boolean") {
        setOpen(next.expanded);
      }
    });
    notifyUiReady();
    const timer = window.setTimeout(notifyUiReady, 300);
    return () => { window.clearTimeout(timer); stop(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = panelRef.current?.getRootNode();
    const shadowActive = root instanceof ShadowRoot ? root.activeElement : null;
    const previous = shadowActive instanceof HTMLElement ? shadowActive : document.activeElement;
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // 顶层子弹层拥有 Esc 与 Tab；主工作台必须完全让出键盘焦点，不能把焦点偷回侧栏。
      if (pluginShadowRoot()?.querySelector('[data-txzz-modal-sheet="true"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((item) => item.offsetParent !== null);
      if (!focusable.length) return;
      const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      // 子弹层取得焦点时由子弹层自行管理，主面板不抢夺焦点。
      if (active instanceof HTMLElement && !panelRef.current.contains(active)) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handler);
      window.setTimeout(() => {
        if (launcherRef.current?.isConnected) launcherRef.current.focus({ preventScroll: true });
        else if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      }, 0);
    };
  }, [open]);

  useEffect(() => {
    // 面板关闭时立即清空操作提示，避免自动关闭计时器卸载后在下次打开时恢复为常驻提示。
    if (!open) setToast(null);
  }, [open]);

  useEffect(() => {
    const flow = bridgeState.flow || [];
    const latest = flow[flow.length - 1];
    const text = flowItemText(latest);
    const key = `${latest?.ts || ""}|${latest?.level || ""}|${text}`;
    if (!text || key === lastToastKey.current) return;
    lastToastKey.current = key;
    const occurredAt = Date.parse(latest?.ts || "");
    // 只提示面板打开期间的新操作；历史记录和面板关闭期间的观察日志不在下次打开时补弹。
    if (!open || (Number.isFinite(occurredAt) && occurredAt < toastStartedAt.current)) return;
    setToast({ text, level: latest?.level || "info" });
    const timer = window.setTimeout(() => setToast(null), latest?.level === "error" ? 5200 : 3200);
    return () => window.clearTimeout(timer);
  }, [bridgeState.flow, open]);

  useEffect(() => {
    const remote = bridgeState.repositoryUpdate?.remote;
    const updateId = String(remote?.id || [remote?.version, remote?.build].filter(Boolean).join("|"));
    if (!isUpdateAvailableForCurrentBuild(bridgeState.repositoryUpdate) || bridgeState.repositoryUpdate?.shouldNotify === false || !updateId || dismissedUpdateId === updateId) return;
    let timer = 0;
    const tryOpenUpdate = () => {
      if (showUpdateModalRef.current) return;
      // 用户已在升级中心查看同一结果时不再重复盖一层弹窗。
      if (updateCenterIsVisible()) return;
      if (automaticUpdatePromptShouldWait()) {
        timer = window.setTimeout(tryOpenUpdate, 1200);
        return;
      }
      setUpdateModalVisibility(true);
    };
    timer = window.setTimeout(tryOpenUpdate, 450);
    return () => window.clearTimeout(timer);
  }, [
    bridgeState.repositoryUpdate?.updateAvailable,
    bridgeState.repositoryUpdate?.remote?.id,
    bridgeState.repositoryUpdate?.remote?.version,
    bridgeState.repositoryUpdate?.remote?.build,
    bridgeState.repositoryUpdate?.shouldNotify,
    dismissedUpdateId
  ]);

  const openPanel = () => {
    // 打开普通面板时清掉残留全屏宿主类，避免上次异常全屏后面板整页消失。
    disableHostPlaybackFullscreenMode();
    setOpen(true);
    action("toggle", { force: true });
  };
  const closePanel = () => {
    disableHostPlaybackFullscreenMode();
    setOpen(false);
    action("close");
  };

  const onBallPointerDown = (e: React.PointerEvent) => {
    dragging.current = true; moved.current = false;
    dragStart.current = { mx: e.clientX, my: e.clientY, bx: ballPos.x, by: ballPos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBallPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setBallPos(clampLauncherPosition({ x: dragStart.current.bx + dx, y: dragStart.current.by + dy }));
  };
  const onBallPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const finalPosition = saveBallPosition({
      x: dragStart.current.bx + e.clientX - dragStart.current.mx,
      y: dragStart.current.by + e.clientY - dragStart.current.my
    });
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (!moved.current) openPanel();
  };
  const onBallPointerCancel = () => {
    dragging.current = false;
    setBallPos((current) => clampLauncherPosition(current));
  };

  const goPage = (target: Page, intent: AccountsPageIntent | SettingsPageIntent = {}) => {
    if (target === "cinema") {
      // 影院在独立 chrome-extension:// 标签页运行，宿主网站只保留入口和原有工具台。
      disableHostPlaybackFullscreenMode();
      setToast({ text: "正在新标签页打开糖心影院", level: "running" });
      void chrome.runtime.sendMessage({ type: "openCinemaPage", route: cinemaRoute }).then((response) => {
        if (!response?.ok) throw new Error(response?.error || "影院页面打开失败");
        setOpen(false);
        action("close");
      }).catch((error) => {
        setToast({ text: error?.message || String(error), level: "error" });
      });
      return;
    }
    if (target === "accounts") setAccountsIntent(intent as AccountsPageIntent);
    if (target === "settings") setSettingsIntent(intent as SettingsPageIntent);
    setPage(target);
  };

  const handleOverviewAction = (actionName: string, payload: Record<string, unknown> = {}) => {
    if (actionName === "open-cinema-page") {
      const route = String(payload.route || "home") as CinemaPrimaryRoute;
      disableHostPlaybackFullscreenMode();
      setToast({ text: "正在新标签页打开糖心影院", level: "running" });
      void chrome.runtime.sendMessage({ type: "openCinemaPage", route }).then((response) => {
        if (!response?.ok) throw new Error(response?.error || "影院页面打开失败");
        setOpen(false);
        action("close");
      }).catch((error) => setToast({ text: error?.message || String(error), level: "error" }));
      return;
    }
    action(actionName, payload);
  };

  const openUpgradeCenter = () => {
    setSettingsIntent({ section: "updates" });
    goPage("settings", { section: "updates" });
    if (!open) {
      setOpen(true);
      action("toggle", { force: true });
    }
  };

  const handleCheckUpdate = () => {
    action("check-update");
  };

  const handleDownloadUpdate = () => {
    action("download-latest");
  };

  const renderPage = () => {
    if (page === "cinema") return null;
    // 每个业务页包一层错误边界：单页崩溃时保留悬浮球与面板外壳，避免整站 UI 消失。
    const body = page === "overview"
      ? <OverviewPage state={bridgeState} onAction={handleOverviewAction} onPage={(target) => goPage(target)} />
      : page === "accounts"
        ? <AccountsPage state={bridgeState} onAction={action} intent={accountsIntent} onIntentHandled={() => setAccountsIntent({})} />
        : (
              <SettingsPage
                state={bridgeState}
                onAction={action}
                onPage={goPage}
                intent={settingsIntent}
                onIntentHandled={() => setSettingsIntent({})}
              />
            );
    return (
      <PageErrorBoundary key={page} title={`${PAGE_META[page].label}加载失败`} onReset={() => setPage(page)}>
        {body}
      </PageErrorBoundary>
    );
  };

  const workspace = buildWorkspaceViewModel(bridgeState);
  const updateVm = workspace.update;
  const updateAvailable = updateVm.available;
  const updateShouldNotify = updateAvailable && bridgeState.repositoryUpdate?.shouldNotify !== false;
  const showUpdateReminder = updateShouldNotify && Boolean(updateVm.updateId) && hiddenUpdateBannerId !== updateVm.updateId;

  return (
    <div className="txzz-candy-app relative size-full overflow-hidden">
      {!open && (
        <FloatingCompanion
          position={ballPos}
          activeDownloads={workspace.activeDownloads}
          updateAvailable={updateAvailable}
          launcherRef={launcherRef}
          onPointerDown={onBallPointerDown}
          onPointerMove={onBallPointerMove}
          onPointerUp={onBallPointerUp}
          onPointerCancel={onBallPointerCancel}
          onOpen={openPanel}
        />
      )}

      {open && (
        <WorkspaceShell
          panelRef={panelRef}
          page={page}
          onPage={(target) => goPage(target)}
          onClose={closePanel}
          onAbout={() => action("about")}
          onOpenAccounts={() => goPage("accounts")}
          onOpenUpdate={() => updateVm.needsModal ? setUpdateModalVisibility(true) : openUpgradeCenter()}
          onHideUpdateReminder={() => setHiddenUpdateBannerId(updateVm.updateId)}
          showUpdateReminder={showUpdateReminder}
          viewModel={workspace}
          toast={toast}
          onDismissToast={() => setToast(null)}
        >
          {renderPage()}
        </WorkspaceShell>
      )}

      <UpdateModal
        state={bridgeState}
        open={showUpdateModal}
        onClose={() => setUpdateModalVisibility(false)}
        onDismiss={(updateId) => {
          setUpdatePersistenceError("");
          if (updateId) {
            setDismissedUpdateId(updateId);
            setHiddenUpdateBannerId(updateId);
          }
          setUpdateModalVisibility(false);
          action("dismiss-update", { updateId });
          if (updateId) {
            void verifyDismissedUpdateStored(updateId).then((stored) => {
              if (stored) return;
              setUpdatePersistenceError("本次弹窗已关闭，但忽略设置未能保存；刷新后可能再次提醒，请稍后重试。");
            });
          }
        }}
        onOpenSettings={() => {
          setUpdateModalVisibility(false);
          openUpgradeCenter();
        }}
        onDownload={handleDownloadUpdate}
        onCheck={handleCheckUpdate}
      />

      {updatePersistenceError && (
        <div
          className="txzz-candy-interactive fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[80] flex w-[min(calc(100vw-1.5rem),30rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-danger-100 bg-danger-50 px-3 py-2.5 text-danger-600 shadow-xl"
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words text-[12px] font-medium leading-5">{updatePersistenceError}</span>
          <button type="button" onClick={() => setUpdatePersistenceError("")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-danger-100" aria-label="关闭忽略更新失败提示">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
