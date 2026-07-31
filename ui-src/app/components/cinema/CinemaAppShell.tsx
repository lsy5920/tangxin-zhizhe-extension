import { useLayoutEffect } from "react";
import type { ReactNode, RefObject } from "react";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Clapperboard,
  Compass,
  Download,
  ExternalLink,
  HardDrive,
  History,
  Home,
  Library,
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
  bookmarkCount: number;
  historyCount: number;
  downloadCount: number;
  activeDownloadCount: number;
  catalogCount: number;
  storageIssueCount: number;
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

const PRIMARY_NAV = [
  { id: "home" as const, label: "首页", icon: Home },
  { id: "discover" as const, label: "发现", icon: Compass },
  { id: "search" as const, label: "搜索", icon: Search }
];

const PERSONAL_NAV = [
  { id: "library" as const, label: "我的片库", icon: Library },
  { id: "bookmarks" as const, label: "时间书签", icon: Bookmark },
  { id: "history" as const, label: "观看足迹", icon: History }
];

const OFFLINE_NAV = [
  { id: "downloads" as const, label: "离线下载", icon: Download },
  { id: "storage" as const, label: "存储管家", icon: HardDrive }
];

const MOBILE_NAVIGATION = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2], PERSONAL_NAV[0], OFFLINE_NAV[0]];

const ROUTE_META: Record<CinemaRoute["name"], { title: string; eyebrow: string }> = {
  home: { title: "今晚想看点什么？", eyebrow: "糖果星光剧院" },
  discover: { title: "发现好片", eyebrow: "探索片场" },
  search: { title: "搜索影片", eyebrow: "全站检索" },
  library: { title: "我的片库", eyebrow: "私人放映单" },
  bookmarks: { title: "时间书签", eyebrow: "精彩片段" },
  history: { title: "观看足迹", eyebrow: "观影回忆" },
  downloads: { title: "离线下载", eyebrow: "下载工作台" },
  storage: { title: "存储管家", eyebrow: "空间中心" },
  detail: { title: "影片详情", eyebrow: "影片档案" },
  playback: { title: "正在放映", eyebrow: "沉浸放映室" }
};

function toastClass(level?: string) {
  if (level === "error") return "is-error";
  if (level === "ok") return "is-ok";
  return "is-info";
}

