import type { PlaybackSession, ScreeningState } from "../playback/types";

export type CinemaPlaybackViewModel = {
  session: PlaybackSession | null;
  requestedMovieId: string;
  requestedTitle: string;
  resolving: boolean;
  routeMismatch: boolean;
};

/** 路由是独立影院播放页唯一的影片身份，历史仅用于恢复与该路由匹配的最近会话。 */
export function buildCinemaPlaybackViewModel(
  screening: ScreeningState,
  routeMovieId: unknown
): CinemaPlaybackViewModel {
  const routeId = String(routeMovieId || "").trim();
  const requestMovieId = String(screening.request?.movieId || "").trim();
  const requestedTitle = String(screening.request?.movieTitle || (requestMovieId ? `影片 ${requestMovieId}` : ""));
  const sessions = [screening.activeSession, ...(screening.history || [])]
    .filter((session): session is PlaybackSession => Boolean(session));
  const candidates = routeId ? sessions.filter((session) => session.movieId === routeId) : sessions;
  const session = [...candidates].sort((left, right) => {
    if (left.id === screening.activeSession?.id) return -1;
    if (right.id === screening.activeSession?.id) return 1;
    return (Date.parse(right.fetchedAt || "") || 0) - (Date.parse(left.fetchedAt || "") || 0);
  })[0] || null;
  const resolving = screening.request?.phase === "resolving"
    && Boolean(requestMovieId)
    && (!routeId || requestMovieId === routeId);
  return {
    session,
    requestedMovieId: requestMovieId,
    requestedTitle,
    resolving,
    routeMismatch: Boolean(routeId && requestMovieId && screening.request?.phase === "resolving" && requestMovieId !== routeId)
  };
}
