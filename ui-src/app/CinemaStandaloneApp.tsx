import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { CinemaPage } from "./components/CinemaPage";
import { DownloadPlannerModal } from "./components/download/DownloadPlannerModal";
import { useDocumentScrollLock } from "./components/ui/primitives";
import type { CinemaCatalogState, CinemaCollectionState } from "./cinema/types";
import { isCinemaPrimaryRoute, type CinemaRoute } from "./cinema/appModel";
import {
  buildDownloadReport,
  cinemaCatalogIntentKey,
  cinemaRouteEntryFromHash,
  mergeStandaloneBridgeState,
  selectDownloadTasksByIds,
  STANDALONE_RUNTIME_ACTIONS
} from "./cinema/standaloneBridgeCore";
import type { BridgeState, DownloadTask } from "./types";

type Toast = { text: string; level: string } | null;
type RuntimeResponse = { ok?: boolean; error?: string; state?: BridgeState; [key: string]: unknown };

const CINEMA_PREFERENCES_KEY = "txzzCinemaPagePreferencesV1";
const TARGET_SITE_URL = "https://txh068.com/";
const EMPTY_CATALOG: CinemaCatalogState = {
  mode: "discover",
  phase: "idle",
  query: "",
  filters: {},
  sections: [],
  items: [],
  page: 0,
  pageSize: 24,
  hasMore: false,
  fetchedAt: "",
  error: ""
};

async function sendRuntime(type: string, payload: Record<string, unknown> = {}, timeoutMs = 120_000) {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`后台操作超时：${type}`)), timeoutMs);
  });
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type, ...payload }) as Promise<RuntimeResponse>,
      timeout
    ]);
    if (!response?.ok) {
      const error = new Error(response?.error || `后台操作失败：${type}`) as Error & { response?: RuntimeResponse };
      error.response = response;
      throw error;
    }
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}

async function copyText(text: string) {
  const value = String(text || "");
  if (!value) throw new Error("当前没有可复制的内容");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("浏览器没有完成复制操作");
}

function safePlaybackDiagnostic(state: BridgeState) {
  const session = state.screening?.activeSession;
  if (!session) return "当前没有播放会话";
  return JSON.stringify({
    movieId: session.movieId,
    title: session.title,
    phase: session.phase,
    decision: session.decision,
    sources: (session.sources || []).map((source) => ({
      id: source.id,
      label: source.label,
      role: source.role,
      protocol: source.protocol,
      health: source.health,
      media: source.media
    })),
    acquisition: session.acquisition,
    fetchedAt: session.fetchedAt,
    expiresAt: session.expiresAt
  }, null, 2);
}

function taskUrlLines(tasks: DownloadTask[]) {
  return [...new Set(tasks.map((task) => String(task.url || "").trim()).filter(Boolean))].join("\n");
}

