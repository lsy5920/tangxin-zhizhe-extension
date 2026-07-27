/**
 * 页面上下文是播放请求的边界。Vlog 首页会提前请求多个详情，不能只用
 * movieId 作为判断条件；pageKey/pageEpoch 用来阻止旧页面的异步结果回写。
 */

export type PageContext = {
  href: string;
  pageKey: string;
  pageEpoch: number;
  movieId: string;
  transitioning?: boolean;
};

export type PlaybackRequestContext = {
  requestId?: string;
  pageKey?: string;
  pageEpoch?: number;
  movieId?: string;
  contextKey?: string;
  active?: boolean;
};

export type VlogContextSnapshot = {
  listPlayerInfo?: unknown;
  activeDetail?: unknown;
  activeDetailEnabled?: boolean;
  activePlayerMovieId?: unknown;
  activeSlideMovieId?: unknown;
  markedActiveMovieId?: unknown;
};

const MOVIE_ID_KEYS = ["id", "movie_id", "movieId", "vid", "videoId"] as const;

function cleanMovieId(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
}

function movieIdFromRecord(value: unknown): string {
  if (!value || typeof value !== "object") return cleanMovieId(value);
  const record = value as Record<string, unknown>;
  for (const key of MOVIE_ID_KEYS) {
    const id = cleanMovieId(record[key]);
    if (id) return id;
  }
  return "";
}

/**
 * Vlog 的 URL 固定为 /vlog/，只能从活动 Swiper 的 Vue 状态读取当前 ID。
 * playerInfo 是页面自己的权威当前项；活动详情和播放器 ID 仅作加载阶段兜底。
 */
export function getActiveVlogMovieId(snapshot: VlogContextSnapshot): string {
  const fromList = movieIdFromRecord(snapshot.listPlayerInfo);
  const fromDetail = snapshot.activeDetailEnabled !== false ? movieIdFromRecord(snapshot.activeDetail) : "";
  const fromSlide = cleanMovieId(snapshot.activeSlideMovieId);
  const fromPlayer = cleanMovieId(snapshot.activePlayerMovieId);
  const fromMarked = cleanMovieId(snapshot.markedActiveMovieId);
  const strong = [fromSlide, fromDetail, fromPlayer, fromMarked].filter(Boolean);
  const counts = new Map<string, number>();
  strong.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  const consensus = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (consensus?.[1] >= 2) return consensus[0];
  if (strong.length === 1) return strong[0];
  if (fromList && strong.includes(fromList)) return fromList;
  return strong.length ? "" : fromList;
}

export function getDetailMovieId(value: unknown): string {
  if (value instanceof URL) {
    const match = value.pathname.match(/^\/movie\/detail\/(\d+)\/?$/);
    if (match) return match[1];
    for (const key of MOVIE_ID_KEYS) {
      const id = cleanMovieId(value.searchParams.get(key));
      if (id) return id;
    }
    return "";
  }

  if (typeof value === "string") {
    try {
      return getDetailMovieId(new URL(value, "https://txzz.invalid"));
    } catch {
      return cleanMovieId(value);
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of MOVIE_ID_KEYS) {
      const id = cleanMovieId(record[key]);
      if (id) return id;
    }
    if (record.params) {
      const id = getDetailMovieId(record.params);
      if (id) return id;
    }
    if (record.query) {
      const id = getDetailMovieId(record.query);
      if (id) return id;
    }
  }
  return "";
}

export function getDetailPageKey(value: string | URL): string {
  const url = value instanceof URL ? value : new URL(value, "https://txzz.invalid");
  // hash 可能承载 SPA 子路由，保留它可以隔离同一路径下的嵌套路由切换。
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

export function createPageContext(url: string | URL, pageEpoch = 0): PageContext {
  const parsed = url instanceof URL ? url : new URL(url, "https://txzz.invalid");
  return {
    href: parsed.href,
    pageKey: getDetailPageKey(parsed),
    pageEpoch,
    movieId: getDetailMovieId(parsed)
  };
}

export function sameDetailPage(left: PageContext | null | undefined, right: PageContext | null | undefined): boolean {
  if (!left || !right) return false;
  return left.pageKey === right.pageKey
    && left.pageEpoch === right.pageEpoch
    && !left.transitioning
    && !right.transitioning
    && (!left.movieId || !right.movieId || left.movieId === right.movieId);
}

export function requiresNewPageGeneration(previous: PageContext | null | undefined, current: PageContext): boolean {
  if (!previous) return false;
  if (previous.pageKey !== current.pageKey) return true;
  let isVlog = false;
  try {
    isVlog = /^\/vlog\/?$/i.test(new URL(current.href).pathname);
  } catch {
    isVlog = /\/vlog\/?(?:[?#]|$)/i.test(current.pageKey);
  }
  return isVlog
    && Boolean(previous.movieId)
    && Boolean(current.movieId)
    && previous.movieId !== current.movieId;
}

/** Vlog 空 ID 仅表示 Swiper 正在换片；保留最后稳定 ID，等新 ID 出现再换代。 */
export function reconcilePageContext(previous: PageContext | null | undefined, current: PageContext): PageContext {
  if (!previous) return current;
  let isVlog = false;
  try { isVlog = /^\/vlog\/?$/i.test(new URL(current.href).pathname); } catch { /* 使用普通路由逻辑。 */ }
  if (previous.pageKey !== current.pageKey) return { ...current, pageEpoch: previous.pageEpoch + 1 };
  if (!isVlog) return current;
  if (!current.movieId) {
    return { ...current, movieId: previous.movieId, pageEpoch: previous.pageEpoch, transitioning: true };
  }
  return {
    ...current,
    pageEpoch: previous.movieId && previous.movieId !== current.movieId ? previous.pageEpoch + 1 : previous.pageEpoch,
    transitioning: false
  };
}

export function isCurrentRequest(current: PageContext, request: PlaybackRequestContext): boolean {
  if (request.active === false) return false;
  if (request.pageKey && request.pageKey !== current.pageKey) return false;
  if (Number.isFinite(request.pageEpoch) && Number(request.pageEpoch) !== current.pageEpoch) return false;
  let isVlog = false;
  try { isVlog = /^\/vlog\/?$/i.test(new URL(current.href).pathname); } catch { /* 非标准 URL 按普通页面。 */ }
  if (isVlog && (current.transitioning || !request.movieId || !current.movieId)) return false;
  if (request.movieId && current.movieId && String(request.movieId) !== current.movieId) return false;
  return true;
}

export function contextKey(context: Pick<PageContext, "pageKey" | "pageEpoch" | "movieId">): string {
  return `${context.pageKey}#${context.pageEpoch}:${context.movieId || "feed"}`;
}
