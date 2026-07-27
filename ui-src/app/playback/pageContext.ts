/**
 * 页面上下文是播放请求的边界。Vlog 首页会提前请求多个详情，不能只用
 * movieId 作为判断条件；pageKey/pageEpoch 用来阻止旧页面的异步结果回写。
 */

export type PageContext = {
  href: string;
  pageKey: string;
  pageEpoch: number;
  movieId: string;
};

export type PlaybackRequestContext = {
  requestId?: string;
  pageKey?: string;
  pageEpoch?: number;
  movieId?: string;
  contextKey?: string;
  active?: boolean;
};

const MOVIE_ID_KEYS = ["id", "movie_id", "movieId", "vid", "videoId"] as const;

function cleanMovieId(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
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
    && (!left.movieId || !right.movieId || left.movieId === right.movieId);
}

export function isCurrentRequest(current: PageContext, request: PlaybackRequestContext): boolean {
  if (request.active === false) return false;
  if (request.pageKey && request.pageKey !== current.pageKey) return false;
  if (Number.isFinite(request.pageEpoch) && Number(request.pageEpoch) !== current.pageEpoch) return false;
  if (request.movieId && current.movieId && String(request.movieId) !== current.movieId) return false;
  return true;
}

export function contextKey(context: Pick<PageContext, "pageKey" | "pageEpoch" | "movieId">): string {
  return `${context.pageKey}#${context.pageEpoch}:${context.movieId || "feed"}`;
}
