import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  buildCinemaWorkspaceViewModel,
  cinemaRoutesEqual,
  createCinemaRouteStack,
  libraryEntryToCinemaMovie,
  navigateCinemaPrimary,
  popCinemaRoute,
  pushCinemaRoute,
  selectCinemaLibrary,
  shouldLoadCinemaCollection,
  syncCinemaRouteStack,
  type CinemaPrimaryRoute,
  type CinemaRoute
} from "../cinema/appModel";
import { cinemaRouteEntryFromHash } from "../cinema/standaloneBridgeCore";
import type {
  CinemaCatalogFilters,
  CinemaCatalogMode,
  CinemaCatalogState,
  CinemaCollectionState,
  CinemaMovie
} from "../cinema/types";
import type { BridgeState } from "../types";
import { getPluginHost, PLAYER_FULLSCREEN_HOST_CLASS } from "./player/browserFullscreen";
import { CinemaAppShell } from "./cinema/CinemaAppShell";
import { CinemaDetailPage } from "./cinema/CinemaDetailPage";
import { CinemaExploreView, CinemaHomeView, type CinemaQuery } from "./cinema/CinemaCatalogViews";
import { CinemaHistoryView, CinemaLibraryView } from "./cinema/CinemaLibraryViews";
import { CinemaBookmarkView } from "./cinema/CinemaBookmarkView";
import { CinemaStorageView } from "./cinema/CinemaStorageView";
import { CinemaDownloadView } from "./cinema/CinemaDownloadView";
import { PlaybackPage } from "./PlaybackPage";

type Toast = { text: string; level: string } | null;

type Props = {
  panelRef: RefObject<HTMLDivElement>;
  state: BridgeState;
  initialRoute?: CinemaPrimaryRoute | CinemaRoute;
  toast?: Toast;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPrimaryRouteChange?: (route: CinemaPrimaryRoute) => void;
  onRouteChange?: (route: CinemaRoute) => void;
  onExitWorkspace: () => void;
  onClose: () => void;
  onDismissToast?: () => void;
  standalone?: boolean;
};

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

function isPrimaryRoute(route: CinemaRoute): route is { name: CinemaPrimaryRoute } {
  return ["home", "discover", "search", "library", "bookmarks", "history", "downloads", "storage"].includes(route.name);
}

function cinemaRouteHash(route: CinemaRoute) {
  return "movieId" in route
    ? `#/${route.name}/${encodeURIComponent(route.movieId)}`
    : `#/${route.name}`;
}

function validCinemaRouteStack(value: unknown): value is CinemaRoute[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) return false;
  return value.every((route) => {
    if (!route || typeof route !== "object" || !("name" in route)) return false;
    const name = String(route.name || "");
    if (["detail", "playback"].includes(name)) return "movieId" in route && Boolean(String(route.movieId || "").trim());
    return ["home", "discover", "search", "library", "bookmarks", "history", "downloads", "storage"].includes(name);
  });
}

