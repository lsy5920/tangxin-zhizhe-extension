import { useEffect, useRef, useState } from "react";
import { Bell, Download, Info, LayoutDashboard, Play, Settings, Users, Video, X, Zap } from "lucide-react";
import { listenBridgeState, notifyUiReady, sendUiAction } from "./bridge";
import type { AccountsPageIntent, BridgeState, Page } from "./types";
import { OverviewPage } from "./components/OverviewPage";
import { AccountsPage } from "./components/AccountsPage";
import { PlaybackPage } from "./components/PlaybackPage";
import { DownloadsPage } from "./components/DownloadsPage";
import { SettingsPage } from "./components/SettingsPage";
import { APP_VERSION_LABEL } from "./constants";
import { absoluteUrl, flowItemText, latestFullDetail } from "./helpers";

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

const flowLevelColors: Record<string, string> = {
  ok: "from-emerald-500 to-teal-500",
  error: "from-rose-500 to-red-500",
  info: "from-pink-500 to-purple-600",
  running: "from-amber-400 to-orange-500"
};

function action(actionName: string, payload: Record<string, unknown> = {}) {
  sendUiAction(actionName, payload);
}

type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

function requestHostFullscreen() {
  const host = document.getElementById("txzz-candy-ui-root") as FullscreenTarget | null;
  const request = host?.requestFullscreen || host?.webkitRequestFullscreen || host?.msRequestFullscreen;
  if (!host || !request) return;
  try {
    Promise.resolve(request.call(host)).catch(() => {});
  } catch {
    // 浏览器全屏只能在用户点击时尝试，失败后播放页会继续使用沉浸全屏兜底。
  }
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
  const [playbackAutofullscreenSignal, setPlaybackAutofullscreenSignal] = useState(0);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [dismissedUpdateId, setDismissedUpdateId] = useState("");
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
  }, [bridgeState.repositoryUpdate?.updateAvailable, bridgeState.repositoryUpdate?.remote?.id, bridgeState.repositoryUpdate?.remote?.version, bridgeState.repositoryUpdate?.remote?.build, dismissedUpdateId]);

  const openPanel = () => { setOpen(true); action("toggle", { force: true }); };
  const closePanel = () => { setOpen(false); action("close"); };
  const openFloatingPlayback = () => {
    // 网页原生视频先暂停，避免插件播放器全屏后出现双声道或后台继续播放。
    action("pause-page-video");
    requestHostFullscreen();
    setOpen(true);
    setPage("playback");
    action("toggle", { force: true });
    setPlaybackAutofullscreenSignal((value) => value + 1);
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

  const renderPage = () => {
    if (page === "overview") return <OverviewPage state={bridgeState} onAction={action} onPage={setPage} />;
    if (page === "accounts") return <AccountsPage state={bridgeState} onAction={action} intent={accountsIntent} />;
    if (page === "playback") return <PlaybackPage state={bridgeState} onAction={action} onPage={setPage} autoFullscreenSignal={playbackAutofullscreenSignal} />;
    if (page === "downloads") return <DownloadsPage state={bridgeState} onAction={action} />;
    return <SettingsPage state={bridgeState} onAction={action} onPage={goPage} />;
  };

  const updateAvailable = Boolean(bridgeState.repositoryUpdate?.updateAvailable);
  const remoteUpdate = bridgeState.repositoryUpdate?.remote;
  const currentUpdateId = String(remoteUpdate?.id || `${remoteUpdate?.version || ""}|${remoteUpdate?.build || ""}`);
  const updateSummary = bridgeState.repositoryUpdate?.ok === false
    ? `更新检测失败：${bridgeState.repositoryUpdate?.error || "请稍后重试"}`
    : remoteUpdate?.detail || remoteUpdate?.notes || remoteUpdate?.text || remoteUpdate?.line || remoteUpdate?.title || "检测到新版本，建议下载最新版。";
  const updateMeta = [
    remoteUpdate?.version ? `远程版本 v${remoteUpdate.version}` : "",
    remoteUpdate?.build ? `构建 ${remoteUpdate.build}` : "",
    remoteUpdate?.releasedAt ? `发布 ${remoteUpdate.releasedAt}` : "",
    remoteUpdate?.detectionSource ? `来源 ${remoteUpdate.detectionSource}` : bridgeState.repositoryUpdate?.source ? `来源 ${bridgeState.repositoryUpdate.source}` : ""
  ].filter(Boolean).join(" · ");
  const latestVideo = latestFullDetail(bridgeState);
  const latestVideoUrl = absoluteUrl(latestVideo?.playLink || latestVideo?.backupLink || "");
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
          className={`txzz-candy-interactive fixed top-4 left-4 z-40 flex items-center gap-2 bg-gradient-to-r ${flowGradient} text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-lg cursor-pointer`}
          style={{ maxWidth: "calc(100vw - 80px)" }}
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
          className="txzz-candy-interactive fixed bottom-20 right-5 z-50 cursor-pointer select-none touch-none"
          style={{ transform: `translate(${ballPos.x}px, ${ballPos.y}px)` }}
          title="点击打开糖心志者面板"
        >
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 via-rose-400 to-purple-600 shadow-xl flex items-center justify-center relative active:scale-95 transition-transform duration-150">
            <span className="text-white text-xl font-bold select-none">志</span>
            <div
              className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white transition-colors ${
                updateAvailable ? "bg-amber-400 animate-pulse" : activeDownloads > 0 ? "bg-orange-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
          </div>
          {activeDownloads > 0 && (
            <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center">
              <span className="text-white text-[9px] font-bold">{activeDownloads}</span>
            </div>
          )}
        </div>
      )}

      {!open && latestVideoUrl && (
        <button
          type="button"
          onClick={openFloatingPlayback}
          className="txzz-candy-interactive fixed bottom-40 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-cyan-400 to-emerald-500 text-white shadow-xl transition-transform active:scale-95"
          title="使用插件播放器全屏播放，并暂停网页原视频"
        >
          <Video size={20} />
          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 animate-pulse" />
        </button>
      )}

      {open && (
        <div className="txzz-candy-interactive fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={closePanel} />
          <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-[720px] sm:max-w-full bg-white/95 backdrop-blur-xl rounded-none sm:rounded-3xl shadow-2xl flex flex-col sm:flex-row overflow-hidden border border-pink-100">

            <aside className="hidden sm:flex flex-col w-20 bg-gradient-to-b from-pink-400 via-rose-400 to-purple-600 py-5 items-center gap-1 shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center mb-2 shadow-inner">
                <span className="text-white text-xl font-bold">志</span>
              </div>
              <span className="text-white/70 text-[9px] font-medium mb-3">{APP_VERSION_LABEL}</span>

              {navItems.map((item) => {
                const active = page === item.id;
                const hasBadge = item.id === "downloads" && activeDownloads > 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    className={`relative w-14 flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${active ? "bg-white/25 shadow-inner" : "hover:bg-white/10"}`}
                  >
                    <item.icon size={20} className="text-white" />
                    <span className="text-[9px] text-white font-medium">{item.label}</span>
                    {hasBadge && (
                      <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-orange-400 border border-white/80 flex items-center justify-center text-[8px] text-white font-bold">
                        {activeDownloads}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                onClick={closePanel}
                className="mt-auto w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"
                title="关闭面板 (Esc)"
              >
                <X size={16} className="text-white" />
              </button>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <header className="flex items-center justify-between px-4 py-3 border-b border-pink-100 shrink-0 bg-white/80">
                <div className="flex items-center gap-2">
                  <div className="sm:hidden w-8 h-8 rounded-xl bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">志</span>
                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-purple-800">{pageTitles[page]}</h1>
                    <p className="text-[10px] text-purple-400 hidden sm:block">糖心志者控制台 · {APP_VERSION_LABEL}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {showUpdateBanner && (
                    <button
                      onClick={() => updateAvailable ? setShowUpdateModal(true) : setPage("settings")}
                      className={`hidden sm:flex items-center gap-1.5 border rounded-full px-3 py-1 text-[11px] ${updateAvailable ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-pink-50 border-pink-100 text-purple-400"}`}
                    >
                      {updateAvailable ? <Bell size={11} /> : <Zap size={11} />}
                      <span>{updateAvailable ? "有新版本可用" : "版本最新"}</span>
                    </button>
                  )}
                  <button onClick={() => action("about")} className="rounded-full p-1.5 text-purple-400 hover:bg-purple-50" title="打开项目主页">
                    <Info size={16} />
                  </button>
                  <button onClick={closePanel} className="rounded-full p-1.5 text-purple-400 hover:bg-pink-50 sm:hidden">
                    <X size={16} />
                  </button>
                </div>
              </header>

              {showUpdateBanner && updateAvailable && (
                <div className="flex shrink-0 items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-600 sm:hidden">
                  <Bell size={11} className="shrink-0" />
                  <button className="flex-1 text-left" onClick={() => setShowUpdateModal(true)}>发现新版本，点击查看更新内容并下载</button>
                  <button onClick={() => setShowUpdateBanner(false)}><X size={12} /></button>
                </div>
              )}

              <main className="flex-1 overflow-y-auto overscroll-contain">
                {renderPage()}
              </main>

              <nav className="flex shrink-0 items-center border-t border-pink-100 bg-white/90 sm:hidden">
                {navItems.map((item) => {
                  const active = page === item.id;
                  const hasBadge = item.id === "downloads" && activeDownloads > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setPage(item.id)}
                      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-all ${active ? "text-pink-500" : "text-purple-300"}`}
                    >
                      <div className={`rounded-xl p-1.5 transition-all ${active ? "bg-gradient-to-br from-pink-400 to-purple-500 shadow-md" : ""}`}>
                        <item.icon size={18} className={active ? "text-white" : ""} />
                      </div>
                      <span className="text-[9px] font-medium">{item.label}</span>
                      {hasBadge && (
                        <span className="absolute top-2 right-2 w-3 h-3 rounded-full bg-orange-400 border border-white" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      )}

      {showUpdateModal && updateAvailable && (
        <div className="txzz-candy-interactive fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-100 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600">
                  <Bell size={12} /> 检测到新版本
                </div>
                <h3 className="text-base font-bold text-purple-800">
                  {remoteUpdate?.version ? `糖心志者 v${remoteUpdate.version}` : "糖心志者新版本"}
                </h3>
                {updateMeta && <p className="mt-1 text-[11px] leading-relaxed text-purple-300">{updateMeta}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDismissedUpdateId(currentUpdateId);
                  setShowUpdateModal(false);
                }}
                className="rounded-full p-1.5 text-purple-300 hover:bg-purple-50"
                title="关闭更新弹窗"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mb-4 max-h-40 overflow-y-auto rounded-2xl bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-purple-700">
              {updateSummary}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setPage("settings");
                  setShowUpdateModal(false);
                  action("toggle", { force: true });
                }}
                className="rounded-xl border border-purple-200 py-2 text-sm font-medium text-purple-500 transition-transform active:scale-95"
              >
                查看详情
              </button>
              <button
                type="button"
                onClick={() => {
                  action("download-latest");
                  setDismissedUpdateId(currentUpdateId);
                  setShowUpdateModal(false);
                }}
                className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2 text-sm font-medium text-white shadow-md transition-transform active:scale-95"
              >
                <Download size={15} /> 下载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
