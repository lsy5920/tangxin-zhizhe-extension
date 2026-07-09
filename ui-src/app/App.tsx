import { useEffect, useRef, useState } from "react";
import { Bell, Download, Info, LayoutDashboard, Play, Settings, Users, X, Zap } from "lucide-react";
import { listenBridgeState, notifyUiReady, sendUiAction } from "./bridge";
import type { AccountsPageIntent, BridgeState, Page } from "./types";
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

const flowLevelColors: Record<string, string> = {
  ok: "from-emerald-500 to-teal-500",
  error: "from-rose-500 to-red-500",
  info: "from-pink-500 to-purple-600",
  running: "from-amber-400 to-orange-500"
};
function action(actionName: string, payload: Record<string, unknown> = {}) {
  sendUiAction(actionName, payload);
}

function disableHostPlaybackFullscreenMode() {
  restoreFullscreenChrome(getPluginHost());
  // 兼容旧类名清理
  getPluginHost()?.classList.remove(PLAYER_FULLSCREEN_HOST_CLASS);
}

function flowMessage(state: BridgeState, index: number): { text: string; level: string } {
  const latest = (state.flow || []).slice(-4);
  if (latest.length) {
    const item = latest[index % latest.length];
    return { text: flowItemText(item) || "糖心志者正在运行", level: item?.level || "info" };
  }
  const fallbacks = [
    { text: "正在同步云端账号池", level: "info" },
    { text: "账号池就绪，等待播放请求", level: "ok" },
    { text: "获取播放详情完成", level: "ok" },
    { text: "金币视频自动解锁就绪", level: "info" }
  ];
  return fallbacks[index % fallbacks.length];
}