export function CinemaAppShell({
  panelRef,
  route,
  canGoBack,
  libraryCount,
  bookmarkCount,
  historyCount,
  downloadCount,
  activeDownloadCount,
  catalogCount,
  storageIssueCount,
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
  const playback = route.name === "playback";
  const detailRoute = route.name === "detail";
  const routeScrollKey = "movieId" in route ? `${route.name}:${route.movieId}` : route.name;
  const routeMeta = ROUTE_META[route.name];
  const ToastIcon = toast?.level === "ok" ? CheckCircle2 : LoaderCircle;

  useLayoutEffect(() => {
    // 路由共用同一个可滚动 main；若保留详情页滚动量，移动播放舞台会从视口上方开始，
    // 使固定在播放器内的菜单也被整体带出屏幕。切页时同步归零可避免这种跨路由污染。
    const main = panelRef.current?.querySelector<HTMLElement>(".txzz-cinema58-main");
    if (!main) return;
    main.scrollTop = 0;
    main.scrollLeft = 0;
  }, [panelRef, routeScrollKey]);

  const badgeFor = (routeId: CinemaPrimaryRoute) => {
    if (routeId === "library") return libraryCount;
    if (routeId === "bookmarks") return bookmarkCount;
    if (routeId === "history") return historyCount;
    if (routeId === "downloads") return activeDownloadCount || downloadCount;
    if (routeId === "storage") return storageIssueCount;
    return 0;
  };

  const renderNavGroup = (
    label: string,
    items: Array<{ id: CinemaPrimaryRoute; label: string; icon: typeof Home }>
  ) => (
    <div className="txzz-cinema58-nav-group">
      <span>{label}</span>
      {items.map((item) => {
        const active = route.name === item.id;
        const badge = badgeFor(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? "page" : undefined}
            className={active ? "is-active" : ""}
            title={item.label}
          >
            <i><item.icon size={18} strokeWidth={active ? 2.4 : 1.8} /></i>
            <strong>{item.label}</strong>
            {badge > 0 && <em>{badge > 99 ? "99+" : badge}</em>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`txzz-stream-overlay txzz-cinema58-overlay fixed inset-0 z-50 text-white ${standalone ? "is-standalone" : ""}`}>
      <div
        ref={panelRef}
        data-txzz-cinema-app="true"
        data-cinema-route={route.name}
        data-cinema-standalone={standalone ? "true" : "false"}
        role={standalone ? "application" : "dialog"}
        aria-modal={standalone ? undefined : "true"}
        aria-labelledby="txzz-stream-page-title"
        tabIndex={-1}
        className={`txzz-stream-shell txzz-cinema58-shell ${playback ? "is-playback" : ""}`}
      >
        {!playback && (
          <aside className="txzz-cinema58-sidebar">
            <button type="button" onClick={() => onNavigate("home")} className="txzz-cinema58-brand" aria-label="返回糖心影院首页">
              <span aria-hidden="true"><Clapperboard size={23} /></span>
              <strong>糖心影院<small>CANDY CINEMA</small></strong>
            </button>
            <nav aria-label="糖心影院主导航">
              {renderNavGroup("正在热映", PRIMARY_NAV)}
              {renderNavGroup("我的影院", PERSONAL_NAV)}
              {renderNavGroup("离线中心", OFFLINE_NAV)}
            </nav>
            <div className="txzz-cinema58-sidebar-foot">
              <button type="button" onClick={onExitWorkspace}><ExternalLink size={16} /><span>返回视频站</span></button>
              <small>{catalogCount} 部片单 · {APP_VERSION_LABEL}</small>
            </div>
          </aside>
        )}

        {!playback && (
          <header className="txzz-cinema58-topbar">
            <div className="txzz-cinema58-route-title">
              {canGoBack && <button type="button" onClick={onBack} aria-label="返回上一页"><ArrowLeft size={19} /></button>}
              <div><span>{routeMeta.eyebrow}</span><h1 id="txzz-stream-page-title">{routeMeta.title}</h1></div>
            </div>
            <div className="txzz-cinema58-top-actions">
              {resolving && <span className="txzz-cinema58-live-state"><LoaderCircle size={14} className="animate-spin" />正在准备影片</span>}
              {activeDownloadCount > 0 && (
                <button type="button" onClick={() => onNavigate("downloads")} className="is-download" aria-label={`${activeDownloadCount} 个下载任务进行中`}>
                  <Download size={17} /><span>{activeDownloadCount}</span>
                </button>
              )}
              <button type="button" onClick={() => onNavigate("search")} className="txzz-cinema58-search-shortcut" aria-label="搜索影片">
                <Search size={17} /><span>搜索影片</span><kbd>/</kbd>
              </button>
              <button type="button" onClick={onExitWorkspace} aria-label="打开视频站"><ExternalLink size={18} /></button>
              <button type="button" onClick={onClose} aria-label="关闭糖心影院"><X size={19} /></button>
            </div>
          </header>
        )}

        {playback && (
          <header className="txzz-stream-player-bar txzz-cinema58-player-bar">
            <button type="button" onClick={onBack} aria-label="返回影片详情"><ArrowLeft size={20} /></button>
            <div><span><Sparkles size={12} />{routeMeta.eyebrow}</span><h1 id="txzz-stream-page-title">{routeMeta.title}</h1></div>
            <small>{APP_VERSION_LABEL}</small>
          </header>
        )}

        <main className="txzz-stream-main txzz-cinema58-main">
          {!playback && detailRoute && <span className="sr-only">{routeMeta.title}</span>}
          {!playback && !detailRoute && <h2 className="sr-only">{routeMeta.title}</h2>}
          {children}
        </main>

        {!playback && (
          <nav className="txzz-cinema58-mobile-nav" aria-label="糖心影院移动端导航">
            {MOBILE_NAVIGATION.map((item) => {
              const active = route.name === item.id
                || (item.id === "library" && ["bookmarks", "history"].includes(route.name))
                || (item.id === "downloads" && route.name === "storage");
              const badge = badgeFor(item.id);
              return (
                <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}>
                  <span><item.icon size={19} />{badge > 0 && <em>{badge > 9 ? "9+" : badge}</em>}</span><small>{item.label.replace("我的", "").replace("离线", "")}</small>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {toast && (
        <div className={`txzz-stream-toast txzz-cinema58-toast ${toastClass(toast.level)}`} role={toast.level === "error" ? "alert" : "status"} aria-live={toast.level === "error" ? "assertive" : "polite"}>
          <ToastIcon size={17} className={toast.level === "running" ? "animate-spin" : ""} />
          <span>{toast.text}</span>
          <button type="button" onClick={onDismissToast} aria-label="关闭提示"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
