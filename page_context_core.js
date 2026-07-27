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
    // 同一 Vlog 页的短暂空值保留旧 ID；真正跨路由时不能把上一页影片带入新页。
    const stableMovieId = transitioning ? (routeChanged ? "" : previousMovieId) : candidateMovieId;
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

  /**
   * page_hook 运行在页面主世界，它才能读到 Vue 2 的 __vue__ 实例。
   * content script 位于隔离世界，只接受与当前 URL 一致、代次合法的主世界快照，
   * 避免它再次读不可见的 Vue 字段后把正常请求误判为预加载。
   */
  function normalizeAuthoritativeContext(payload, expectedPageKey = "") {
    if (!payload || typeof payload !== "object") return null;
    const pageKey = String(payload.pageKey || "");
    const expected = String(expectedPageKey || "");
    const pageEpoch = Number(payload.pageEpoch);
    const revision = Number(payload.contextRevision ?? payload.revision ?? 0);
    const movieId = cleanMovieId(payload.pageMovieId || payload.movieId);
    const transitioning = Boolean(payload.transitioning);
    if (!pageKey || (expected && pageKey !== expected)) return null;
    if (!Number.isInteger(pageEpoch) || pageEpoch < 0) return null;
    if (!Number.isInteger(revision) || revision < 0) return null;
    if (!movieId && !transitioning) return null;
    return { pageKey, pageEpoch, movieId, transitioning, contextRevision: revision };
  }

  /** 同一页面只接受单调递增的 epoch/revision，防止延迟消息把新卡片退回旧状态。 */
  function shouldAcceptAuthoritativeContext(previous, next) {
    if (!next) return false;
    if (!previous || String(previous.pageKey || "") !== String(next.pageKey || "")) return true;
    const previousEpoch = Number(previous.pageEpoch || 0);
    const nextEpoch = Number(next.pageEpoch || 0);
    if (nextEpoch < previousEpoch) return false;
    if (nextEpoch > previousEpoch) return true;
    const previousRevision = Number(previous.contextRevision || 0);
    const nextRevision = Number(next.contextRevision || 0);
    const previousMovieId = cleanMovieId(previous.movieId);
    const nextMovieId = cleanMovieId(next.movieId);
    // 稳定 ID 改变必须同时提升 epoch；仅初始空 ID → 首个稳定 ID 可保持 epoch。
    if (previousMovieId && nextMovieId && previousMovieId !== nextMovieId) return false;
    if (nextRevision < previousRevision) return false;
    if (nextRevision > previousRevision) return true;
    return previousMovieId === nextMovieId
      && Boolean(previous.transitioning) === Boolean(next.transitioning);
  }

  global.TxzzPageContextCore = Object.freeze({
    cleanMovieId,
    movieIdFromRecord,
    resolveVlogMovieId,
    reconcileContext,
    isCurrentRequest,
    normalizeAuthoritativeContext,
    shouldAcceptAuthoritativeContext
  });
})(globalThis);
