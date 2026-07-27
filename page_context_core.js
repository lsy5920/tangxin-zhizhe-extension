(function installTxzzPageContextCore(global) {
  "use strict";

  if (global.TxzzPageContextCore) return;

  const MOVIE_ID_KEYS = ["id", "movie_id", "movieId", "vid", "videoId"];

  function cleanMovieId(value) {
    const text = String(value == null ? "" : value).trim();
    return /^\d+$/.test(text) ? text : "";
  }

  function movieIdFromRecord(value) {
    if (!value || typeof value !== "object") return cleanMovieId(value);
    for (const key of MOVIE_ID_KEYS) {
      const id = cleanMovieId(value[key]);
      if (id) return id;
    }
    return "";
  }

  /**
   * DOM 活动卡片与活动播放器比列表级 playerInfo 更接近用户当前看到的画面。
   * 只有高置信证据缺失时才允许 playerInfo 单独兜底，避免 Swiper 刚切换时锁到上一条。
   */
  function resolveVlogMovieId(evidence) {
    const activeDetailId = evidence && evidence.activeDetailEnabled !== false
      ? cleanMovieId(evidence.activeDetailId || movieIdFromRecord(evidence.activeDetail))
      : "";
    const activeSlideId = cleanMovieId(evidence && evidence.activeSlideId);
    const activePlayerId = cleanMovieId(evidence && evidence.activePlayerId);
    const markedActiveId = cleanMovieId(evidence && evidence.markedActiveId);
    const listId = cleanMovieId(evidence && (evidence.listId || movieIdFromRecord(evidence.listPlayerInfo)));
    const strong = [activeSlideId, activeDetailId, activePlayerId, markedActiveId].filter(Boolean);
    const counts = new Map();
    for (const id of strong) counts.set(id, (counts.get(id) || 0) + 1);
    const consensus = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (consensus && consensus[1] >= 2) return { movieId: consensus[0], confidence: "confirmed" };
    if (strong.length === 1) {
      return {
        movieId: strong[0],
        confidence: strong[0] === listId ? "confirmed" : "active-dom"
      };
    }
    if (strong.length > 1 && listId && strong.includes(listId)) {
      return { movieId: listId, confidence: "confirmed" };
    }
    if (strong.length > 1) return { movieId: "", confidence: "transitioning" };
    return listId
      ? { movieId: listId, confidence: "list-fallback" }
      : { movieId: "", confidence: "transitioning" };
  }

  /**
   * Vlog 切片会短暂观察到空 ID。空值不能覆盖最后稳定 ID，也不能把旧请求当成当前请求；
   * 等新 ID 确认后再递增 epoch，旧请求即可被统一隔离。
   */
  function reconcileContext(previous, input) {
    const pageKey = String(input && input.pageKey || "");
    const candidateMovieId = cleanMovieId(input && input.movieId);
    const isVlog = Boolean(input && input.isVlog);
    const previousKey = String(previous && previous.pageKey || "");
    const previousMovieId = cleanMovieId(previous && previous.movieId);
    const previousEpoch = Number(previous && previous.pageEpoch || 0);
    const routeChanged = Boolean(previousKey && previousKey !== pageKey);
    const transitioning = isVlog && !candidateMovieId;
    const stableMovieId = transitioning ? previousMovieId : candidateMovieId;
    const movieChanged = Boolean(
      isVlog
      && !routeChanged
      && previousMovieId
      && candidateMovieId
      && previousMovieId !== candidateMovieId
    );
    return {
      pageKey,
      pageEpoch: previousEpoch + (routeChanged || movieChanged ? 1 : 0),
      movieId: stableMovieId,
      transitioning,
      changed: routeChanged || movieChanged,
      routeChanged,
      movieChanged
    };
  }

  function isCurrentRequest(current, request, isVlog) {
    if (!current || !request || request.active === false) return false;
    if (request.pageKey && String(request.pageKey) !== String(current.pageKey || "")) return false;
    if (Number.isFinite(Number(request.pageEpoch)) && Number(request.pageEpoch) !== Number(current.pageEpoch || 0)) return false;
    if (isVlog && current.transitioning) return false;
    const requestMovieId = cleanMovieId(request.movieId);
    const currentMovieId = cleanMovieId(current.movieId);
    if (isVlog) return Boolean(requestMovieId && currentMovieId && requestMovieId === currentMovieId);
    return !requestMovieId || !currentMovieId || requestMovieId === currentMovieId;
  }

  global.TxzzPageContextCore = Object.freeze({
    cleanMovieId,
    movieIdFromRecord,
    resolveVlogMovieId,
    reconcileContext,
    isCurrentRequest
  });
})(globalThis);