export function CinemaPage({
  panelRef,
  state,
  initialRoute = "home",
  toast = null,
  onAction,
  onPrimaryRouteChange,
  onRouteChange,
  onExitWorkspace,
  onClose,
  onDismissToast = () => undefined,
  standalone = false
}: Props) {
  const catalog = state.cinemaCatalog || EMPTY_CATALOG;
  const collection = state.cinemaCollection || null;
  const [routeStack, setRouteStack] = useState<CinemaRoute[]>(() => createCinemaRouteStack(initialRoute));
  const route = routeStack[routeStack.length - 1];
  const rememberedMovies = useRef(new Map<string, CinemaMovie>());
  const scrollPositions = useRef(new Map<string, number>());
  const workspace = useMemo(() => buildCinemaWorkspaceViewModel(state), [state]);
  const movieIndex = workspace.movieIndex;
  const library = state.experience?.library || {};
  const history = workspace.history;
  const [libraryFilter, setLibraryFilter] = useState<"all" | "favorite" | "watchLater">("all");
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const allLibraryItems = workspace.library;
  const libraryItems = useMemo(
    () => selectCinemaLibrary(library, movieIndex, libraryFilter, libraryKeyword),
    [library, libraryFilter, libraryKeyword, movieIndex]
  );
  const resolvingMovieId = state.screening?.request?.phase === "resolving"
    ? String(state.screening.request.movieId || "")
    : "";

  const resolveMovie = (movieId: string) => rememberedMovies.current.get(movieId)
    || movieIndex.get(movieId)
    || (library[movieId] ? libraryEntryToCinemaMovie(library[movieId]) : null)
    || history.find((item) => item.movie.id === movieId)?.movie
    || null;
  const selectedMovie = "movieId" in route ? resolveMovie(route.movieId) : null;
  const activeCollection = useMemo<CinemaCollectionState | null>(() => {
    if (!selectedMovie || !collection) return null;
    const containsSelected = (collection.items || []).some((item) => item.id === selectedMovie.id);
    return collection.parentMovieId === selectedMovie.id || containsSelected ? collection : null;
  }, [collection, selectedMovie]);
  const collectionMovieIds = useMemo(
    () => new Set((activeCollection?.items || []).map((movie) => movie.id)),
    [activeCollection]
  );
  const routeScrollKey = route.name === "detail" && activeCollection?.parentMovieId
    ? `detail:collection:${activeCollection.parentMovieId}`
    : "movieId" in route ? `${route.name}:${route.movieId}` : route.name;
  const related = selectedMovie
    ? [...movieIndex.values()].filter((movie) => movie.id !== selectedMovie.id && !collectionMovieIds.has(movie.id))
      .sort((left, right) => Number(right.orientation === selectedMovie.orientation) - Number(left.orientation === selectedMovie.orientation))
      .slice(0, 12)
    : [];

  const applyRouteStack = (next: CinemaRoute[], mode: "push" | "replace" = "push") => {
    const bounded = next.slice(-12);
    setRouteStack(bounded);
    if (!standalone) return;
    const method = mode === "replace" ? "replaceState" : "pushState";
    window.history[method]({ ...(window.history.state || {}), txzzCinemaRouteStack: bounded }, "", cinemaRouteHash(bounded[bounded.length - 1]));
  };

  useEffect(() => {
    if (!standalone) return;
    const currentState = window.history.state || {};
    if (routeStack.length > 1 && currentState.txzzCinemaHistorySeeded !== true) {
      // 直接打开 #/detail 或 #/playback 时，内部栈包含首页基线，但浏览器本身尚无对应历史项。
      // 先写首页再 push 当前页，确保标题栏返回键不会离开扩展或落入空白页。
      const baseStack = [routeStack[0]];
      const sharedState = { ...currentState, txzzCinemaHistorySeeded: true };
      window.history.replaceState({ ...sharedState, txzzCinemaRouteStack: baseStack }, "", cinemaRouteHash(baseStack[0]));
      window.history.pushState({ ...sharedState, txzzCinemaRouteStack: routeStack }, "", cinemaRouteHash(route));
    } else {
      window.history.replaceState({ ...currentState, txzzCinemaHistorySeeded: true, txzzCinemaRouteStack: routeStack }, "", cinemaRouteHash(route));
    }
    const popState = (event: PopStateEvent) => {
      const restored = (event.state as { txzzCinemaRouteStack?: unknown } | null)?.txzzCinemaRouteStack;
      if (validCinemaRouteStack(restored)) setRouteStack(restored);
    };
    window.addEventListener("popstate", popState);
    return () => window.removeEventListener("popstate", popState);
    // 初次挂载建立浏览器历史基线；后续历史由 applyRouteStack 精确维护。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone]);

  useEffect(() => {
    if (!standalone) return;
    const syncFromLocation = () => {
      const nextRoute = cinemaRouteEntryFromHash(window.location.hash);
      setRouteStack((current) => syncCinemaRouteStack(current, nextRoute));
    };
    window.addEventListener("hashchange", syncFromLocation);
    return () => window.removeEventListener("hashchange", syncFromLocation);
  }, [standalone]);

  useEffect(() => {
    // 存储偏好异步恢复时，只在还没进入详情/播放的情况下同步首页签。
    const target = createCinemaRouteStack(initialRoute);
    setRouteStack((current) => current.length === 1 && isPrimaryRoute(current[0]) && !cinemaRoutesEqual(current[0], target[target.length - 1])
      ? target
      : current);
  }, [initialRoute]);

  useEffect(() => {
    if (isPrimaryRoute(route)) onPrimaryRouteChange?.(route.name);
    onRouteChange?.(route);
  }, [onPrimaryRouteChange, onRouteChange, route]);

  useEffect(() => {
    for (const movie of collection?.items || []) rememberedMovies.current.set(movie.id, movie);
  }, [collection?.items]);

  useEffect(() => {
    if (!selectedMovie || !["detail", "playback"].includes(route.name)) return;
    if (!shouldLoadCinemaCollection(collection, selectedMovie.id)) return;
    // 深链刷新没有页面态合集缓存；这里只恢复白名单元数据，绝不解析播放线路或触发购买。
    onAction("load-cinema-collection", { movieId: selectedMovie.id, movieTitle: selectedMovie.title });
  }, [collection, onAction, route.name, selectedMovie]);

  useEffect(() => {
    const scroller = panelRef.current?.querySelector<HTMLElement>(".txzz-stream-main");
    if (!scroller) return;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({ top: scrollPositions.current.get(routeScrollKey) || 0, behavior: "auto" });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      // 借鉴 Harbor 的视图记忆：详情、片库与发现页各自恢复浏览位置。
      scrollPositions.current.set(routeScrollKey, scroller.scrollTop);
    };
  }, [panelRef, routeScrollKey]);

  useEffect(() => {
    const empty = !(catalog.items?.length || catalog.sections?.length);
    if (catalog.phase === "idle" && empty) {
      onAction("load-cinema-catalog", { mode: "discover" });
      return;
    }
    // 首页必须恢复原始发现分区，不能把上一次搜索结果冒充首页推荐。
    if (route.name === "home" && catalog.phase !== "loading" && catalog.mode !== "discover") {
      onAction("load-cinema-catalog", { mode: "discover", query: "", filters: {}, forceRefresh: false });
    }
  }, [catalog.items?.length, catalog.mode, catalog.phase, catalog.sections?.length, onAction, route.name]);

  const goPrimary = (target: CinemaPrimaryRoute) => {
    applyRouteStack(navigateCinemaPrimary(target));
    onPrimaryRouteChange?.(target);
    if (target === "home" && catalog.mode !== "discover") {
      onAction("load-cinema-catalog", { mode: "discover", query: "", filters: {}, forceRefresh: false });
    } else if (target === "discover" && catalog.mode === "search") {
      const filters = catalog.filters || {};
      onAction("load-cinema-catalog", {
        mode: Object.values(filters).some(Boolean) ? "browse" : "discover",
        query: "",
        filters,
        forceRefresh: false
      });
    }
  };

  const goBack = () => {
    if (standalone && routeStack.length > 1) {
      window.history.back();
      return;
    }
    applyRouteStack(popCinemaRoute(routeStack), "replace");
  };

  const rememberMovie = (movie: CinemaMovie) => {
    rememberedMovies.current.set(movie.id, movie);
  };

  const openMovie = (movie: CinemaMovie) => {
    rememberMovie(movie);
    if (shouldLoadCinemaCollection(collection, movie.id)) {
      // 部分上游目录项没有 is_episode 标记；用户打开详情后统一读取并白名单化 groups，
      // 才能可靠识别合集。该请求不保存播放字段，也不会触发完整线路解析或购买。
      onAction("load-cinema-collection", { movieId: movie.id, movieTitle: movie.title });
    }
    const selectingEpisode = route.name === "detail"
      && Boolean(activeCollection?.items?.some((item) => item.id === movie.id));
    applyRouteStack(selectingEpisode
      // 切集是同一详情层的内部状态，替换栈顶可避免返回键逐集倒退。
      ? [...routeStack.slice(0, -1), { name: "detail", movieId: movie.id }]
      : pushCinemaRoute(routeStack, { name: "detail", movieId: movie.id }), selectingEpisode ? "replace" : "push");
  };

  const refreshCollection = (movie: CinemaMovie) => {
    onAction("load-cinema-collection", {
      movieId: movie.id,
      movieTitle: movie.title,
      forceRefresh: true
    });
  };

  const openPlayback = (movie: CinemaMovie) => {
    rememberMovie(movie);
    // 用户手势是完整线路请求的唯一入口；路由切换本身绝不解析或预购买。
    applyRouteStack(pushCinemaRoute(routeStack, { name: "playback", movieId: movie.id }));
    onAction("open-cinema-playback", { movieId: movie.id, movieTitle: movie.title });
  };

  const replacePlaybackMovieRoute = (movieId: string) => {
    const normalizedMovieId = String(movieId || "").trim();
    if (!normalizedMovieId) return;
    const nextRoute: CinemaRoute = { name: "playback", movieId: normalizedMovieId };
    // 画面内选集与足迹切换属于同一放映层，替换栈顶可避免返回键逐集倒退，
    // 同时保证刷新、复制地址和浏览器历史都指向当前实际影片。
    applyRouteStack(
      route.name === "playback" ? [...routeStack.slice(0, -1), nextRoute] : pushCinemaRoute(routeStack, nextRoute),
      route.name === "playback" ? "replace" : "push"
    );
  };

  const planDownload = (movie: CinemaMovie) => {
    rememberMovie(movie);
    // 下载与开映一样必须由明确手势触发；规划器自行检票并展示线路、画质、空间和队列选项。
    onAction("plan-full-video-download", {
      movieId: movie.id,
      movieTitle: movie.title,
      lineKey: "auto"
    });
  };

  const updateLibrary = (movie: CinemaMovie, patch: { favorite?: boolean; watchLater?: boolean }) => {
    const current = library[movie.id];
    onAction("update-library-entry", {
      movieId: movie.id,
      title: movie.title,
      posterUrl: movie.posterUrl,
      creator: movie.creator,
      durationSeconds: movie.durationSeconds,
      durationLabel: movie.durationLabel,
      orientation: movie.orientation,
      access: movie.access,
      price: movie.price,
      isCollection: movie.isCollection === true,
      favorite: patch.favorite ?? current?.favorite ?? false,
      watchLater: patch.watchLater ?? current?.watchLater ?? false,
      tags: current?.tags || [],
      note: current?.note || ""
    });
  };

  const runQuery = ({ mode, query, filters }: CinemaQuery) => {
    if (mode === "search" && route.name !== "search") {
      applyRouteStack(navigateCinemaPrimary("search"));
      onPrimaryRouteChange?.("search");
    }
    onAction("load-cinema-catalog", { mode, query, filters, forceRefresh: false });
  };

  const refresh = () => {
    onAction("load-cinema-catalog", {
      mode: catalog.mode || "discover",
      query: catalog.query || "",
      filters: catalog.filters || {},
      forceRefresh: true
    });
  };

  const loadMore = () => {
    onAction("load-more-cinema-catalog", {
      mode: catalog.mode || "browse",
      query: catalog.query || "",
      filters: catalog.filters || {},
      pageSize: catalog.pageSize || 24
    });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const root = panelRef.current?.getRootNode();
      if (root instanceof ShadowRoot && root.querySelector('[data-txzz-modal-sheet="true"]')) return;
      const host = getPluginHost();
      if (document.fullscreenElement || host?.classList.contains(PLAYER_FULLSCREEN_HOST_CLASS)) return;
      event.preventDefault();
      if (routeStack.length > 1) goBack();
      else onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, panelRef, routeStack, standalone]);

  useEffect(() => {
    if (!standalone) return;
    const openSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const active = (panelRef.current?.getRootNode() as ShadowRoot | undefined)?.activeElement || document.activeElement;
      if (active instanceof HTMLElement && (active.isContentEditable || active.matches("input, textarea, select"))) return;
      event.preventDefault();
      goPrimary("search");
      window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>("#txzz-cinema-search")?.focus());
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, [panelRef, route.name, standalone]);

  const commonCatalogProps = {
    catalog,
    resolvingMovieId,
    onMovie: openMovie,
    onPlay: openPlayback,
    onQuery: runQuery,
    onLoadMore: loadMore,
    onRefresh: refresh
  };

  const body = route.name === "home"
    ? <CinemaHomeView {...commonCatalogProps} history={history} onNavigate={goPrimary} />
    : route.name === "discover"
      ? <CinemaExploreView {...commonCatalogProps} />
      : route.name === "search"
        ? <CinemaExploreView {...commonCatalogProps} searchOnly />
        : route.name === "library"
          ? <CinemaLibraryView items={libraryItems} allItems={allLibraryItems} filter={libraryFilter} keyword={libraryKeyword} onFilter={setLibraryFilter} onKeyword={setLibraryKeyword} onMovie={openMovie} onPlay={openPlayback} onUpdateEntry={({ movie, entry }, patch) => onAction("update-library-entry", { ...entry, ...patch, movieId: movie.id, title: movie.title })} onNavigate={goPrimary} bookmarkCount={workspace.counts.bookmarks} historyCount={workspace.counts.history} />
          : route.name === "bookmarks"
            ? <CinemaBookmarkView items={workspace.bookmarks} onMovie={openMovie} onPlay={openPlayback} onEdit={({ bookmark }, patch) => onAction("save-playback-bookmark", { ...bookmark, ...patch })} onDelete={({ bookmark }) => onAction("delete-playback-bookmark", { movieId: bookmark.movieId, bookmarkId: bookmark.id })} />
          : route.name === "history"
            ? <CinemaHistoryView items={history} onMovie={openMovie} onPlay={openPlayback} onNavigate={goPrimary} />
            : route.name === "downloads"
              ? <CinemaDownloadView state={state} onAction={onAction} onOpenStorage={() => goPrimary("storage")} />
            : route.name === "storage"
              ? <CinemaStorageView state={state} onAction={onAction} />
            : route.name === "detail"
              ? <CinemaDetailPage movie={selectedMovie} collection={activeCollection} libraryEntry={selectedMovie ? library[selectedMovie.id] || null : null} resolving={Boolean(selectedMovie && resolvingMovieId === selectedMovie.id)} related={related} onOpenPlayback={openPlayback} onPlanDownload={planDownload} onRefreshCollection={refreshCollection} onToggleFavorite={(movie) => updateLibrary(movie, { favorite: !library[movie.id]?.favorite })} onToggleWatchLater={(movie) => updateLibrary(movie, { watchLater: !library[movie.id]?.watchLater })} onMovie={openMovie} onBack={goBack} />
              : <PlaybackPage
                  state={state}
                  onAction={onAction}
                  routeMovieId={"movieId" in route ? route.movieId : ""}
                  onRouteMovieChange={replacePlaybackMovieRoute}
                  onOpenDownloads={() => goPrimary("downloads")}
                />;

  return (
    <CinemaAppShell
      panelRef={panelRef}
      route={route}
      canGoBack={routeStack.length > 1}
      libraryCount={workspace.counts.library}
      bookmarkCount={workspace.counts.bookmarks}
      historyCount={workspace.counts.history}
      downloadCount={workspace.counts.downloads}
      activeDownloadCount={workspace.counts.activeDownloads}
      catalogCount={workspace.counts.catalog}
      storageIssueCount={workspace.counts.storageIssues}
      resolving={Boolean(resolvingMovieId)}
      toast={toast}
      onNavigate={goPrimary}
      onBack={goBack}
      onExitWorkspace={onExitWorkspace}
      onClose={onClose}
      onDismissToast={onDismissToast}
      standalone={standalone}
    >
      {body}
    </CinemaAppShell>
  );
}
