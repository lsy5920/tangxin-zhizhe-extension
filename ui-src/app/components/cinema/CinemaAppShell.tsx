import { useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  Compass,
  Download,
  ExternalLink,
  Heart,
  History,
  House,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import type { CinemaPrimaryRoute, CinemaRoute } from "../../cinema/appModel";
import { APP_VERSION_LABEL } from "../../constants";

type Toast = { text: string; level: string } | null;

type Props = {
  panelRef: RefObject<HTMLDivElement>;
  route: CinemaRoute;
  canGoBack: boolean;
  libraryCount: number;
  historyCount: number;
  downloadCount: number;
  activeDownloadCount: number;
  catalogCount: number;
  resolving: boolean;
  toast: Toast;
  onNavigate: (route: CinemaPrimaryRoute) => void;
  onBack: () => void;
  onExitWorkspace: () => void;
  onClose: () => void;
  onDismissToast: () => void;
  standalone?: boolean;
  children: ReactNode;
};

const NAVIGATION = [
  { id: "home" as const, label: "首页", hint: "为你推荐", icon: House },
  { id: "discover" as const, label: "发现", hint: "分类筛选", icon: Compass },
  { id: "search" as const, label: "搜索", hint: "全站找片", icon: Search },
  { id: "library" as const, label: "片库", hint: "收藏与稍后看", icon: Heart },
  { id: "history" as const, label: "足迹", hint: "继续观看", icon: History },
  { id: "downloads" as const, label: "下载", hint: "队列与存储", icon: Download }
];

const ROUTE_META: Record<CinemaRoute["name"], { eyebrow: string; title: string; subtitle: string }> = {
  home: { eyebrow: "FOR YOU", title: "糖心影院", subtitle: "从原始片单挑一部今晚想看的影片" },
  discover: { eyebrow: "EXPLORE", title: "发现影片", subtitle: "按热度、权益与画面方向组合筛选" },
  search: { eyebrow: "SEARCH", title: "搜索影院", subtitle: "目录阶段只找影片，点击后才获取完整线路" },
  library: { eyebrow: "MY LIBRARY", title: "我的片库", subtitle: "收藏、稍后看、标签与备注集中管理" },
  history: { eyebrow: "KEEP WATCHING", title: "观看足迹", subtitle: "从上次故事继续，每次开映都会重新检票" },
  downloads: { eyebrow: "DOWNLOAD CENTER", title: "下载中心", subtitle: "可恢复队列、智能调度与 OPFS 存储管家" },
  detail: { eyebrow: "MOVIE DETAILS", title: "影片详情", subtitle: "浏览目录元数据、合集选集与相关推荐" },
  playback: { eyebrow: "NOW PLAYING", title: "沉浸放映", subtitle: "Shaka Player 完整线路放映中" }
};

function toastClass(level?: string) {
  if (level === "error") return "border-rose-300/30 bg-rose-500/18 text-rose-50";
  if (level === "ok") return "border-emerald-300/30 bg-emerald-500/18 text-emerald-50";
  return "border-violet-300/25 bg-violet-500/18 text-violet-50";
}

export function CinemaAppShell({
  panelRef,
  route,
  canGoBack,
  libraryCount,
  historyCount,
  downloadCount,
  activeDownloadCount,
  catalogCount,
  resolving,
  toast,
  onNavigate,
  onBack,
  onExitWorkspace,
  onClose,
  onDismissToast,
  standalone = false,
  children
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const meta = ROUTE_META[route.name];
  const playback = route.name === "playback";
  const ToastIcon = toast?.level === "ok" ? CheckCircle2 : LoaderCircle;

  const badgeFor = (routeId: CinemaPrimaryRoute) => {
    if (routeId === "library") return libraryCount;
    if (routeId === "history") return historyCount;
    if (routeId === "downloads") return activeDownloadCount || downloadCount;
    return 0;
  };

  return (
    <div className={`txzz-cinema-app-overlay txzz-candy-interactive fixed inset-0 z-50 bg-[#0b0710] text-white ${standalone ? "is-standalone" : ""}`}>
      <div
        ref={panelRef}
        data-txzz-cinema-app="true"
        data-cinema-route={route.name}
        data-cinema-standalone={standalone ? "true" : "false"}
        role={standalone ? "application" : "dialog"}
        aria-modal={standalone ? undefined : "true"}
        aria-labelledby="txzz-cinema-app-title"
        tabIndex={-1}
        className={`txzz-cinema-app-shell relative flex size-full overflow-hidden outline-none ${playback ? "is-playback" : ""} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
      >
        <div className="txzz-cinema-app-ambient pointer-events-none absolute inset-0" aria-hidden="true">
          <span className="txzz-cinema-ambient-orb is-pink" />
          <span className="txzz-cinema-ambient-orb is-violet" />
          <span className="txzz-cinema-ambient-cloud is-left" />
          <span className="txzz-cinema-ambient-cloud is-right" />
          <span className="txzz-cinema-sparkle is-one">✦</span>
          <span className="txzz-cinema-sparkle is-two">✧</span>
          <span className="txzz-cinema-sparkle is-three">✦</span>
        </div>

        {!playback && (
          <aside className="txzz-cinema-app-sidebar relative z-10 hidden shrink-0 flex-col border-r border-white/8 bg-[#120b18]/72 px-3 py-4 backdrop-blur-2xl lg:flex" aria-label="糖心影院导航">
            <div className="flex items-center gap-2 px-1">
              <button type="button" onClick={() => onNavigate("home")} className="txzz-cinema-brand group flex min-w-0 flex-1 items-center gap-3 rounded-[1.4rem] px-2 py-2 text-left">
                <span className="txzz-cinema-brand-mark relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.25rem] text-[23px] text-white" aria-hidden="true">
                  🍿<i className="txzz-cinema-brand-star">✦</i>
                </span>
                <span className="txzz-cinema-sidebar-label min-w-0">
                  <span className="block truncate text-[15px] font-black tracking-[-.03em]">糖心影院</span>
                  <span className="mt-0.5 block text-[8px] font-black tracking-[.21em] text-fuchsia-200/58">TANGXIN CINEMA</span>
                </span>
              </button>
              <button type="button" onClick={() => setSidebarCollapsed((value) => !value)} className="txzz-cinema-sidebar-toggle flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/36 transition hover:bg-white/8 hover:text-white" aria-label={sidebarCollapsed ? "展开影院导航" : "收起影院导航"}>
                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>

            <nav className="mt-6 space-y-1.5">
              {NAVIGATION.map((item) => {
                const active = route.name === item.id;
                const badge = badgeFor(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={active ? "page" : undefined}
                    title={sidebarCollapsed ? `${item.label} · ${item.hint}` : undefined}
                    className={`txzz-cinema-nav-item group relative flex min-h-14 w-full items-center gap-3 rounded-[1.2rem] px-3 text-left transition ${active ? "is-active bg-white/11 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.09),0_14px_30px_rgba(0,0,0,.12)]" : "text-white/48 hover:bg-white/6 hover:text-white/84"}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${active ? "bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-[0_8px_18px_rgba(191,72,202,.24)]" : "bg-white/5 text-white/42 group-hover:text-white/76"}`}><item.icon size={17} /></span>
                    <span className="txzz-cinema-sidebar-label min-w-0 flex-1"><span className="block text-[12px] font-black">{item.label}</span><span className="mt-0.5 block truncate text-[8px] font-semibold opacity-44">{item.hint}</span></span>
                    {badge > 0 && <span className="txzz-cinema-nav-badge min-w-6 rounded-full bg-fuchsia-300/12 px-1.5 py-1 text-center text-[8px] font-black text-fuchsia-100">{badge > 99 ? "99+" : badge}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="txzz-cinema-sidebar-label mt-auto space-y-3 pt-4">
              <div className="txzz-cinema-library-summary rounded-[1.25rem] border border-white/8 bg-white/[.045] p-3">
                <div className="flex items-center justify-between gap-2 text-[8px] font-black tracking-[.14em] text-fuchsia-200/55"><span>CINEMA DATA</span><ShieldCheck size={12} /></div>
                <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                  <span><strong className="block text-[13px] text-white">{catalogCount}</strong><small className="text-[7px] font-bold text-white/32">片单</small></span>
                  <span><strong className="block text-[13px] text-white">{libraryCount}</strong><small className="text-[7px] font-bold text-white/32">片库</small></span>
                  <span><strong className="block text-[13px] text-white">{downloadCount}</strong><small className="text-[7px] font-bold text-white/32">下载</small></span>
                </div>
              </div>
              <div className="space-y-1 border-t border-white/8 pt-3">
                <button type="button" onClick={onExitWorkspace} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[10px] font-bold text-white/46 transition hover:bg-white/7 hover:text-white"><ExternalLink size={14} />打开视频站</button>
                <button type="button" onClick={onClose} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[10px] font-bold text-white/38 transition hover:bg-rose-400/9 hover:text-rose-100"><X size={14} />关闭影院标签页</button>
                <p className="px-3 pt-1 text-[7px] font-black tracking-[.14em] text-white/22">{APP_VERSION_LABEL} · SHAKA PLAYER</p>
              </div>
            </div>
          </aside>
        )}

        <section className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className={`txzz-cinema-app-header flex shrink-0 items-center gap-2.5 border-b border-white/8 bg-[#0d0813]/82 px-3 pt-[max(.45rem,env(safe-area-inset-top))] backdrop-blur-2xl sm:px-5 ${playback ? "min-h-[3.65rem]" : "min-h-[4.7rem]"}`}>
            {(canGoBack || playback) ? (
              <button type="button" onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/68 transition hover:bg-white/9 hover:text-white" aria-label="返回上一页"><ArrowLeft size={19} /></button>
            ) : (
              <button type="button" onClick={() => onNavigate("home")} className="txzz-cinema-mobile-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-lg shadow-lg lg:hidden" aria-label="返回影院首页">🍿</button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[7px] font-black tracking-[.21em] text-fuchsia-300/68">{meta.eyebrow}</p>
              <h1 id="txzz-cinema-app-title" className="truncate text-[15px] font-black tracking-[-.028em] sm:text-[18px]">{meta.title}</h1>
              {!playback && <p className="mt-0.5 hidden truncate text-[8px] font-semibold text-white/36 sm:block">{meta.subtitle}</p>}
            </div>

            {!playback && route.name !== "search" && (
              <button type="button" onClick={() => onNavigate("search")} className="txzz-cinema-command-search hidden min-h-10 min-w-[13rem] items-center gap-2 rounded-2xl border border-white/8 bg-white/[.045] px-3 text-left text-[9px] font-semibold text-white/34 transition hover:border-fuchsia-300/18 hover:bg-white/[.07] hover:text-white/58 xl:flex" aria-label="搜索影片">
                <Search size={14} /><span className="flex-1">搜索片名或关键词</span><kbd className="rounded-md border border-white/8 bg-black/20 px-1.5 py-0.5 text-[7px]">/</kbd>
              </button>
            )}

            {resolving && <span className="hidden items-center gap-1.5 rounded-full border border-fuchsia-300/18 bg-fuchsia-300/8 px-2.5 py-1.5 text-[8px] font-black text-fuchsia-100 sm:inline-flex"><Sparkles size={11} className="animate-spin" />正在检票</span>}
            {standalone && !playback && <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/12 bg-emerald-300/7 px-2.5 py-1.5 text-[8px] font-black text-emerald-100/72 md:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />独立影院页</span>}
            {activeDownloadCount > 0 && !playback && <button type="button" onClick={() => onNavigate("downloads")} className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-fuchsia-100/70 transition hover:bg-white/9 hover:text-white" aria-label={`${activeDownloadCount} 个下载任务进行中`}><Download size={17} /><span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-fuchsia-500 px-1 text-[7px] font-black leading-4 text-white">{activeDownloadCount}</span></button>}
            {!playback && <button type="button" onClick={() => onNavigate("search")} className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/48 transition hover:bg-white/9 hover:text-white xl:hidden" aria-label="搜索影片"><Search size={18} /></button>}
            <button type="button" onClick={onExitWorkspace} className="hidden h-11 w-11 items-center justify-center rounded-2xl text-white/42 transition hover:bg-white/9 hover:text-white sm:flex" aria-label="打开视频站"><ExternalLink size={17} /></button>
            <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/42 transition hover:bg-rose-400/10 hover:text-rose-100" aria-label="关闭糖心影院"><X size={18} /></button>
          </header>

          <main className={`txzz-cinema-app-main min-h-0 flex-1 overflow-y-auto overscroll-contain ${playback ? "bg-[#08060c]" : ""}`}>
            {children}
          </main>

          {!playback && (
            <nav className="txzz-cinema-app-mobile-nav relative z-20 flex min-h-[4.75rem] shrink-0 items-center border-t border-white/8 bg-[#0c0811]/94 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-2xl lg:hidden" aria-label="糖心影院移动端导航">
              {NAVIGATION.map((item) => {
                const active = route.name === item.id;
                const badge = badgeFor(item.id);
                return (
                  <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[8px] font-black transition ${active ? "text-fuchsia-200" : "text-white/34"}`}>
                    <span className={`flex h-8 w-9 items-center justify-center rounded-xl transition ${active ? "bg-fuchsia-300/14 text-fuchsia-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]" : ""}`}><item.icon size={16} /></span>
                    <span className="truncate">{item.label}</span>
                    {badge > 0 && <span className="absolute left-[calc(50%+.55rem)] top-1 min-w-3.5 rounded-full bg-fuchsia-500 px-0.5 text-[7px] leading-3.5 text-white ring-2 ring-[#0b0810]">{badge > 9 ? "9+" : badge}</span>}
                  </button>
                );
              })}
            </nav>
          )}
        </section>
      </div>

      {toast && (
        <div className={`fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] left-1/2 z-[75] flex w-[min(calc(100vw-1.25rem),30rem)] -translate-x-1/2 items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-2xl backdrop-blur-xl lg:bottom-6 ${toastClass(toast.level)}`} role={toast.level === "error" ? "alert" : "status"} aria-live={toast.level === "error" ? "assertive" : "polite"}>
          <ToastIcon size={15} className={`mt-0.5 shrink-0 ${toast.level === "running" ? "animate-spin" : ""}`} />
          <span className="min-w-0 flex-1 text-[11px] font-bold leading-5">{toast.text}</span>
          <button type="button" onClick={onDismissToast} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl opacity-65 hover:bg-white/8 hover:opacity-100" aria-label="关闭提示"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