export default function App() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
  const [flowIdx, setFlowIdx] = useState(0);
  const [showFlow, setShowFlow] = useState(true);
  const [showUpdateBanner, setShowUpdateBanner] = useState(true);
  const [bridgeState, setBridgeState] = useState<BridgeState>({});
  const [accountsIntent, setAccountsIntent] = useState<AccountsPageIntent>({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [dismissedUpdateId, setDismissedUpdateId] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const moved = useRef(false);

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
    if (open) return;
    const timer = window.setInterval(() => setFlowIdx((v) => v + 1), 2800);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    const remote = bridgeState.repositoryUpdate?.remote;
    const updateId = String(remote?.id || `${remote?.version || ""}|${remote?.build || ""}`);
    if (!bridgeState.repositoryUpdate?.updateAvailable || !updateId || dismissedUpdateId === updateId) return;
    setShowUpdateModal(true);
  }, [
    bridgeState.repositoryUpdate?.updateAvailable,
    bridgeState.repositoryUpdate?.remote?.id,
    bridgeState.repositoryUpdate?.remote?.version,
    bridgeState.repositoryUpdate?.remote?.build,
    dismissedUpdateId
  ]);

  // 检测结果返回后结束“检查中”态，避免弹窗状态卡住。
  useEffect(() => {
    if (!checkingUpdate) return;
    const checkedAt = bridgeState.repositoryUpdate?.checkedAt;
    if (!checkedAt) return;
    setCheckingUpdate(false);
  }, [bridgeState.repositoryUpdate?.checkedAt, checkingUpdate]);

  // 下载状态写入后结束“下载中”态。
  useEffect(() => {
    if (!downloadingUpdate) return;
    const status = bridgeState.repositoryUpdate?.downloadStatus || "";
    if (!status) return;
    setDownloadingUpdate(false);
  }, [bridgeState.repositoryUpdate?.downloadStatus, downloadingUpdate]);

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
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBallPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setBallPos({ x: dragStart.current.bx + dx, y: dragStart.current.by + dy });
  };
  const onBallPointerUp = () => { dragging.current = false; if (!moved.current) openPanel(); };

  const goPage = (target: Page, intent: AccountsPageIntent = {}) => {
    if (target === "accounts") setAccountsIntent(intent);
    setPage(target);
  };

  const handleCheckUpdate = () => {
    setCheckingUpdate(true);
    action("check-update");
    window.setTimeout(() => setCheckingUpdate(false), 9000);
  };

  const handleDownloadUpdate = () => {
    setDownloadingUpdate(true);
    action("download-latest");
    window.setTimeout(() => setDownloadingUpdate(false), 10000);
  };

  const renderPage = () => {
    // 每个业务页包一层错误边界：单页崩溃时保留悬浮球与面板外壳，避免整站 UI 消失。
    const body = page === "overview"
      ? <OverviewPage state={bridgeState} onAction={action} onPage={setPage} />
      : page === "accounts"
        ? <AccountsPage state={bridgeState} onAction={action} intent={accountsIntent} />
        : page === "playback"
          ? <PlaybackPage state={bridgeState} onAction={action} onPage={setPage} />
          : page === "downloads"
            ? <DownloadsPage state={bridgeState} onAction={action} />
            : <SettingsPage state={bridgeState} onAction={action} onPage={goPage} />;
    return (
      <PageErrorBoundary key={page} title={`${pageTitles[page]}页加载失败`} onReset={() => setPage(page)}>
        {body}
      </PageErrorBoundary>
    );
  };

  const updateVm = buildUpdateViewModel(bridgeState, {
    checking: checkingUpdate,
    downloading: downloadingUpdate
  });
  const updateAvailable = updateVm.status === "available";
  const activeDownloads = Object.values(bridgeState.downloadTasks || {})
    .filter((t) => t && ["queued", "playlist", "segments", "segment", "ready"].includes(
      String((t as { stage?: string }).stage || "")
    )).length;
  const { text: flowText, level: flowLevel } = flowMessage(bridgeState, flowIdx);
  const flowGradient = flowLevelColors[flowLevel] || flowLevelColors.info;

  return (
    <div className="txzz-candy-app size-full relative overflow-hidden">
      {!open && showFlow && (
        <div
          className={`txzz-candy-interactive fixed z-40 flex items-center gap-2 bg-gradient-to-r ${flowGradient} text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-lg shadow-black/10 ring-1 ring-white/25 cursor-pointer`}
          style={{
            top: "max(1rem, env(safe-area-inset-top))",
            left: "max(1rem, env(safe-area-inset-left))",
            maxWidth: "calc(100vw - 5rem)"
          }}
          onClick={() => setShowFlow(false)}
          title="点击关闭提示条"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/80 shrink-0 animate-pulse" />
          <span className="truncate">{flowText}</span>
        </div>
      )}

      {!open && (
        <div
          onPointerDown={onBallPointerDown}
          onPointerMove={onBallPointerMove}
          onPointerUp={onBallPointerUp}
          className="txzz-candy-interactive fixed z-50 cursor-pointer select-none touch-none"
          style={{
            right: "max(1.25rem, env(safe-area-inset-right))",
            bottom: "max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
            transform: `translate(${ballPos.x}px, ${ballPos.y}px)`
          }}
          title="点击打开糖心志者面板"
        >
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 via-rose-400 to-purple-600 shadow-xl shadow-pink-500/35 ring-2 ring-white/45 transition-transform duration-150 active:scale-95 after:absolute after:inset-0 after:rounded-full after:bg-gradient-to-t after:from-black/10 after:to-white/10 after:pointer-events-none">
            <span className="relative z-[1] select-none text-xl font-bold text-white drop-shadow-sm">志</span>
            <div
              className={`absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm transition-colors ${
                updateAvailable ? "bg-amber-400 animate-pulse" : activeDownloads > 0 ? "bg-orange-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
          </div>
          {activeDownloads > 0 && (
            <div className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-orange-500 shadow-sm">
              <span className="text-[9px] font-bold text-white">{activeDownloads}</span>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="txzz-app-panel-overlay txzz-candy-interactive fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5">
          <div className="txzz-app-panel-backdrop absolute inset-0 bg-black/38 backdrop-blur-[10px]" onClick={closePanel} />
          <div className="txzz-app-panel-frame relative flex h-full w-full flex-col overflow-hidden rounded-none border border-pink-100/80 bg-[#fffafc]/95 shadow-[0_28px_90px_rgba(147,51,234,0.22)] backdrop-blur-2xl sm:h-auto sm:max-h-[min(92vh,880px)] sm:w-[820px] sm:max-w-full sm:flex-row sm:rounded-[1.85rem]">

            <aside className="txzz-app-sidebar hidden w-[5.75rem] shrink-0 flex-col items-center gap-0.5 bg-gradient-to-b from-pink-400 via-rose-400 to-purple-600 py-5 sm:flex">
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/22 shadow-inner ring-1 ring-white/35 backdrop-blur">
                <span className="text-xl font-bold text-white drop-shadow-sm">志</span>
              </div>
              <span className="mb-4 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-medium text-white/85">{APP_VERSION_LABEL}</span>

              {navItems.map((item) => {
                const active = page === item.id;
                const hasBadge = item.id === "downloads" && activeDownloads > 0;
                const hasUpdateDot = item.id === "settings" && updateAvailable;
                return (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    className={`relative mb-0.5 flex w-[4.25rem] flex-col items-center gap-1 rounded-2xl py-2.5 transition-all ${active ? "bg-white/28 shadow-inner ring-1 ring-white/25" : "hover:bg-white/12"}`}
                  >
                    <item.icon size={18} className="text-white" strokeWidth={active ? 2.4 : 2} />
                    <span className="text-[9px] font-semibold text-white">{item.label}</span>
                    {hasBadge && (
                      <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/80 bg-orange-400 text-[8px] font-bold text-white">
                        {activeDownloads}
                      </span>
                    )}
                    {hasUpdateDot && (
                      <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full border border-white bg-amber-300 animate-pulse" />
                    )}
                  </button>
                );
              })}

              <button
                onClick={closePanel}
                className="mt-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition-all hover:bg-white/28"
                title="关闭面板 (Esc)"
              >
                <X size={16} className="text-white" />
              </button>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#fffafc] via-white to-pink-50/40">
              <header className="txzz-app-header flex shrink-0 items-center justify-between border-b border-pink-100/80 bg-white/88 px-4 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pink-400 to-purple-600 shadow-sm shadow-pink-400/30 sm:hidden">
                    <span className="text-sm font-bold text-white">志</span>
                  </div>
                  <div>
                    <h1 className="text-[13px] font-bold tracking-tight text-purple-900 sm:text-sm">{pageTitles[page]}</h1>
                    <p className="text-[10px] text-purple-400">{pageSubtitles[page]} · {APP_VERSION_LABEL}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {showUpdateBanner && (
                    <button
                      onClick={() => {
                        if (updateAvailable) setShowUpdateModal(true);
                        else setPage("settings");
                      }}
                      className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors sm:flex ${
                        updateAvailable
                          ? "border-amber-200 bg-amber-50 text-amber-600"
                          : updateVm.status === "error"
                            ? "border-rose-200 bg-rose-50 text-rose-600"
                            : "border-pink-100 bg-pink-50/80 text-purple-400"
                      }`}
                    >
                      {updateAvailable ? <Bell size={11} /> : <Zap size={11} />}
                      <span>
                        {updateAvailable
                          ? "有新版本"
                          : updateVm.status === "error"
                            ? "检测失败"
                            : updateVm.status === "checking"
                              ? "检测中"
                              : "已是最新"}
                      </span>
                    </button>
                  )}
                  <button onClick={() => action("about")} className="rounded-full p-1.5 text-purple-400 transition-colors hover:bg-purple-50" title="打开项目主页">
                    <Info size={16} />
                  </button>
                  <button onClick={closePanel} className="rounded-full p-1.5 text-purple-400 transition-colors hover:bg-pink-50 sm:hidden">
                    <X size={16} />
                  </button>
                </div>
              </header>

              {showUpdateBanner && updateAvailable && (
                <div className="flex shrink-0 items-center gap-2 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 text-[11px] text-amber-600 sm:hidden">
                  <Bell size={11} className="shrink-0" />
                  <button className="flex-1 text-left font-medium" onClick={() => setShowUpdateModal(true)}>
                    发现新版本 {updateVm.remoteVersion}，点击查看并下载
                  </button>
                  <button onClick={() => setShowUpdateBanner(false)} className="rounded-full p-0.5 hover:bg-amber-100"><X size={12} /></button>
                </div>
              )}

              <main className="txzz-app-main flex-1 overflow-y-auto overscroll-contain scroll-smooth">
                {renderPage()}
              </main>

              <nav className="txzz-app-mobile-nav flex shrink-0 items-center border-t border-pink-100/90 bg-white/97 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md sm:hidden">
                {navItems.map((item) => {
                  const active = page === item.id;
                  const hasBadge = item.id === "downloads" && activeDownloads > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setPage(item.id)}
                      className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 transition-all ${active ? "text-pink-500" : "text-purple-300"}`}
                    >
                      <div className={`rounded-xl p-1.5 transition-all ${active ? "scale-105 bg-gradient-to-br from-pink-400 to-purple-500 shadow-md shadow-pink-400/30" : "hover:bg-pink-50"}`}>
                        <item.icon size={17} className={active ? "text-white" : ""} strokeWidth={active ? 2.4 : 2} />
                      </div>
                      <span className={`text-[9px] font-semibold ${active ? "text-pink-500" : ""}`}>{item.label}</span>
                      {hasBadge && (
                        <span className="absolute top-1 right-[calc(50%-1.05rem)] h-2.5 w-2.5 rounded-full border border-white bg-orange-400 shadow-sm" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      )}

      <UpdateModal
        state={bridgeState}
        open={showUpdateModal}
        checking={checkingUpdate}
        downloading={downloadingUpdate}
        onClose={() => setShowUpdateModal(false)}
        onDismiss={(updateId) => {
          if (updateId) setDismissedUpdateId(updateId);
          setShowUpdateModal(false);
          action("dismiss-update", { updateId });
        }}
        onOpenSettings={() => {
          setOpen(true);
          setPage("settings");
          setShowUpdateModal(false);
          action("toggle", { force: true });
        }}
        onDownload={handleDownloadUpdate}
        onCheck={handleCheckUpdate}
      />
    </div>
  );
}
