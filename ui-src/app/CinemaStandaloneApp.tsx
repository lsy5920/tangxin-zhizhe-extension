import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { CinemaPage } from "./components/CinemaPage";
import { DownloadPlannerModal } from "./components/download/DownloadPlannerModal";
import { useDocumentScrollLock } from "./components/ui/primitives";
import { isCinemaPrimaryRoute } from "./cinema/appModel";
import { useCinemaController } from "./cinema/useCinemaController";

const CINEMA_PREFERENCES_KEY = "txzzCinemaPagePreferencesV1";
const TARGET_SITE_URL = "https://txh068.com/";

function routeTitle(name: string) {
  if (name === "home") return "";
  if (name === "discover") return "发现";
  if (name === "search") return "搜索";
  if (name === "library") return "片库";
  if (name === "bookmarks") return "书签";
  if (name === "history") return "足迹";
  if (name === "downloads") return "下载";
  if (name === "storage") return "存储";
  if (name === "detail") return "影片详情";
  return "沉浸放映";
}

export default function CinemaStandaloneApp() {
  const panelRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  const controller = useCinemaController();
  useDocumentScrollLock(true);

  useEffect(() => {
    const label = routeTitle(controller.activeRoute.name);
    document.title = label ? `糖心影院 · ${label}` : "糖心影院";
    if (!isCinemaPrimaryRoute(controller.activeRoute.name)) return;
    void chrome.storage.local.set({
      [CINEMA_PREFERENCES_KEY]: {
        route: controller.activeRoute.name,
        updatedAt: new Date().toISOString()
      }
    });
  }, [controller.activeRoute]);

  const openTargetSite = useCallback(() => {
    void chrome.tabs.create({ url: TARGET_SITE_URL, active: true })
      .catch((error) => controller.showToast(error?.message || String(error), "error"));
  }, [controller]);

  const closeCinema = useCallback(() => {
    void chrome.tabs.getCurrent().then((tab) => {
      const tabId = Number(tab?.id);
      if (Number.isInteger(tabId)) return chrome.tabs.remove(tabId);
      window.close();
    }).catch(() => window.close());
  }, []);

  if (!controller.state.cinemaCatalog) {
    return (
      <div className="txzz-cinema-standalone-fatal flex size-full items-center justify-center bg-[#100a17] p-5 text-white">
        <div className="max-w-md border border-rose-200/15 bg-white/5 p-6 text-center shadow-2xl">
          <AlertTriangle className="mx-auto text-rose-300" size={34} />
          <h1 className="mt-4 text-lg font-black">影院资料没有成功载入</h1>
          <button type="button" onClick={() => void controller.refreshState(false)} className="mt-5 inline-flex min-h-11 items-center gap-2 bg-white px-4 text-xs font-black text-[#24152d]"><RefreshCw size={14} />重新连接</button>
        </div>
      </div>
    );
  }

  return (
    <div className="txzz-cinema-standalone-root size-full" data-txzz-cinema-standalone="true">
      <CinemaPage
        panelRef={panelRef}
        state={controller.state}
        initialRoute={controller.initialRoute}
        toast={controller.toast}
        onAction={controller.onAction}
        onRouteChange={controller.setActiveRoute}
        onExitWorkspace={openTargetSite}
        onClose={closeCinema}
        onDismissToast={() => controller.setToast(null)}
        standalone
      />
      <DownloadPlannerModal planner={controller.state.downloadPlanner} onAction={controller.onAction} />
      {controller.state.cinemaCatalog.phase === "loading" && !(controller.state.cinemaCatalog.items?.length || controller.state.cinemaCatalog.sections?.length) && (
        <span className="sr-only" role="status"><LoaderCircle className="animate-spin" />正在同步影院片单</span>
      )}
    </div>
  );
}
