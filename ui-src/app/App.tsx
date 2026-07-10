import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Cloud, Download, Info, LayoutDashboard, LoaderCircle, Play, Settings, Users, X, Zap } from "lucide-react";
import { listenBridgeState, notifyUiReady, sendUiAction } from "./bridge";
import type { AccountsPageIntent, BridgeState, Page, SettingsPageIntent } from "./types";
import { OverviewPage } from "./components/OverviewPage";
import { AccountsPage } from "./components/AccountsPage";
import { PlaybackPage } from "./components/PlaybackPage";
import { DownloadsPage } from "./components/DownloadsPage";
import { SettingsPage } from "./components/SettingsPage";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { UpdateModal } from "./update/UpdateModal";
import { buildUpdateViewModel } from "./update/helpers";
import { APP_VERSION_LABEL } from "./constants";
import { flowItemText } from "./helpers";
import { useDocumentScrollLock } from "./components/ui/primitives";
import {
  getPluginHost,
  restoreFullscreenChrome,
  PLAYER_FULLSCREEN_HOST_CLASS
} from "./components/player/browserFullscreen";

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "accounts", label: "账号池", icon: Users },
  { id: "playback", label: "播放", icon: Play },
  { id: "downloads", label: "下载", icon: Download },
  { id: "settings", label: "设置", icon: Settings }
];

const pageTitles: Record<Page, string> = {
  overview: "总览",
  accounts: "账号池",
  playback: "播放",
  downloads: "下载",
  settings: "设置"
};

const pageSubtitles: Record<Page, string> = {
  overview: "运行状态与快捷入口",
  accounts: "云端同步与本地账号管理",
  playback: "播放器、线路与播放记录",
  downloads: "任务进度、保存与排查",
  settings: "体检、覆盖、广告与升级"
};

const flowLevelClasses: Record<string, string> = {
  ok: "border-success-100 bg-success-50 text-success-600",
  error: "border-danger-100 bg-danger-50 text-danger-600",
  info: "border-info-100 bg-info-50 text-info-600",
  running: "border-warning-100 bg-warning-50 text-warning-600"
};

const UI_PREFERENCES_KEY = "txzzUiPreferencesV1";

type UiPreferences = {
  page?: Page;
  ballPos?: { x: number; y: number };
};

/** 把悬浮球限制在可视区域内，避免拖出屏幕后无法找回。 */
function clampBallPosition(position: { x: number; y: number }) {
  const margin = 12;
  const size = 56;
  const baseLeft = window.innerWidth - 20 - size;
  const baseTop = window.innerHeight - 80 - size;
  return {
    x: Math.round(Math.min(window.innerWidth - margin - size - baseLeft, Math.max(margin - baseLeft, position.x))),
    y: Math.round(Math.min(window.innerHeight - margin - size - baseTop, Math.max(margin - baseTop, position.y)))
  };
}

function saveUiPreferences(preferences: UiPreferences) {
  return chrome.storage.local.set({ [UI_PREFERENCES_KEY]: preferences }).catch(() => undefined);
}
function action(actionName: string, payload: Record<string, unknown> = {}) {
  sendUiAction(actionName, payload);
}

function disableHostPlaybackFullscreenMode() {
  restoreFullscreenChrome(getPluginHost());
  // 兼容旧类名清理
  getPluginHost()?.classList.remove(PLAYER_FULLSCREEN_HOST_CLASS);
}

