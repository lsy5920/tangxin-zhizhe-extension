import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  collectCinemaMovieIndex,
  createCinemaRouteStack,
  libraryEntryToCinemaMovie,
  navigateCinemaPrimary,
  popCinemaRoute,
  pushCinemaRoute,
  selectCinemaHistory,
  selectCinemaLibrary,
  type CinemaPrimaryRoute,
  type CinemaRoute
} from "../cinema/appModel";
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
import { PlaybackPage } from "./PlaybackPage";

type Toast = { text: string; level: string } | null;

type Props = {
  panelRef: RefObject<HTMLDivElement>;
  state: BridgeState;
  initialRoute?: CinemaPrimaryRoute;
  toast?: Toast;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPrimaryRouteChange?: (route: CinemaPrimaryRoute) => void;
  onExitWorkspace: () => void;
  onClose: () => void;
  onDismissToast?: () => void;
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
  return ["home", "discover", "search", "library", "history"].includes(route.name);
}

export function CinemaPage({
  panelRef,
  state,
  initialRoute = "home",
  toast = null,
  onAction,
  onPrimaryRouteChange = () => undefined,
  onExitWorkspace,
  onClose,
  onDismissToast = () => undefined
}: Props) {
  const catalog = state.cinemaCatalog || EMPTY_CATALOG;
  const collection = state.cinemaCollection || null;
  const [routeStack, setRouteStack] = useState<CinemaRoute[]>(() => createCinemaRouteStack(initialRoute));
  const route = routeStack[routeStack.length - 1];
  const rememberedMovies = useRef(new Map<string, CinemaMovie>());
  const scrollPositions = useRef(new Map<string, number>());
  const movieIndex = useMemo(() => collectCinemaMovieIndex(catalog, collection), [catalog, collection]);
  const library = state.experience?.library || {};
  const history = useMemo(() => selectCinemaHistory(state.screening, movieIndex, library), [library, movieIndex, state.screening]);
  const [libraryFilter, setLibraryFilter] = useState<"all" | "favorite" | "watchLater">("all");
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const allLibraryItems = useMemo(() => selectCinemaLibrary(library, movieIndex), [library, movieIndex]);
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

  useEffect(() => {
    // 存储偏好异步恢复时，只在还没进入详情/播放的情况下同步首页签。
    setRouteStack((current) => current.length === 1 && isPrimaryRoute(current[0]) && current[0].name !== initialRoute
      ? createCinemaRouteStack(initialRoute)
      : current);
  }, [initialRoute]);

  useEffect(() => {
    if (isPrimaryRoute(route)) onPrimaryRouteChange(route.name);
  }, [onPrimaryRouteChange, route]);

  useEffect(() => {
    for (const movie of collection?.items || []) rememberedMovies.current.set(movie.id, movie);
  }, [collection?.items]);

  useEffect(() => {
    const scroller = panelRef.current?.querySelector<HTMLElement>(".txzz-cinema-app-main");
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
    setRouteStack(navigateCinemaPrimary(target));
    onPrimaryRouteChange(target);
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
    setRouteStack((current) => popCinemaRoute(current));
  };

  const rememberMovie = (movie: CinemaMovie) => {
    rememberedMovies.current.set(movie.id, movie);
  };

  const openMovie = (movie: CinemaMovie) => {
    rememberMovie(movie);
    const collectionAlreadyLoaded = collection?.parentMovieId === movie.id
      || (collection?.items || []).some((item) => item.id === movie.id);
    if (movie.isCollection && !collectionAlreadyLoaded) {
      // 打开合集详情只读取 groups 元数据，完整线路仍由后续“开映”手势触发。
      onAction("load-cinema-collection", { movieId: movie.id, movieTitle: movie.title });
    }
    const selectingEpisode = route.name === "detail"
      && Boolean(activeCollection?.items?.some((item) => item.id === movie.id));
    setRouteStack((current) => selectingEpisode
      // 切集是同一详情层的内部状态，替换栈顶可避免返回键逐集倒退。
      ? [...current.slice(0, -1), { name: "detail", movieId: movie.id }]
      : pushCinemaRoute(current, { name: "detail", movieId: movie.id }));
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
    onAction("open-cinema-playback", { movieId: movie.id, movieTitle: movie.title });
    setRouteStack((current) => pushCinemaRoute(current, { name: "playback", movieId: movie.id }));
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
      setRouteStack(navigateCinemaPrimary("search"));
      onPrimaryRouteChange("search");
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
  }, [onClose, panelRef, routeStack.length]);

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
          ? <CinemaLibraryView items={libraryItems} allItems={allLibraryItems} filter={libraryFilter} keyword={libraryKeyword} onFilter={setLibraryFilter} onKeyword={setLibraryKeyword} onMovie={openMovie} onNavigate={goPrimary} />
          : route.name === "history"
            ? <CinemaHistoryView items={history} onMovie={openMovie} onPlay={openPlayback} onNavigate={goPrimary} />
            : route.name === "detail"
              ? <CinemaDetailPage movie={selectedMovie} collection={activeCollection} libraryEntry={selectedMovie ? library[selectedMovie.id] || null : null} resolving={Boolean(selectedMovie && resolvingMovieId === selectedMovie.id)} related={related} onOpenPlayback={openPlayback} onPlanDownload={planDownload} onRefreshCollection={refreshCollection} onToggleFavorite={(movie) => updateLibrary(movie, { favorite: !library[movie.id]?.favorite })} onToggleWatchLater={(movie) => updateLibrary(movie, { watchLater: !library[movie.id]?.watchLater })} onMovie={openMovie} onBack={goBack} />
              : <PlaybackPage state={state} onAction={onAction} variant="cinema" />;

  return (
    <CinemaAppShell
      panelRef={panelRef}
      route={route}
      canGoBack={routeStack.length > 1}
      libraryCount={Object.keys(library).length}
      historyCount={history.length}
      resolving={Boolean(resolvingMovieId)}
      toast={toast}
      onNavigate={goPrimary}
      onBack={goBack}
      onExitWorkspace={onExitWorkspace}
      onClose={onClose}
      onDismissToast={onDismissToast}
    >
      {body}
    </CinemaAppShell>
  );
}
