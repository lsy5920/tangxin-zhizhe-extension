import { useCallback, useEffect, useRef, useState } from "react";
import type { CinemaCatalogState, CinemaCollectionState } from "./types";
import { cinemaRouteEntryFromHash, buildDownloadReport, cinemaCatalogIntentKey, mergeStandaloneBridgeState, selectDownloadTasksByIds, STANDALONE_RUNTIME_ACTIONS } from "./standaloneBridgeCore";
import { CinemaRequestRegistry } from "./requestRegistry";
import { copyCinemaText, sendCinemaRuntime, type CinemaRuntimeError } from "./runtimeClient";
import type { BridgeState, DownloadTask, DownloadPlannerState } from "../types";
import type { CinemaRoute } from "./appModel";

export type CinemaToast = { text: string; level: string } | null;

export const EMPTY_CINEMA_CATALOG: CinemaCatalogState = {
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

function successMessage(action: string) {
  if (action === "update-library-entry") return "片库已更新";
  if (action.includes("bookmark")) return "时间书签已更新";
  if (action.includes("storage")) return "存储管家操作完成";
  if (action.includes("download") || action.includes("queue")) return "下载队列已更新";
  return "操作已完成";
}

function plannerFromResponse(response: Record<string, unknown>, fallback: DownloadPlannerState): DownloadPlannerState {
  const { ok: _ok, state: _state, ...planner } = response;
  return { ...fallback, ...planner, open: true, phase: "ready" } as DownloadPlannerState;
}

export function useCinemaController() {
  const [state, setState] = useState<BridgeState>({ expanded: true, cinemaCatalog: EMPTY_CINEMA_CATALOG });
  const stateRef = useRef(state);
  const [toast, setToast] = useState<CinemaToast>({ text: "正在恢复影院资料与下载队列", level: "running" });
  const toastTimer = useRef(0);
  const refreshTimer = useRef(0);
  const requests = useRef(new CinemaRequestRegistry());
  const downloadLocks = useRef(new Set<string>());
  const initialRoute = useRef<CinemaRoute>(cinemaRouteEntryFromHash(location.hash));
  const [activeRoute, setActiveRoute] = useState<CinemaRoute>(initialRoute.current);
  stateRef.current = state;

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
    const token = requests.current.begin("state", "local");
    try {
      const response = await sendCinemaRuntime("getStateLocal", {}, 30_000);
      if (requests.current.isCurrent(token)) mergeState(response.state);
      if (!quiet) showToast("影院资料、下载队列与片库已同步", "ok");
      return response;
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : String(error), "error");
      throw error;
    } finally {
      requests.current.finish(token);
    }
  }, [mergeState, showToast]);

  useEffect(() => {
    let active = true;
    void refreshState(true).then(async (localResponse) => {
      if (!active) return;
      setToast(null);
      const mode = String(localResponse.state?.remote?.accountSourceMode || "local");
      if (mode === "local") return;
      // 先显示本地快照，再顺序同步云端账号，避免首屏被远程网络阻塞或并行重复拉取状态。
      const remoteToken = requests.current.begin("state", "remote");
      try {
        const remoteResponse = await sendCinemaRuntime("getState", {}, 60_000);
        // 可见性恢复或存储变更会开启新的本地刷新；较慢的云端响应不能再覆盖更新后的本地快照。
        if (active && requests.current.isCurrent(remoteToken)) mergeState(remoteResponse.state);
      } finally {
        requests.current.finish(remoteToken);
      }
    }).catch((error) => {
      if (active) showToast(error instanceof Error ? error.message : String(error), "error", 0);
    });

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
    const pendingMovieId = requests.current.currentKey("playback");
    const routeMovieId = activeRoute.name === "playback" ? activeRoute.movieId : "";
    if (pendingMovieId && pendingMovieId !== routeMovieId) {
      // 用户返回或切换影片后立刻让旧检票代次失效；请求可以结束，但不能把会话写回新页面。
      requests.current.invalidate("playback");
    }
  }, [activeRoute]);

  const runCatalog = useCallback(async (action: string, payload: Record<string, unknown>) => {
    const append = action === "load-more-cinema-catalog";
    const current = stateRef.current.cinemaCatalog || EMPTY_CINEMA_CATALOG;
    const nextMode = (payload.mode as CinemaCatalogState["mode"]) || current.mode || "discover";
    const nextQuery = String(payload.query ?? current.query ?? "");
    const nextFilters = (payload.filters as CinemaCatalogState["filters"]) || current.filters || {};
    const intent = cinemaCatalogIntentKey({ mode: nextMode, query: nextQuery, filters: nextFilters });
    const token = requests.current.begin("catalog", intent);
    const preserveContent = append || (payload.forceRefresh === true && cinemaCatalogIntentKey(current) === intent);
    setState((previous) => ({
      ...previous,
      cinemaCatalog: {
        ...current,
        mode: nextMode,
        phase: append ? "loading-more" : "loading",
        requestId: token.id,
        query: nextQuery,
        filters: nextFilters,
        sections: preserveContent ? current.sections : [],
        items: preserveContent ? current.items : [],
        hasMore: preserveContent ? current.hasMore : false,
        error: ""
      }
    }));
    try {
      const response = await sendCinemaRuntime("fetchCinemaCatalog", {
        ...payload,
        requestId: token.id,
        append,
        page: append ? Math.max(1, Number(current.page || 0) + 1) : 1,
        pageSize: Number(payload.pageSize || current.pageSize || 24)
      });
      if (!requests.current.isCurrent(token)) return;
      mergeState(response.state);
      if (!response.stale && payload.forceRefresh === true) showToast("片单已刷新", "ok");
    } catch (error) {
      if (requests.current.isCurrent(token)) {
        setState((previous) => ({
          ...previous,
          cinemaCatalog: {
            ...(previous.cinemaCatalog || current),
            phase: "error",
            requestId: token.id,
            error: error instanceof Error ? error.message : String(error)
          }
        }));
      }
      throw error;
    } finally {
      requests.current.finish(token);
    }
  }, [mergeState, showToast]);

  const runCollection = useCallback(async (payload: Record<string, unknown>) => {
    const movieId = String(payload.movieId || "").trim();
    if (!movieId) throw new Error("合集请求缺少影片编号");
    const token = requests.current.begin("collection", movieId);
    const previous = stateRef.current.cinemaCollection;
    setState((current) => ({
      ...current,
      cinemaCollection: {
        ...(previous || { items: [] }),
        phase: "loading",
        requestId: token.id,
        parentMovieId: movieId,
        title: String(payload.movieTitle || previous?.title || "合集"),
        error: ""
      } as CinemaCollectionState
    }));
    try {
      const response = await sendCinemaRuntime("fetchCinemaCollection", { ...payload, requestId: token.id }, 60_000);
      if (!requests.current.isCurrent(token)) return;
      setState((current) => ({ ...current, cinemaCollection: response.collection as CinemaCollectionState }));
      mergeState(response.state);
    } catch (error) {
      if (requests.current.isCurrent(token)) {
        setState((current) => ({
          ...current,
          cinemaCollection: {
            ...(current.cinemaCollection || { items: [] }),
            phase: "error",
            requestId: token.id,
            parentMovieId: movieId,
            error: error instanceof Error ? error.message : String(error)
          } as CinemaCollectionState
        }));
      }
      throw error;
    } finally {
      requests.current.finish(token);
    }
  }, [mergeState]);

  const runPlayback = useCallback(async (payload: Record<string, unknown>) => {
    const movieId = String(payload.movieId || stateRef.current.screening?.activeSession?.movieId || "").trim();
    if (!movieId) throw new Error("请选择要开映的影片");
    const token = requests.current.begin("playback", movieId);
    const movieTitle = String(payload.movieTitle || `影片 ${movieId}`);
    setState((current) => ({
      ...current,
      screening: {
        ...(current.screening || { schemaVersion: 2, activeSession: null, history: [] }),
        request: {
          phase: "resolving",
          requestId: token.id,
          movieId,
          movieTitle,
          startedAt: new Date().toISOString(),
          error: ""
        }
      }
    }));
    showToast(`正在为“${movieTitle}”检票`, "running", 0);
    try {
      const response = await sendCinemaRuntime("openCinemaPlayback", {
        ...payload,
        movieId,
        requestId: token.id,
        accountId: stateRef.current.selectedFullAccountId || ""
      });
      if (!requests.current.isCurrent(token) || response.stale) return;
      mergeState(response.state);
      showToast("完整线路已就绪，点击播放器开始放映", "ok");
    } catch (error) {
      if (requests.current.isCurrent(token)) {
        setState((current) => ({
          ...current,
          screening: {
            ...(current.screening || { schemaVersion: 2, activeSession: null, history: [] }),
            request: {
              phase: "error",
              requestId: token.id,
              movieId,
              movieTitle,
              error: error instanceof Error ? error.message : String(error),
              startedAt: new Date().toISOString()
            }
          }
        }));
      }
      throw error;
    } finally {
      requests.current.finish(token);
    }
  }, [mergeState, showToast]);

  const runPlanner = useCallback(async (payload: Record<string, unknown>) => {
    const movieId = String(payload.movieId || stateRef.current.screening?.activeSession?.movieId || "").trim();
    if (!movieId) throw new Error("请选择要下载的影片");
    const movieTitle = String(payload.movieTitle || `影片 ${movieId}`);
    const token = requests.current.begin("planner", movieId);
    const fallback: DownloadPlannerState = {
      open: true,
      phase: "probing",
      movieId,
      movieTitle,
      lineKey: String(payload.sourceId || payload.lineKey || "auto"),
      networkMode: String(payload.networkMode || "balanced"),
      qualityHeight: Number(payload.qualityHeight || 0)
    };
    setState((current) => ({ ...current, downloadPlanner: fallback }));
    showToast("正在探测线路、清晰度与可用空间", "running", 0);
    try {
      const response = await sendCinemaRuntime("planFullVideoDownload", {
        ...payload,
        movieId,
        movieTitle,
        accountId: stateRef.current.selectedFullAccountId || "",
        viewportHeight: Math.max(innerHeight || 0, innerWidth || 0, 720)
      });
      if (!requests.current.isCurrent(token)) return;
      setState((current) => ({ ...current, downloadPlanner: plannerFromResponse(response, fallback) }));
      mergeState(response.state);
      showToast("下载规划完成，请确认线路、画质与保存空间", "ok");
    } catch (error) {
      if (requests.current.isCurrent(token)) {
        setState((current) => ({
          ...current,
          downloadPlanner: { ...fallback, phase: "error", error: error instanceof Error ? error.message : String(error) }
        }));
      }
      throw error;
    } finally {
      requests.current.finish(token);
    }
  }, [mergeState, showToast]);

  const runDownloadCreation = useCallback(async (action: string, payload: Record<string, unknown>) => {
    const movieId = String(payload.movieId || "").trim();
    if (!movieId) throw new Error("下载任务缺少影片编号");
    if (downloadLocks.current.has(movieId)) {
      showToast("这个影片的下载任务正在创建，请稍候", "info");
      return;
    }
    downloadLocks.current.add(movieId);
    const activePlanner = stateRef.current.downloadPlanner;
    if (action === "start-planned-download") {
      // 保留已经确认的方案直到后台原子写入成功；失败时用户仍能看到原因并重新规划，
      // 避免“一点加入队列弹窗立刻消失、任务却没有创建”的假成功体验。
      setState((current) => ({
        ...current,
        downloadPlanner: current.downloadPlanner ? { ...current.downloadPlanner, phase: "submitting", error: "" } : null
      }));
    }
    showToast("正在创建可恢复下载任务", "running", 0);
    try {
      const response = await sendCinemaRuntime("downloadFullVideo", {
        ...payload,
        accountId: stateRef.current.selectedFullAccountId || "",
        viewportHeight: Math.max(innerHeight || 0, innerWidth || 0, 720)
      });
      mergeState(response.state);
      if (action === "start-planned-download") {
        setState((current) => ({ ...current, downloadPlanner: null }));
      }
      showToast(`下载任务已加入队列：${String(response.filename || movieId)}`, "ok");
    } catch (error) {
      if (action === "start-planned-download") {
        setState((current) => ({
          ...current,
          downloadPlanner: {
            ...(activePlanner || { open: true, movieId, movieTitle: String(payload.movieTitle || `影片 ${movieId}`) }),
            open: true,
            phase: "error",
            planTicket: "",
            error: error instanceof Error ? error.message : String(error)
          }
        }));
      }
      throw error;
    } finally {
      // 后台响应代表任务已原子写入；短暂保留锁可吸收双击，但不再以固定延时猜测后台事务时长。
      window.setTimeout(() => downloadLocks.current.delete(movieId), 500);
    }
  }, [mergeState, showToast]);

  const executeAction = useCallback(async (action: string, payload: Record<string, unknown>) => {
    if (action === "load-cinema-catalog" || action === "load-more-cinema-catalog") return runCatalog(action, payload);
    if (action === "load-cinema-collection") return runCollection(payload);
    if (["open-cinema-playback", "refresh-playback-session", "open-library-playback"].includes(action)) return runPlayback(payload);
    if (action === "plan-full-video-download") return runPlanner(payload);
    if (action === "close-download-planner") {
      requests.current.invalidate("planner");
      setState((current) => ({ ...current, downloadPlanner: null }));
      return;
    }
    if (action === "start-planned-download" || action === "download-full-video") return runDownloadCreation(action, payload);

    if (action === "copy-play-link" || action === "copy-backup-link") {
      await copyCinemaText(String(payload.url || ""));
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
      await copyCinemaText(safePlaybackDiagnostic(stateRef.current));
      showToast("脱敏播放诊断已复制", "ok");
      return;
    }
    if (action === "refresh-downloads") {
      await refreshState(false);
      return;
    }
    if (action === "save-downloads") {
      const response = await sendCinemaRuntime("saveDownloadSnapshot");
      mergeState(response.state);
      showToast("下载任务快照已保存", "ok");
      return;
    }
    if (action === "save-ready-downloads") {
      const ids = Array.isArray(payload.taskIds) ? payload.taskIds.map(String).filter(Boolean) : [];
      let completed = 0;
      let failed = 0;
      // 保存页会消耗一次性领取令牌。顺序提交可避免多个响应以乱序快照互相覆盖，也不会让单项失败中止其余任务。
      for (const taskId of ids) {
        try {
          const result = await sendCinemaRuntime("saveDownloadToDevice", { taskId });
          mergeState(result.state);
          completed += 1;
        } catch (_) {
          failed += 1;
        }
      }
      await refreshState(true).catch(() => undefined);
      showToast(failed ? `已提交 ${completed} 个，${failed} 个需要重试` : `已处理 ${completed} 个可保存任务`, failed ? "error" : "ok");
      return;
    }
    if (["copy-download-url", "copy-filtered-download-urls", "copy-filtered-download-report", "copy-failed-download-summary"].includes(action)) {
      const tasks = selectDownloadTasksByIds(stateRef.current, action === "copy-download-url" ? [payload.taskId] : payload.taskIds);
      const text = action === "copy-download-url" || action === "copy-filtered-download-urls"
        ? taskUrlLines(tasks)
        : buildDownloadReport(tasks, String(payload.filterLabel || "当前筛选"), action === "copy-failed-download-summary");
      await copyCinemaText(text);
      showToast(action.includes("report") || action.includes("summary") ? "下载报告已复制" : "下载链接已复制", "ok");
      return;
    }

    const runtimeType = STANDALONE_RUNTIME_ACTIONS[action];
    if (!runtimeType) throw new Error(`影院独立页尚未接入操作：${action}`);
    const response = await sendCinemaRuntime(runtimeType, {
      ...payload,
      ...(action === "run-storage-audit" ? { allowAutoCleanup: false } : {})
    });
    mergeState(response.state);
    showToast(successMessage(action), "ok");
  }, [mergeState, refreshState, runCatalog, runCollection, runDownloadCreation, runPlanner, runPlayback, showToast]);

  const onAction = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    void executeAction(action, payload).catch((error: CinemaRuntimeError) => {
      mergeState(error.response?.state);
      showToast(error.message || String(error), "error");
    });
  }, [executeAction, mergeState, showToast]);

  return {
    state,
    toast,
    setToast,
    showToast,
    refreshState,
    initialRoute: initialRoute.current,
    activeRoute,
    setActiveRoute,
    onAction
  };
}
