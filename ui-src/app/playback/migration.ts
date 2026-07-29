import { absoluteUrl } from "../helpers";
import { playbackProtocol, selectRecommendedSource, sourceHealthFromLegacy } from "./sourcePolicy";
import type { LegacyPlaybackDetail, PlaybackSession, PlaybackSource, ScreeningState } from "./types";

const ACQUISITION_MODES = new Set(["cache", "direct", "purchased", "legacy"]);

/**
 * Worker v2 正常会返回完整 acquisition，但旧缓存、升级中间态或异常兼容响应可能只有会话骨架。
 * 在进入页面与播放器前统一补齐契约，避免一次下载规划触发重渲染时因缺字段拖垮整个放映页。
 */
export function normalizePlaybackSession(session?: PlaybackSession | null): PlaybackSession | null {
  if (!session || !String(session.movieId || "").trim()) return null;
  const raw = session as PlaybackSession & Record<string, unknown>;
  const sources = Array.isArray(session.sources) ? session.sources : [];
  const acquisition = raw.acquisition && typeof raw.acquisition === "object"
    ? raw.acquisition as PlaybackSession["acquisition"]
    : null;
  const mode = ACQUISITION_MODES.has(String(acquisition?.mode || ""))
    ? acquisition?.mode as PlaybackSession["acquisition"]["mode"]
    : "direct";
  const attempts = Number(acquisition?.attempts || 1);
  const decision = raw.decision && typeof raw.decision === "object"
    ? raw.decision as PlaybackSession["decision"]
    : null;
  return {
    ...session,
    id: String(session.id || `session-${session.movieId}`),
    movieId: String(session.movieId),
    title: String(session.title || `视频 ${session.movieId}`),
    phase: "ready",
    sources,
    decision: {
      recommendedSourceId: String(decision?.recommendedSourceId || sources[0]?.id || ""),
      reasonCodes: Array.isArray(decision?.reasonCodes) ? decision.reasonCodes : ["normalized-session"],
      failoverAllowed: typeof decision?.failoverAllowed === "boolean" ? decision.failoverAllowed : sources.length > 1,
      ...(decision?.policyVersion ? { policyVersion: decision.policyVersion } : {})
    },
    acquisition: {
      ...(acquisition || {}),
      mode,
      attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 1
    },
    fetchedAt: String(session.fetchedAt || new Date(0).toISOString()),
    expiresAt: String(session.expiresAt || new Date(Date.now() + 10 * 60_000).toISOString())
  };
}

function legacySessionId(detail: LegacyPlaybackDetail, index: number) {
  const fetched = String(detail.fetchedAt || "legacy").replace(/[^0-9]/g, "").slice(0, 14) || String(index);
  return `legacy-${String(detail.movieId || "unknown")}-${fetched}`;
}

export function playbackSessionFromLegacy(detail: LegacyPlaybackDetail, index = 0): PlaybackSession | null {
  const movieId = String(detail.movieId || "").trim();
  if (!movieId) return null;
  const record = detail as LegacyPlaybackDetail & Record<string, unknown>;
  const firstLink = (...values: unknown[]) => String(values.find((value) => typeof value === "string" && value.trim()) || "");
  const playLink = firstLink(detail.playLink, record.play_link, record.play_url, record.playUrl, record.m3u8_url, record.m3u8, detail.fullStat?.url);
  const backupLink = firstLink(detail.backupLink, record.backup_link, record.backup_url, record.backupUrl, detail.backupStat?.url);
  const sources: PlaybackSource[] = [
    {
      id: "primary",
      label: "主线路",
      url: absoluteUrl(playLink),
      protocol: playbackProtocol(playLink),
      health: sourceHealthFromLegacy(detail.fullStat)
    },
    {
      id: "backup",
      label: "备用线路",
      url: absoluteUrl(backupLink),
      protocol: playbackProtocol(backupLink),
      health: sourceHealthFromLegacy(detail.backupStat)
    }
  ].filter((source) => source.url);
  const recommended = selectRecommendedSource(sources);
  const fetchedAt = String(detail.fetchedAt || new Date(0).toISOString());
  const failed = detail.rotation?.failed?.map((item) => ({
    accountId: item.accountId,
    label: item.label,
    stage: item.stage,
    message: item.error || "旧记录未提供失败说明"
  }));
  return {
    id: legacySessionId(detail, index),
    movieId,
    title: String(detail.movieTitle || detail.title || `视频 ${movieId}`),
    phase: "ready",
    sources,
    decision: {
      recommendedSourceId: recommended?.id || sources[0]?.id || "",
      reasonCodes: ["legacy-migration"],
      failoverAllowed: sources.length > 1
    },
    account: { label: detail.accountLabel || detail.accountUser || "旧版账号" },
    acquisition: { mode: "legacy", attempts: Number(detail.rotation?.tried || 1), failed },
    fetchedAt,
    expiresAt: new Date(new Date(fetchedAt).getTime() + 10 * 60_000).toISOString()
  };
}

export function screeningStateFromLegacy(details: LegacyPlaybackDetail[] = []): ScreeningState {
  const history = details
    .map(playbackSessionFromLegacy)
    .filter((item): item is PlaybackSession => Boolean(item))
    .slice(-80);
  return {
    schemaVersion: 2,
    activeSession: history[history.length - 1] || null,
    history,
    request: { phase: "idle" }
  };
}

/**
 * 早期 5.0 预构建可能先保存了空 sources 会话，随后 fullDetails 才拿到真实线路。
 * 每次渲染都做幂等修复，保证正式扩展与预览使用相同的完整结构。
 */
export function reconcileScreeningState(
  screening: ScreeningState | undefined,
  details: LegacyPlaybackDetail[] = []
): ScreeningState {
  const legacy = screeningStateFromLegacy(details);
  if (!screening) return legacy;
  const normalizedHistory = (Array.isArray(screening.history) ? screening.history : [])
    .map(normalizePlaybackSession)
    .filter((session): session is PlaybackSession => Boolean(session));
  const normalizedActive = normalizePlaybackSession(screening.activeSession);
  const byMovieId = new Map(normalizedHistory.map((session) => [session.movieId, session]));
  for (const session of legacy.history) {
    const existing = byMovieId.get(session.movieId);
    if (!existing || (!existing.sources.some((source) => source.url) && session.sources.some((source) => source.url))) {
      byMovieId.set(session.movieId, session);
    }
  }
  const history = [...byMovieId.values()].slice(-80);
  const requestedMovieId = normalizedActive?.movieId;
  const activeMatch = requestedMovieId ? byMovieId.get(requestedMovieId) : null;
  const activeSession = activeMatch?.sources.some((source) => source.url)
    ? activeMatch
    : normalizedActive?.sources.some((source) => source.url)
      ? normalizedActive
      : [...history].reverse().find((session) => session.sources.some((source) => source.url))
        || normalizedActive
        || history[history.length - 1]
        || null;
  return { ...screening, schemaVersion: 2, activeSession, history };
}

export function mergeScreeningSession(state: ScreeningState, session: PlaybackSession): ScreeningState {
  const history = state.history.filter((item) => item.movieId !== session.movieId);
  return {
    ...state,
    activeSession: session,
    history: [...history, session].slice(-80),
    request: { phase: "idle" }
  };
}
