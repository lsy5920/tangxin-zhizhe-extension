import type { ReactNode, RefObject } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  Compass,
  Heart,
  History,
  House,
  LayoutDashboard,
  LoaderCircle,
  Search,
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
  resolving: boolean;
  toast: Toast;
  onNavigate: (route: CinemaPrimaryRoute) => void;
  onBack: () => void;
  onExitWorkspace: () => void;
  onClose: () => void;
  onDismissToast: () => void;
  children: ReactNode;
};

const NAVIGATION = [
  { id: "home" as const, label: "首页", hint: "今日推荐", icon: House },
  { id: "discover" as const, label: "发现", hint: "分类与筛选", icon: Compass },
  { id: "search" as const, label: "搜索", hint: "找到想看的", icon: Search },
  { id: "library" as const, label: "片库", hint: "收藏与稍后看", icon: Heart },
  { id: "history" as const, label: "足迹", hint: "最近观看", icon: History }
];

const ROUTE_META: Record<CinemaRoute["name"], { eyebrow: string; title: string; subtitle: string }> = {
  home: { eyebrow: "FOR YOU", title: "影院首页", subtitle: "从目标站原始片单发现今晚想看的影片" },
  discover: { eyebrow: "EXPLORE", title: "发现影片", subtitle: "最新、热门、权益与画面方向组合筛选" },
  search: { eyebrow: "SEARCH", title: "搜索影院", subtitle: "输入标题或关键词，目录阶段不解析播放线路" },
  library: { eyebrow: "MY LIBRARY", title: "我的片库", subtitle: "收藏、稍后看和自定义标签集中管理" },
  history: { eyebrow: "HISTORY", title: "观看足迹", subtitle: "只展示脱敏影片元数据，再次开映时重新检票" },
  detail: { eyebrow: "MOVIE", title: "影片详情", subtitle: "目录与播放严格分离" },
  playback: { eyebrow: "NOW PLAYING", title: "沉浸放映", subtitle: "完整线路只在明确点击开映后获取" }
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
  resolving,
  toast,
  onNavigate,
  onBack,
  onExitWorkspace,
  onClose,
  onDismissToast,
  children
}: Props) {
  const meta = ROUTE_META[route.name];
  const playback = route.name === "playback";
  const ToastIcon = toast?.level === "ok" ? CheckCircle2 : LoaderCircle;

  return (
    <div className="txzz-cinema-app-overlay txzz-candy-interactive fixed inset-0 z-50 bg-[#08060c] text-white">
      <div
        ref={panelRef}
        data-txzz-cinema-app="true"
        data-cinema-route={route.name}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txzz-cinema-app-title"
        tabIndex={-1}
        className={`txzz-cinema-app-shell relative flex size-full overflow-hidden outline-none ${playback ? "is-playback" : ""}`}
      >
        <div className="txzz-cinema-app-ambient pointer-events-none absolute inset-0" aria-hidden="true">
          <span className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-fuchsia-700/14 blur-3xl" />
          <span className="absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-violet-700/14 blur-3xl" />
        </div>

        {!playback && (
          <aside className="txzz-cinema-app-sidebar relative z-10 hidden w-[16.5rem] shrink-0 flex-col border-r border-white/8 bg-black/24 px-4 py-5 backdrop-blur-2xl lg:flex" aria-label="糖心影院导航">
            <button type="button" onClick={() => onNavigate("home")} className="group flex items-center gap-3 rounded-[1.35rem] px-2 py-2 text-left">
              <span className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-[0_12px_35px_rgba(181,68,216,.32)] transition group-hover:scale-105"><Clapperboard size={22} /></span>
              <span className="min-w-0">
                <span className="block text-[15px] font-black tracking-[-.02em]">糖心影院</span>
                <span className="mt-0.5 block text-[9px] font-black tracking-[.18em] text-fuchsia-200/55">CINEMA APP</span>
              </span>
            </button>

            <nav className="mt-7 space-y-1.5">
              {NAVIGATION.map((item) => {
                const active = route.name === item.id;
                const badge = item.id === "library" ? libraryCount : item.id === "history" ? historyCount : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-14 w-full items-center gap-3 rounded-[1.2rem] px-3 text-left transition ${active ? "bg-white/11 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" : "text-white/48 hover:bg-white/6 hover:text-white/82"}`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${active ? "bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white" : "bg-white/5 text-white/42 group-hover:text-white/72"}`}><item.icon size={17} /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[12px] font-black">{item.label}</span><span className="mt-0.5 block truncate text-[9px] font-semibold opacity-45">{item.hint}</span></span>
                    {badge > 0 && <span className="min-w-6 rounded-full bg-white/9 px-1.5 py-1 text-center text-[9px] font-black text-fuchsia-100">{badge > 99 ? "99+" : badge}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto space-y-2 border-t border-white/8 pt-4">
              <button type="button" onClick={onExitWorkspace} className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-[11px] font-bold text-white/50 transition hover:bg-white/7 hover:text-white"><LayoutDashboard size={15} />返回工具台</button>
              <button type="button" onClick={onClose} className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-[11px] font-bold text-white/40 transition hover:bg-rose-400/9 hover:text-rose-100"><X size={15} />收起影院</button>
              <p className="px-3 pt-1 text-[8px] font-black tracking-[.16em] text-white/24">{APP_VERSION_LABEL} · SHAKA PLAYER</p>
            </div>
          </aside>
        )}

        <section className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className={`txzz-cinema-app-header flex shrink-0 items-center gap-3 border-b border-white/8 bg-[#0b0810]/86 px-3 pt-[max(.45rem,env(safe-area-inset-top))] backdrop-blur-2xl sm:px-5 ${playback ? "min-h-[3.65rem]" : "min-h-[4.7rem]"}`}>
            {(canGoBack || playback) ? (
              <button type="button" onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/68 transition hover:bg-white/9 hover:text-white" aria-label="返回上一页"><ArrowLeft size={19} /></button>
            ) : (
              <button type="button" onClick={onExitWorkspace} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/60 transition hover:bg-white/9 hover:text-white lg:hidden" aria-label="返回工具台"><LayoutDashboard size={18} /></button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-black tracking-[.2em] text-fuchsia-300/68">{meta.eyebrow}</p>
              <h1 id="txzz-cinema-app-title" className="truncate text-[15px] font-black tracking-[-.025em] sm:text-[17px]">{meta.title}</h1>
              {!playback && <p className="mt-0.5 hidden truncate text-[9px] font-semibold text-white/36 sm:block">{meta.subtitle}</p>}
            </div>
            {resolving && <span className="hidden items-center gap-1.5 rounded-full border border-fuchsia-300/18 bg-fuchsia-300/8 px-2.5 py-1.5 text-[9px] font-black text-fuchsia-100 sm:inline-flex"><Sparkles size={11} className="animate-spin" />正在检票</span>}
            {!playback && <button type="button" onClick={() => onNavigate("search")} className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/55 transition hover:bg-white/9 hover:text-white" aria-label="搜索影片"><Search size={18} /></button>}
            <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/48 transition hover:bg-rose-400/10 hover:text-rose-100" aria-label="关闭糖心影院"><X size={18} /></button>
          </header>

          <main className={`txzz-cinema-app-main min-h-0 flex-1 overflow-y-auto overscroll-contain ${playback ? "bg-[#08060c]" : ""}`}>
            {children}
          </main>

          {!playback && (
            <nav className="txzz-cinema-app-mobile-nav relative z-20 flex min-h-[4.7rem] shrink-0 items-center border-t border-white/8 bg-[#0b0810]/94 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-2xl lg:hidden" aria-label="糖心影院移动端导航">
              {NAVIGATION.map((item) => {
                const active = route.name === item.id;
                const badge = item.id === "library" ? libraryCount : item.id === "history" ? historyCount : 0;
                return (
                  <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[9px] font-black transition ${active ? "text-fuchsia-200" : "text-white/36"}`}>
                    <span className={`flex h-8 w-10 items-center justify-center rounded-xl transition ${active ? "bg-fuchsia-300/14 text-fuchsia-200" : ""}`}><item.icon size={17} /></span>
                    <span className="truncate">{item.label}</span>
                    {badge > 0 && <span className="absolute left-[calc(50%+.7rem)] top-1.5 h-2 w-2 rounded-full bg-fuchsia-400 ring-2 ring-[#0b0810]" />}
                  </button>
                );
              })}
            </nav>
          )}
        </section>
      </div>

      {toast && (
        <div className={`fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] left-1/2 z-[75] flex w-[min(calc(100vw-1.25rem),28rem)] -translate-x-1/2 items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-2xl backdrop-blur-xl lg:bottom-6 ${toastClass(toast.level)}`} role={toast.level === "error" ? "alert" : "status"} aria-live={toast.level === "error" ? "assertive" : "polite"}>
          <ToastIcon size={15} className={`mt-0.5 shrink-0 ${toast.level === "running" ? "animate-spin" : ""}`} />
          <span className="min-w-0 flex-1 text-[11px] font-bold leading-5">{toast.text}</span>
          <button type="button" onClick={onDismissToast} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl opacity-65 hover:bg-white/8 hover:opacity-100" aria-label="关闭提示"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