function flowMessage(state: BridgeState): { text: string; level: string } {
  const flow = state.flow || [];
  const item = flow[flow.length - 1];
  return { text: flowItemText(item), level: item?.level || "info" };
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
  const [page, setPage] = useState<Page>("overview");
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
  const [showFlow, setShowFlow] = useState(false);
  const [hiddenUpdateBannerId, setHiddenUpdateBannerId] = useState("");
  const [bridgeState, setBridgeState] = useState<BridgeState>({});
  const [accountsIntent, setAccountsIntent] = useState<AccountsPageIntent>({});
  const [settingsIntent, setSettingsIntent] = useState<SettingsPageIntent>({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [dismissedUpdateId, setDismissedUpdateId] = useState("");
  const [updatePersistenceError, setUpdatePersistenceError] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [toast, setToast] = useState<{ text: string; level: string } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const moved = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const lastToastKey = useRef("");
  const lastFlowBarKey = useRef("");
  const toastStartedAt = useRef(Date.now());
  const showUpdateModalRef = useRef(false);

  const setUpdateModalVisibility = (visible: boolean) => {
    showUpdateModalRef.current = visible;
    setShowUpdateModal(visible);
  };

  useDocumentScrollLock(open);

  useEffect(() => {
    let alive = true;
    chrome.storage.local.get(UI_PREFERENCES_KEY).then((stored) => {
      if (!alive) return;
      const preferences = (stored?.[UI_PREFERENCES_KEY] || {}) as UiPreferences;
      if (preferences.page && navItems.some((item) => item.id === preferences.page)) setPage(preferences.page);
      if (preferences.ballPos) setBallPos(clampBallPosition(preferences.ballPos));
      setPreferencesReady(true);
    }).catch(() => setPreferencesReady(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    void saveUiPreferences({ page, ballPos });
  }, [page, preferencesReady]);

  useEffect(() => {
    const onResize = () => setBallPos((current) => clampBallPosition(current));
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const stop = listenBridgeState((next) => {
      setBridgeState(next);
      if (typeof next.expanded === "boolean") setOpen(next.expanded);
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
    else setShowFlow(false);
  }, [open]);

  useEffect(() => {
    if (open) return;
    const flow = bridgeState.flow || [];
    const latest = flow[flow.length - 1];
    const text = flowItemText(latest);
    const key = `${latest?.ts || ""}|${latest?.level || ""}|${text}`;
    if (!text || key === lastFlowBarKey.current) return;
    lastFlowBarKey.current = key;
    const occurredAt = Date.parse(latest?.ts || "");
    // 只展示当前会话中新产生的状态，历史记录和关闭面板前的旧提示不再恢复。
    if (Number.isFinite(occurredAt) && occurredAt < toastStartedAt.current) return;
    setShowFlow(true);
    const timer = window.setTimeout(() => setShowFlow(false), latest?.level === "error" ? 5200 : 3600);
    return () => window.clearTimeout(timer);
  }, [bridgeState.flow, open]);

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
    if (!bridgeState.repositoryUpdate?.updateAvailable || bridgeState.repositoryUpdate?.shouldNotify === false || !updateId || dismissedUpdateId === updateId) return;
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
    setShowFlow(false);
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
    setBallPos(clampBallPosition({ x: dragStart.current.bx + dx, y: dragStart.current.by + dy }));
  };
  const onBallPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const finalPosition = clampBallPosition({
      x: dragStart.current.bx + e.clientX - dragStart.current.mx,
      y: dragStart.current.by + e.clientY - dragStart.current.my
    });
    setBallPos(finalPosition);
    void saveUiPreferences({ page, ballPos: finalPosition });
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (!moved.current) openPanel();
  };
  const onBallPointerCancel = () => {
    dragging.current = false;
    setBallPos((current) => clampBallPosition(current));
  };

  const goPage = (target: Page, intent: AccountsPageIntent | SettingsPageIntent = {}) => {
    if (target === "accounts") setAccountsIntent(intent as AccountsPageIntent);
    if (target === "settings") setSettingsIntent(intent as SettingsPageIntent);
    setPage(target);
  };

  const openUpgradeCenter = () => {
    setSettingsIntent({ section: "updates" });
    setPage("settings");
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
    // 每个业务页包一层错误边界：单页崩溃时保留悬浮球与面板外壳，避免整站 UI 消失。
    const body = page === "overview"
      ? <OverviewPage state={bridgeState} onAction={action} onPage={setPage} />
      : page === "accounts"
        ? <AccountsPage state={bridgeState} onAction={action} intent={accountsIntent} onIntentHandled={() => setAccountsIntent({})} />
        : page === "playback"
          ? <PlaybackPage state={bridgeState} onAction={action} onPage={setPage} />
          : page === "downloads"
            ? <DownloadsPage state={bridgeState} onAction={action} />
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
      <PageErrorBoundary key={page} title={`${pageTitles[page]}页加载失败`} onReset={() => setPage(page)}>
        {body}
      </PageErrorBoundary>
    );
  };

  const updateVm = buildUpdateViewModel(bridgeState);
  const updateAvailable = updateVm.status === "available";
  const updateShouldNotify = updateAvailable && bridgeState.repositoryUpdate?.shouldNotify !== false;
  const showUpdateReminder = updateShouldNotify && Boolean(updateVm.updateId) && hiddenUpdateBannerId !== updateVm.updateId;
  const updateNeedsModal = ["available", "validating", "submitted", "download-error"].includes(updateVm.status);
  const updateBadgeLabel = updateVm.status === "idle"
    ? "检查更新"
    : updateVm.status === "available"
      ? "有新版本"
      : updateVm.status === "checking"
        ? "检测中"
        : updateVm.status === "validating"
          ? "校验中"
          : updateVm.status === "submitted"
            ? "下载已提交"
            : updateVm.status === "download-error" || updateVm.status === "error"
              ? "升级异常"
              : "已是最新";
  const activeDownloads = Object.values(bridgeState.downloadTasks || {})
    .filter((t) => t && ["queued", "playlist", "segments", "segment", "ready"].includes(
      String((t as { stage?: string }).stage || "")
    )).length;
  const { text: flowText, level: flowLevel } = flowMessage(bridgeState);
  const flowTone = flowLevelClasses[flowLevel] || flowLevelClasses.info;
  const remoteConnected = Boolean(bridgeState.remote?.lastSyncAt && !bridgeState.remote?.lastError);
  const toastTone = toast?.level === "error"
    ? "border-danger-100 bg-danger-50 text-danger-600"
    : toast?.level === "ok"
      ? "border-success-100 bg-success-50 text-success-600"
      : toast?.level === "running"
        ? "border-warning-100 bg-warning-50 text-warning-600"
        : "border-info-100 bg-info-50 text-info-600";
  const ToastIcon = toast?.level === "error" ? AlertTriangle : toast?.level === "ok" ? CheckCircle2 : LoaderCircle;

  return (
    <div className="txzz-candy-app relative size-full overflow-hidden">
      {!open && showFlow && flowText && (
        <button
          ref={launcherRef}
          type="button"
          className={`txzz-candy-interactive fixed z-40 flex max-w-[min(28rem,calc(100vw-5rem))] items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-medium shadow-lg backdrop-blur ${flowTone}`}
          style={{
            top: "max(1rem, env(safe-area-inset-top))",
            left: "max(1rem, env(safe-area-inset-left))"
          }}
          onClick={() => setShowFlow(false)}
          title="点击关闭状态提示"
          aria-live="polite"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${flowLevel === "error" ? "bg-danger-500" : flowLevel === "running" ? "bg-warning-500 animate-pulse" : flowLevel === "ok" ? "bg-success-500" : "bg-info-500"}`} />
          <span className="min-w-0 flex-1 truncate">{flowText}</span>
          <X size={13} className="shrink-0 opacity-60" />
        </button>
      )}

      {!open && (
        <button
          type="button"
          onPointerDown={onBallPointerDown}
          onPointerMove={onBallPointerMove}
          onPointerUp={onBallPointerUp}
          onPointerCancel={onBallPointerCancel}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPanel();
            }
          }}
          className="txzz-candy-interactive fixed z-50 cursor-pointer select-none touch-none border-0 bg-transparent p-0"
          style={{
            right: "max(1.25rem, env(safe-area-inset-right))",
            bottom: "max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
            transform: `translate(${ballPos.x}px, ${ballPos.y}px)`
          }}
          title="打开糖心志者面板"
          aria-label={`打开糖心志者面板${activeDownloads > 0 ? `，有 ${activeDownloads} 个下载任务` : ""}${updateAvailable ? "，有新版本" : ""}`}
        >
          <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/35 shadow-[0_14px_32px_rgba(17,24,39,0.32)] ring-1 ring-slate-950/20 transition-transform duration-150 active:scale-95" style={{ background: "linear-gradient(135deg, #0f172a 0%, #111827 55%, #4b3ec8 100%)" }}>
            <span className="text-lg font-bold tracking-tight text-white">志</span>
            <span className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${updateAvailable ? "bg-warning-500 animate-pulse" : activeDownloads > 0 ? "bg-info-500 animate-pulse" : "bg-success-500"}`} />
          </span>
          {activeDownloads > 0 && (
            <span className="absolute -bottom-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-info-500 px-1 text-[10px] font-bold text-white shadow-sm">
              {activeDownloads}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="txzz-app-panel-overlay txzz-candy-interactive fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5">
          <div className="txzz-app-panel-backdrop absolute inset-0 bg-slate-950/55 backdrop-blur-[8px]" onClick={closePanel} aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="txzz-panel-title"
            tabIndex={-1}
            className="txzz-app-panel-frame relative flex h-full w-full flex-col overflow-hidden border border-slate-700/10 bg-white shadow-[var(--txzz-shadow-lg)] outline-none sm:h-[min(94vh,920px)] sm:w-[min(1180px,calc(100vw-2.5rem))] sm:rounded-[1.6rem] md:flex-row"
          >
            <aside aria-label="主要导航" className="txzz-app-sidebar hidden w-[13.5rem] shrink-0 flex-col bg-slate-950 px-3.5 py-4 text-white md:flex">
              <div className="flex items-center gap-3 px-2 pb-5 pt-1">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white shadow-lg shadow-brand-950/25">志</span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold tracking-tight">糖心志者</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">运营工作台 · {APP_VERSION_LABEL}</p>
                </div>
              </div>

              <nav className="space-y-1" aria-label="桌面端页面导航">
                {navItems.map((item) => {
                  const active = page === item.id;
                  const hasBadge = item.id === "downloads" && activeDownloads > 0;
                  const hasUpdateDot = item.id === "settings" && updateAvailable;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPage(item.id)}
                      aria-current={active ? "page" : undefined}
                      aria-label={`前往${item.label}页`}
                      className={`relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium transition ${active ? "bg-white/11 text-white shadow-inner ring-1 ring-white/8" : "text-slate-400 hover:bg-white/6 hover:text-slate-100"}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-brand-500 text-white" : "bg-white/5 text-slate-400"}`}>
                        <item.icon size={16} strokeWidth={active ? 2.25 : 2} />
                      </span>
                      <span>{item.label}</span>
                      {hasBadge && <span className="ml-auto rounded-full bg-info-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeDownloads}</span>}
                      {hasUpdateDot && <span className="ml-auto h-2 w-2 rounded-full bg-warning-500 animate-pulse" />}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-2 pt-4">
                <button
                  type="button"
                  onClick={() => setPage("accounts")}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/8"
                >
                  <Cloud size={15} className={bridgeState.remote?.lastError ? "text-danger-500" : remoteConnected ? "text-success-500" : "text-warning-500"} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-slate-200">{bridgeState.remote?.lastError ? "云端连接异常" : remoteConnected ? "云端服务正常" : "云端等待同步"}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">点击查看账号池</span>
                  </span>
                </button>
                <button type="button" onClick={closePanel} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-medium text-slate-500 transition hover:bg-white/6 hover:text-slate-200" title="关闭面板（Esc）" aria-label="关闭面板">
                  <X size={14} /> 关闭面板
                </button>
              </div>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--txzz-canvas)]">
              <header className="txzz-app-header flex min-h-[4.25rem] shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white md:hidden">志</span>
                  <div className="min-w-0">
                    <h1 id="txzz-panel-title" className="truncate text-[15px] font-semibold tracking-tight text-slate-900">{pageTitles[page]}</h1>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{pageSubtitles[page]} · {APP_VERSION_LABEL}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage("accounts")}
                    className={`hidden min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition md:flex ${bridgeState.remote?.lastError ? "border-danger-100 bg-danger-50 text-danger-600" : remoteConnected ? "border-success-100 bg-success-50 text-success-600" : "border-warning-100 bg-warning-50 text-warning-600"}`}
                    title={bridgeState.remote?.lastError || (remoteConnected ? "云端账号已同步" : "云端尚未同步")}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${bridgeState.remote?.lastError ? "bg-danger-500" : remoteConnected ? "bg-success-500" : "bg-warning-500"}`} />
                    {bridgeState.remote?.lastError ? "云端异常" : remoteConnected ? "云端正常" : "待同步"}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateNeedsModal ? setUpdateModalVisibility(true) : openUpgradeCenter()}
                    className={`hidden min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition md:flex ${updateAvailable || updateVm.status === "submitted" ? "border-warning-100 bg-warning-50 text-warning-600" : updateVm.status === "error" || updateVm.status === "download-error" ? "border-danger-100 bg-danger-50 text-danger-600" : "border-slate-200 bg-slate-50 text-slate-600"}`}
                  >
                    {updateAvailable ? <Bell size={12} /> : <Zap size={12} />}
                    {updateBadgeLabel}
                  </button>
                  <button type="button" onClick={() => action("about")} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="打开项目主页" aria-label="打开项目主页">
                    <Info size={16} />
                  </button>
                  <button type="button" onClick={closePanel} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 md:hidden" aria-label="关闭面板">
                    <X size={17} />
                  </button>
                </div>
              </header>

              {showUpdateReminder && (
                <div className="txzz-update-reminder flex min-h-11 shrink-0 items-center gap-2 border-b border-warning-100 bg-warning-50 px-3 py-1 text-[11px] text-warning-600 md:hidden">
                  <Bell size={12} className="shrink-0" />
                  <button type="button" className="min-w-0 flex-1 text-left font-medium" onClick={() => setUpdateModalVisibility(true)}>
                    发现新版本 {updateVm.remoteVersion}，点击查看
                  </button>
                  <button type="button" onClick={() => setHiddenUpdateBannerId(updateVm.updateId)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-warning-100" aria-label="暂时关闭此版本更新提示"><X size={13} /></button>
                </div>
              )}

              <main className="txzz-app-main flex-1 overflow-y-auto overscroll-contain scroll-smooth">
                {renderPage()}
              </main>

              <nav aria-label="移动端主要导航" className="txzz-app-mobile-nav flex min-h-[4.25rem] shrink-0 items-center border-t border-slate-200 bg-white/97 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md md:hidden">
                {navItems.map((item) => {
                  const active = page === item.id;
                  const hasBadge = item.id === "downloads" && activeDownloads > 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPage(item.id)}
                      aria-current={active ? "page" : undefined}
                      aria-label={`前往${item.label}页`}
                      className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition ${active ? "text-brand-600" : "text-slate-400"}`}
                    >
                      <span className={`flex h-8 w-10 items-center justify-center rounded-xl transition ${active ? "bg-brand-50 text-brand-600" : "text-slate-400"}`}>
                        <item.icon size={17} strokeWidth={active ? 2.35 : 2} />
                      </span>
                      <span>{item.label}</span>
                      {hasBadge && <span className="absolute right-[calc(50%-1.25rem)] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-info-500" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {toast && (
            <div
              className={`txzz-app-toast fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[min(calc(100vw-1.5rem),28rem)] -translate-x-1/2 items-start gap-2 rounded-xl border px-3 py-2.5 shadow-xl backdrop-blur sm:bottom-8 ${toastTone}`}
              role={toast.level === "error" ? "alert" : "status"}
              aria-live={toast.level === "error" ? "assertive" : "polite"}
            >
              <ToastIcon size={15} className={`mt-0.5 shrink-0 ${toast.level === "running" ? "animate-spin" : ""}`} aria-hidden="true" />
              <span className="txzz-app-toast-text min-w-0 flex-1 text-[12px] font-medium leading-5">{toast.text}</span>
              <button type="button" onClick={() => setToast(null)} className="txzz-app-toast-close flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-60 transition hover:bg-black/5 hover:opacity-100" aria-label="关闭操作提示">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
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