export default function CinemaStandaloneApp() {
  const panelRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  const [state, setState] = useState<BridgeState>({ expanded: true, cinemaCatalog: EMPTY_CATALOG });
  const stateRef = useRef(state);
  const [toast, setToast] = useState<Toast>({ text: "正在恢复影院资料与下载队列", level: "running" });
  const toastTimer = useRef(0);
  const catalogRequestId = useRef("");
  const collectionRequestId = useRef("");
  const playbackRequestId = useRef("");
  const refreshTimer = useRef(0);
  const downloadLocks = useRef(new Set<string>());
  const initialRoute = useRef<CinemaRoute>(cinemaRouteEntryFromHash(location.hash));
  const [activeRoute, setActiveRoute] = useState<CinemaRoute>(initialRoute.current);
  stateRef.current = state;
  useDocumentScrollLock(true);

  const showToast = useCallback((text: string, level = "info", duration = level === "error" ? 5600 : 3400) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, level });
    if (duration > 0) toastTimer.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  const mergeState = useCallback((incoming?: BridgeState | null) => {
    if (!incoming) return;
    setState((current) => mergeStandaloneBridgeState(current, incoming));
  }, []);

  const refreshState = useCallback(async (quiet = true) => {
    try {
      const response = await sendRuntime("getStateLocal", {}, 30_000);
      mergeState(response.state as BridgeState | undefined);
      if (!quiet) showToast("影院资料、下载队列与片库已同步", "ok");
      return response;
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : String(error), "error");
      throw error;
    }
  }, [mergeState, showToast]);

  useEffect(() => {
    let active = true;
    void refreshState(true).then(() => {
      if (active) setToast(null);
    }).catch((error) => {
      if (active) showToast(error instanceof Error ? error.message : String(error), "error", 0);
    });

    // 云端账号同步不阻塞影院首屏；完成后只合并脱敏公开状态。
    void sendRuntime("getState", {}, 60_000).then((response) => {
      if (active) mergeState(response.state as BridgeState | undefined);
    }).catch(() => undefined);

    const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || (!changes.txzzState && !changes.txzzExperienceV1)) return;
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refreshState(true), 140);
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refreshState(true);
    };
    chrome.storage.onChanged.addListener(storageChanged);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(toastTimer.current);
      chrome.storage.onChanged.removeListener(storageChanged);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [mergeState, refreshState, showToast]);

  useEffect(() => {
    const label = activeRoute.name === "home" ? ""
      : activeRoute.name === "discover" ? "发现"
        : activeRoute.name === "search" ? "搜索"
          : activeRoute.name === "library" ? "片库"
            : activeRoute.name === "history" ? "足迹"
              : activeRoute.name === "downloads" ? "下载"
                : activeRoute.name === "detail" ? "影片详情"
                  : "沉浸放映";
    document.title = label ? `糖心影院 · ${label}` : "糖心影院";
    if (!isCinemaPrimaryRoute(activeRoute.name)) return;
    void chrome.storage.local.set({ [CINEMA_PREFERENCES_KEY]: { route: activeRoute.name, updatedAt: new Date().toISOString() } });
  }, [activeRoute]);

  const executeAction = useCallback(async (action: string, payload: Record<string, unknown>) => {
    if (action === "load-cinema-catalog" || action === "load-more-cinema-catalog") {
      const append = action === "load-more-cinema-catalog";
      const current = stateRef.current.cinemaCatalog || EMPTY_CATALOG;
      const nextMode = (payload.mode as CinemaCatalogState["mode"]) || current.mode || "discover";
      const nextQuery = String(payload.query ?? current.query ?? "");
      const nextFilters = (payload.filters as CinemaCatalogState["filters"]) || current.filters || {};
      const preserveContent = append || (
        payload.forceRefresh === true
        && cinemaCatalogIntentKey(current) === cinemaCatalogIntentKey({ mode: nextMode, query: nextQuery, filters: nextFilters })
      );
      const requestId = crypto.randomUUID();
      catalogRequestId.current = requestId;
      setState((previous) => ({
        ...previous,
        cinemaCatalog: {
          ...current,
          mode: nextMode,
          phase: append ? "loading-more" : "loading",
          requestId,
          query: nextQuery,
          filters: nextFilters,
          sections: preserveContent ? current.sections : [],
          items: preserveContent ? current.items : [],
          hasMore: preserveContent ? current.hasMore : false,
          error: ""
        }
      }));
      const response = await sendRuntime("fetchCinemaCatalog", {
        ...payload,
        requestId,
        append,
        page: append ? Math.max(1, Number(current.page || 0) + 1) : 1,
        pageSize: Number(payload.pageSize || current.pageSize || 24)
      });
      if (catalogRequestId.current !== requestId) return;
      mergeState(response.state as BridgeState | undefined);
      if (!response.stale && payload.forceRefresh === true) showToast("片单已刷新", "ok");
      return;
    }

    if (action === "load-cinema-collection") {
      const movieId = String(payload.movieId || "").trim();
      if (!movieId) throw new Error("合集请求缺少影片编号");
      const requestId = crypto.randomUUID();
      collectionRequestId.current = requestId;
      const previous = stateRef.current.cinemaCollection;
      setState((current) => ({
        ...current,
        cinemaCollection: {
          ...(previous || { items: [] }),
          phase: "loading",
          requestId,
          parentMovieId: movieId,
          title: String(payload.movieTitle || previous?.title || "合集"),
          error: ""
        } as CinemaCollectionState
      }));
      try {
        const response = await sendRuntime("fetchCinemaCollection", { ...payload, requestId }, 60_000);
        if (collectionRequestId.current !== requestId) return;
        setState((current) => ({ ...current, cinemaCollection: response.collection as CinemaCollectionState }));
      } catch (error) {
        if (collectionRequestId.current === requestId) {
          setState((current) => ({
            ...current,
            cinemaCollection: {
              ...(current.cinemaCollection || { items: [] }),
              phase: "error",
              requestId,
              parentMovieId: movieId,
              error: error instanceof Error ? error.message : String(error)
            } as CinemaCollectionState
          }));
        }
        throw error;
      }
      return;
    }

    if (["open-cinema-playback", "refresh-playback-session", "open-library-playback"].includes(action)) {
      const movieId = String(payload.movieId || stateRef.current.screening?.activeSession?.movieId || "").trim();
      if (!movieId) throw new Error("请选择要开映的影片");
      const requestId = crypto.randomUUID();
      playbackRequestId.current = requestId;
      setState((current) => ({
        ...current,
        screening: {
          ...(current.screening || { schemaVersion: 2, activeSession: null, history: [] }),
          request: {
            phase: "resolving",
            requestId,
            movieId,
            movieTitle: String(payload.movieTitle || ""),
            startedAt: new Date().toISOString(),
            error: ""
          }
        }
      }));
      showToast(`正在为“${String(payload.movieTitle || `影片 ${movieId}`)}”检票`, "running", 0);
      const response = await sendRuntime("openCinemaPlayback", {
        ...payload,
        movieId,
        requestId,
        accountId: stateRef.current.selectedFullAccountId || ""
      });
      if (playbackRequestId.current !== requestId || response.stale) return;
      mergeState(response.state as BridgeState | undefined);
      showToast("完整线路已就绪，点击播放器开始放映", "ok");
      return;
    }

    if (action === "plan-full-video-download") {
      const movieId = String(payload.movieId || stateRef.current.screening?.activeSession?.movieId || "").trim();
      if (!movieId) throw new Error("请选择要下载的影片");
      const movieTitle = String(payload.movieTitle || `影片 ${movieId}`);
      setState((current) => ({ ...current, downloadPlanner: { open: true, phase: "probing", movieId, movieTitle } }));
      showToast("正在探测线路、清晰度与可用空间", "running", 0);
      try {
        const response = await sendRuntime("planFullVideoDownload", {
          ...payload,
          movieId,
          movieTitle,
          accountId: stateRef.current.selectedFullAccountId || "",
          viewportHeight: Math.max(innerHeight || 0, innerWidth || 0, 720)
        });
        setState((current) => ({ ...current, downloadPlanner: { ...response, open: true, phase: "ready" } }));
        mergeState(response.state as BridgeState | undefined);
        showToast("下载规划完成，请确认线路、画质与保存空间", "ok");
      } catch (error) {
        setState((current) => ({
          ...current,
          downloadPlanner: {
            open: true,
            phase: "error",
            movieId,
            movieTitle,
            error: error instanceof Error ? error.message : String(error)
          }
        }));
        throw error;
      }
      return;
    }

    if (action === "close-download-planner") {
      setState((current) => ({ ...current, downloadPlanner: null }));
      return;
    }

    if (action === "start-planned-download" || action === "download-full-video") {
      const movieId = String(payload.movieId || "").trim();
      if (!movieId) throw new Error("下载任务缺少影片编号");
      if (downloadLocks.current.has(movieId)) {
        showToast("这个影片的下载任务正在创建，请稍候", "info");
        return;
      }
      downloadLocks.current.add(movieId);
      if (action === "start-planned-download") setState((current) => ({ ...current, downloadPlanner: null }));
      showToast("正在创建可恢复下载任务", "running", 0);
      try {
        const response = await sendRuntime("downloadFullVideo", {
          ...payload,
          accountId: stateRef.current.selectedFullAccountId || "",
          viewportHeight: Math.max(innerHeight || 0, innerWidth || 0, 720)
        });
        mergeState(response.state as BridgeState | undefined);
        showToast(`下载任务已加入队列：${String(response.filename || movieId)}`, "ok");
      } finally {
        window.setTimeout(() => downloadLocks.current.delete(movieId), 900);
      }
      return;
    }

    if (["copy-play-link", "copy-backup-link"].includes(action)) {
      await copyText(String(payload.url || ""));
      showToast("完整线路已复制", "ok");
      return;
    }

    if (action === "open-playback-url") {
      const url = String(payload.url || "").trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("播放地址格式无效");
      await chrome.tabs.create({ url, active: true });
      return;
    }

    if (action === "copy-playback-health-report") {
      await copyText(safePlaybackDiagnostic(stateRef.current));
      showToast("脱敏播放诊断已复制", "ok");
      return;
    }

    if (action === "refresh-downloads") {
      await refreshState(false);
      return;
    }

    if (action === "save-downloads") {
      const response = await sendRuntime("saveDownloadSnapshot");
      mergeState(response.state as BridgeState | undefined);
      showToast("下载任务快照已保存", "ok");
      return;
    }

    if (action === "save-ready-downloads") {
      const ids = Array.isArray(payload.taskIds) ? payload.taskIds.map(String).filter(Boolean) : [];
      let completed = 0;
      for (const taskId of ids) {
        const response = await sendRuntime("saveDownloadToDevice", { taskId });
        mergeState(response.state as BridgeState | undefined);
        completed += 1;
      }
      showToast(`已处理 ${completed} 个可保存任务`, "ok");
      return;
    }

    if (["copy-download-url", "copy-filtered-download-urls", "copy-filtered-download-report", "copy-failed-download-summary"].includes(action)) {
      const tasks = selectDownloadTasksByIds(stateRef.current, action === "copy-download-url" ? [payload.taskId] : payload.taskIds);
      const text = action === "copy-download-url" || action === "copy-filtered-download-urls"
        ? taskUrlLines(tasks)
        : buildDownloadReport(tasks, String(payload.filterLabel || "当前筛选"), action === "copy-failed-download-summary");
      await copyText(text);
      showToast(action.includes("report") || action.includes("summary") ? "下载报告已复制" : "下载链接已复制", "ok");
      return;
    }

    const runtimeType = STANDALONE_RUNTIME_ACTIONS[action];
    if (runtimeType) {
      const response = await sendRuntime(runtimeType, {
        ...payload,
        ...(action === "run-storage-audit" ? { allowAutoCleanup: false } : {})
      });
      mergeState(response.state as BridgeState | undefined);
      const successText = action === "update-library-entry" ? "片库已更新"
        : action.includes("bookmark") ? "时间书签已更新"
          : action.includes("storage") ? "存储管家操作完成"
            : action.includes("download") || action.includes("queue") ? "下载队列已更新"
              : "操作已完成";
      showToast(successText, "ok");
      return;
    }

    throw new Error(`影院独立页尚未接入操作：${action}`);
  }, [mergeState, refreshState, showToast]);

  const onAction = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    void executeAction(action, payload).catch((error: Error & { response?: RuntimeResponse }) => {
      mergeState(error.response?.state);
      showToast(error.message || String(error), "error");
    });
  }, [executeAction, mergeState, showToast]);

  const openTargetSite = useCallback(() => {
    void chrome.tabs.create({ url: TARGET_SITE_URL, active: true }).catch((error) => showToast(error?.message || String(error), "error"));
  }, [showToast]);

  const closeCinema = useCallback(() => {
    void chrome.tabs.getCurrent().then((tab) => {
      const tabId = Number(tab?.id);
      if (Number.isInteger(tabId)) return chrome.tabs.remove(tabId);
      window.close();
    }).catch(() => window.close());
  }, []);

  if (!state.cinemaCatalog) {
    return (
      <div className="txzz-cinema-standalone-fatal flex size-full items-center justify-center bg-[#100a17] p-5 text-white">
        <div className="max-w-md rounded-[2rem] border border-rose-200/15 bg-white/5 p-6 text-center shadow-2xl">
          <AlertTriangle className="mx-auto text-rose-300" size={34} />
          <h1 className="mt-4 text-lg font-black">影院资料没有成功载入</h1>
          <button type="button" onClick={() => void refreshState(false)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-[#24152d]"><RefreshCw size={14} />重新连接</button>
        </div>
      </div>
    );
  }

  return (
    <div className="txzz-cinema-standalone-root size-full" data-txzz-cinema-standalone="true">
      <CinemaPage
        panelRef={panelRef}
        state={state}
        initialRoute={initialRoute.current}
        toast={toast}
        onAction={onAction}
        onRouteChange={setActiveRoute}
        onExitWorkspace={openTargetSite}
        onClose={closeCinema}
        onDismissToast={() => setToast(null)}
        standalone
      />
      <DownloadPlannerModal planner={state.downloadPlanner} onAction={onAction} />
      {state.cinemaCatalog.phase === "loading" && !(state.cinemaCatalog.items?.length || state.cinemaCatalog.sections?.length) && (
        <span className="sr-only" role="status"><LoaderCircle className="animate-spin" />正在同步影院片单</span>
      )}
    </div>
  );
}
