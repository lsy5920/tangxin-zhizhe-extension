import type { BridgeState, DownloadTask, LibraryEntry, PlaybackBookmark } from "../types";
import type { PlaybackSession, ScreeningState } from "../playback/types";
import type { CinemaCatalogState, CinemaCollectionState, CinemaMovie } from "./types";

export const CINEMA_PRIMARY_ROUTES = ["home", "discover", "search", "library", "bookmarks", "history", "downloads", "storage"] as const;

export type CinemaPrimaryRoute = typeof CINEMA_PRIMARY_ROUTES[number];
export type CinemaRoute =
  | { name: CinemaPrimaryRoute }
  | { name: "detail"; movieId: string }
  | { name: "playback"; movieId: string };

export type CinemaHistoryItem = {
  movie: CinemaMovie;
  sessionId: string;
  fetchedAt: string;
  acquisitionMode: string;
};

export type CinemaLibraryItem = {
  movie: CinemaMovie;
  entry: LibraryEntry;
};

export type CinemaBookmarkItem = {
  movie: CinemaMovie;
  bookmark: PlaybackBookmark;
};

export type CinemaWorkspaceViewModel = {
  movieIndex: Map<string, CinemaMovie>;
  library: CinemaLibraryItem[];
  history: CinemaHistoryItem[];
  bookmarks: CinemaBookmarkItem[];
  downloads: DownloadTask[];
  counts: {
    catalog: number;
    library: number;
    bookmarks: number;
    history: number;
    downloads: number;
    activeDownloads: number;
    storageIssues: number;
  };
};

export function isCinemaPrimaryRoute(value: unknown): value is CinemaPrimaryRoute {
  return CINEMA_PRIMARY_ROUTES.includes(value as CinemaPrimaryRoute);
}

export function normalizeCinemaPrimaryRoute(value: unknown): CinemaPrimaryRoute {
  return isCinemaPrimaryRoute(value) ? value : "home";
}

export function createCinemaRouteStack(initial: unknown = "home"): CinemaRoute[] {
  if (initial && typeof initial === "object" && "name" in initial) {
    const name = String(initial.name || "");
    if (["detail", "playback"].includes(name) && "movieId" in initial) {
      const movieId = String(initial.movieId || "").trim();
      if (movieId) {
        // 独立页深链仍保留一个可靠首页基线，让浏览器返回键始终有明确落点。
        return [{ name: "home" }, { name: name as "detail" | "playback", movieId }];
      }
    }
    return [{ name: normalizeCinemaPrimaryRoute(name) }];
  }
  return [{ name: normalizeCinemaPrimaryRoute(initial) }];
}

export function cinemaRoutesEqual(left: CinemaRoute | undefined, right: CinemaRoute | undefined) {
  if (!left || !right || left.name !== right.name) return false;
  if ("movieId" in left || "movieId" in right) {
    return "movieId" in left && "movieId" in right && left.movieId === right.movieId;
  }
  return true;
}

export function syncCinemaRouteStack(stack: CinemaRoute[], route: CinemaRoute): CinemaRoute[] {
  if (cinemaRoutesEqual(stack[stack.length - 1], route)) return stack;
  if ("movieId" in route) return createCinemaRouteStack(route);
  return navigateCinemaPrimary(route.name);
}

export function navigateCinemaPrimary(route: CinemaPrimaryRoute): CinemaRoute[] {
  return [{ name: route }];
}

export function pushCinemaRoute(stack: CinemaRoute[], route: CinemaRoute): CinemaRoute[] {
  const current = stack[stack.length - 1];
  if (current?.name === route.name && "movieId" in current && "movieId" in route && current.movieId === route.movieId) {
    return stack;
  }
  // 局部路由只服务当前扩展 UI，限制深度可避免长时浏览后保留无界历史。
  return [...stack, route].slice(-12);
}

