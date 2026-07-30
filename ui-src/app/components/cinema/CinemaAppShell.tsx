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

const NAVIGATION = [
  { id: "home" as const, label: "首页", icon: Home },
  { id: "discover" as const, label: "发现", icon: Compass },
  { id: "search" as const, label: "搜索", icon: Search },
  { id: "library" as const, label: "片库", icon: Library },
  { id: "bookmarks" as const, label: "书签", icon: Bookmark },
  { id: "history" as const, label: "足迹", icon: History },
  { id: "downloads" as const, label: "下载", icon: Download },
  { id: "storage" as const, label: "存储", icon: HardDrive }
];

const MOBILE_NAVIGATION = NAVIGATION.filter((item) => ["home", "discover", "search", "library", "downloads"].includes(item.id));

const ROUTE_TITLES: Record<CinemaRoute["name"], string> = {
  home: "首页",
  discover: "发现",
  search: "搜索",
  library: "我的片库",
  bookmarks: "时间书签",
  history: "观看足迹",
  downloads: "离线下载",
  storage: "存储管家",
  detail: "影片详情",
  playback: "正在放映"
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
  const ToastIcon = toast?.level === "ok" ? CheckCircle2 : LoaderCircle;

  const badgeFor = (routeId: CinemaPrimaryRoute) => {
    if (routeId === "library") return libraryCount;
    if (routeId === "bookmarks") return bookmarkCount;
    if (routeId === "history") return historyCount;
    if (routeId === "downloads") return activeDownloadCount || downloadCount;
    if (routeId === "storage") return storageIssueCount;
    return 0;
  };

  return (
    <div className={`txzz-stream-overlay fixed inset-0 z-50 text-white ${standalone ? "is-standalone" : ""}`}>
      <div
        ref={panelRef}
        data-txzz-cinema-app="true"
        data-cinema-route={route.name}
        data-cinema-standalone={standalone ? "true" : "false"}
        role={standalone ? "application" : "dialog"}
        aria-modal={standalone ? undefined : "true"}
        aria-labelledby="txzz-stream-page-title"
        tabIndex={-1}
        className={`txzz-stream-shell ${playback ? "is-playback" : ""}`}
      >
        {!playback && (
          <header className="txzz-stream-topbar">
            <button type="button" onClick={() => onNavigate("home")} className="txzz-stream-brand" aria-label="返回糖心影院首页">
              <span className="txzz-stream-brand-icon" aria-hidden="true"><Clapperboard size={20} /></span>
              <span className="txzz-stream-brand-copy"><strong>糖心影院</strong><small>CANDY CINEMA</small></span>
            </button>

            <nav className="txzz-stream-desktop-nav" aria-label="糖心影院主导航">
              {NAVIGATION.map((item) => {
                const active = route.name === item.id;
                const badge = badgeFor(item.id);
                return (
                  <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined} className={`txzz-stream-nav-link ${active ? "is-active" : ""}`}>
                    <item.icon size={15} /><span>{item.label}</span>
                    {badge > 0 && <em>{badge > 99 ? "99+" : badge}</em>}
                  </button>
                );
              })}
            </nav>

            <div className="txzz-stream-topbar-actions">
              {resolving && <span className="txzz-stream-live-state"><LoaderCircle size={13} className="animate-spin" />正在检票</span>}
              {activeDownloadCount > 0 && <button type="button" onClick={() => onNavigate("downloads")} className="txzz-stream-icon-button is-download" aria-label={`${activeDownloadCount} 个下载任务进行中`}><Download size={17} /><span>{activeDownloadCount}</span></button>}
              <button type="button" onClick={() => onNavigate("search")} className="txzz-stream-icon-button" aria-label="搜索影片"><Search size={18} /></button>
              <button type="button" onClick={onExitWorkspace} className="txzz-stream-icon-button is-desktop-only" aria-label="打开视频站"><ExternalLink size={17} /></button>
              <button type="button" onClick={onClose} className="txzz-stream-icon-button" aria-label="关闭糖心影院"><X size={18} /></button>
            </div>
          </header>
        )}

        {playback && (
          <header className="txzz-stream-player-bar">
            <button type="button" onClick={onBack} className="txzz-stream-icon-button" aria-label="返回上一页"><ArrowLeft size={20} /></button>
            <div><small>糖心影院</small><h1 id="txzz-stream-page-title">{ROUTE_TITLES[route.name]}</h1></div>
            <span className="txzz-stream-player-version">{APP_VERSION_LABEL}</span>
          </header>
        )}

        <main className="txzz-stream-main">
          {!playback && canGoBack && (
            <div className="txzz-stream-context-bar">
              <button type="button" onClick={onBack}><ArrowLeft size={16} />返回</button>
              <span id="txzz-stream-page-title">{ROUTE_TITLES[route.name]}</span>
            </div>
          )}
          {!playback && !canGoBack && <h1 id="txzz-stream-page-title" className="sr-only">{ROUTE_TITLES[route.name]}</h1>}
          {children}
        </main>

        {!playback && (
          <nav className="txzz-stream-mobile-nav" aria-label="糖心影院移动端导航">
            {MOBILE_NAVIGATION.map((item) => {
              const active = route.name === item.id
                || (item.id === "library" && ["bookmarks", "history"].includes(route.name))
                || (item.id === "downloads" && route.name === "storage");
              const badge = badgeFor(item.id);
              return (
                <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}>
                  <span><item.icon size={18} />{badge > 0 && <em>{badge > 9 ? "9+" : badge}</em>}</span><small>{item.label}</small>
                </button>
              );
            })}
          </nav>
        )}

        {!playback && <span className="txzz-stream-build-stamp" aria-hidden="true">{catalogCount} 部目录影片 · {APP_VERSION_LABEL}</span>}
      </div>

      {toast && (
        <div className={`txzz-stream-toast ${toastClass(toast.level)}`} role={toast.level === "error" ? "alert" : "status"} aria-live={toast.level === "error" ? "assertive" : "polite"}>
          <ToastIcon size={16} className={toast.level === "running" ? "animate-spin" : ""} />
          <span>{toast.text}</span>
          <button type="button" onClick={onDismissToast} aria-label="关闭提示"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