export function popCinemaRoute(stack: CinemaRoute[]): CinemaRoute[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

export function collectCinemaMovieIndex(
  catalog?: CinemaCatalogState | null,
  collection?: CinemaCollectionState | null
) {
  const index = new Map<string, CinemaMovie>();
  const remember = (movie?: CinemaMovie | null) => {
    const id = String(movie?.id || "").trim();
    if (id && !index.has(id) && movie) index.set(id, movie);
  };
  for (const section of catalog?.sections || []) {
    for (const movie of section.items || []) remember(movie);
  }
  // 搜索/分页结果比发现分区更新，同编号时优先使用 items 中的当前元数据。
  for (const movie of catalog?.items || []) {
    const id = String(movie?.id || "").trim();
    if (id) index.set(id, movie);
  }
  // 详情端点的 groups 只会被映射为白名单元数据，合并进索引后可在切集时复用同一路由模型。
  for (const movie of collection?.items || []) {
    const id = String(movie?.id || "").trim();
    if (id) index.set(id, movie);
  }
  return index;
}


export function shouldLoadCinemaCollection(
  collection: CinemaCollectionState | null | undefined,
  movieId: unknown
) {
  const normalizedMovieId = String(movieId || "").trim();
  if (!normalizedMovieId) return false;
  if ((collection?.items || []).some((movie) => movie.id === normalizedMovieId)) return false;
  // 同一编号已有进行中、成功或失败结果时不做后台重试，避免上游故障造成请求风暴；
  // 用户仍可通过详情页“刷新合集”显式重试。
  if (collection?.parentMovieId === normalizedMovieId && collection.phase !== "idle") return false;
  return true;
}

function fallbackDurationLabel(durationSeconds?: number, explicit?: string) {
  if (String(explicit || "").trim()) return String(explicit);
  const seconds = Math.max(0, Math.floor(Number(durationSeconds) || 0));
  if (!seconds) return "待探测";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function libraryEntryToCinemaMovie(entry: LibraryEntry): CinemaMovie {
  const durationSeconds = Math.max(0, Number(entry.durationSeconds) || 0);
  return {
    id: String(entry.movieId || ""),
    title: String(entry.title || `影片 ${entry.movieId}`),
    posterUrl: String(entry.posterUrl || ""),
    creator: String(entry.creator || "我的片库"),
    durationSeconds,
    durationLabel: fallbackDurationLabel(durationSeconds, entry.durationLabel),
    orientation: ["landscape", "portrait", "square"].includes(String(entry.orientation))
      ? entry.orientation as CinemaMovie["orientation"]
      : "landscape",
    access: ["free", "vip", "coin"].includes(String(entry.access))
      ? entry.access as CinemaMovie["access"]
      : "free",
    price: Math.max(0, Number(entry.price) || 0),
    isCollection: entry.isCollection === true
  };
}

function sessionToFallbackMovie(session: PlaybackSession, library?: Record<string, LibraryEntry>) {
  const stored = library?.[session.movieId];
  if (stored) return libraryEntryToCinemaMovie(stored);
  const duration = Math.max(
    0,
    ...(session.sources || []).map((source) => Number(source.media?.durationSeconds) || Number(source.health?.duration) || 0)
  );
  return {
    id: session.movieId,
    title: session.title || `影片 ${session.movieId}`,
    posterUrl: "",
    creator: "观看足迹",
    durationSeconds: duration,
    durationLabel: fallbackDurationLabel(duration),
    orientation: "landscape" as const,
    access: "free" as const,
    price: 0
  };
}

export function selectCinemaHistory(
  screening: ScreeningState | undefined,
  movieIndex: Map<string, CinemaMovie>,
  library: Record<string, LibraryEntry> = {}
): CinemaHistoryItem[] {
  const byMovie = new Map<string, PlaybackSession>();
  const sessions = [...(screening?.history || []), ...(screening?.activeSession ? [screening.activeSession] : [])];
  for (const session of sessions) {
    const movieId = String(session?.movieId || "").trim();
    if (!movieId) continue;
    const previous = byMovie.get(movieId);
    if (!previous || (Date.parse(session.fetchedAt || "") || 0) >= (Date.parse(previous.fetchedAt || "") || 0)) {
      byMovie.set(movieId, session);
    }
  }
  return [...byMovie.values()]
    .sort((left, right) => (Date.parse(right.fetchedAt || "") || 0) - (Date.parse(left.fetchedAt || "") || 0))
    .map((session) => ({
      movie: movieIndex.get(session.movieId) || sessionToFallbackMovie(session, library),
      sessionId: session.id,
      fetchedAt: session.fetchedAt,
      acquisitionMode: session.acquisition?.mode || "legacy"
    }));
}

export function selectCinemaLibrary(
  library: Record<string, LibraryEntry> = {},
  movieIndex: Map<string, CinemaMovie>,
  filter: "all" | "favorite" | "watchLater" = "all",
  keyword = ""
): CinemaLibraryItem[] {
  const needle = keyword.trim().toLocaleLowerCase("zh-CN");
  return Object.values(library)
    .filter((entry) => filter === "all" || (filter === "favorite" ? entry.favorite : entry.watchLater))
    .filter((entry) => {
      if (!needle) return true;
      return [entry.movieId, entry.title, entry.note, ...(entry.tags || [])]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(needle);
    })
    .sort((left, right) => (Date.parse(right.updatedAt || right.addedAt || "") || 0) - (Date.parse(left.updatedAt || left.addedAt || "") || 0))
    .map((entry) => ({ movie: movieIndex.get(entry.movieId) || libraryEntryToCinemaMovie(entry), entry }));
}

export function buildCinemaWorkspaceViewModel(state: BridgeState): CinemaWorkspaceViewModel {
  const movieIndex = collectCinemaMovieIndex(state.cinemaCatalog, state.cinemaCollection);
  const libraryEntries = state.experience?.library || {};
  const library = selectCinemaLibrary(libraryEntries, movieIndex);
  const history = selectCinemaHistory(state.screening, movieIndex, libraryEntries);
  const downloads = Object.values(state.downloadTasks || {});
  const bookmarks = Object.entries(state.experience?.bookmarks || {}).flatMap(([movieId, rows]) => {
    const movie = movieIndex.get(movieId)
      || (libraryEntries[movieId] ? libraryEntryToCinemaMovie(libraryEntries[movieId]) : null)
      || history.find((item) => item.movie.id === movieId)?.movie
      || {
        id: movieId,
        title: rows?.[0]?.title || `影片 ${movieId}`,
        posterUrl: "",
        creator: "时间书签",
        durationSeconds: rows?.[0]?.durationSeconds || 0,
        durationLabel: fallbackDurationLabel(rows?.[0]?.durationSeconds || 0),
        orientation: "landscape" as const,
        access: "free" as const,
        price: 0
      };
    return (rows || []).map((bookmark) => ({ movie, bookmark }));
  }).sort((left, right) => (Date.parse(right.bookmark.updatedAt || right.bookmark.createdAt || "") || 0) - (Date.parse(left.bookmark.updatedAt || left.bookmark.createdAt || "") || 0));
  const activeDownloads = downloads.filter((task) => ["queued", "probing", "downloading", "recovering", "assembling", "saving"].includes(String(task.stage || ""))).length;
  const storageIssues = (state.experience?.storageAudit?.entries || []).filter((entry) => !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || ""))).length;
  return {
    movieIndex,
    library,
    history,
    bookmarks,
    downloads,
    counts: {
      catalog: movieIndex.size,
      library: library.length,
      bookmarks: bookmarks.length,
      history: history.length,
      downloads: downloads.length,
      activeDownloads,
      storageIssues
    }
  };
}
