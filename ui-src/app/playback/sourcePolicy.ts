import type { PlaybackSession, PlaybackSource, PlaybackSourceHealth } from "./types";

const FAILED_SCORE = -10_000;

export function playbackProtocol(url = ""): PlaybackSource["protocol"] {
  const value = String(url).toLowerCase();
  if (value.includes("m3u8")) return "hls";
  if (/\.(?:mp4|webm|m4v)(?:[?#]|$)/i.test(value)) return "progressive";
  return value ? "unknown" : "unknown";
}

export function sourceScore(source?: PlaybackSource | null) {
  if (!source?.url || source.health.state === "failed" || source.health.error) return FAILED_SCORE;
  const explicit = Number(source.health.score);
  if (Number.isFinite(explicit)) return explicit;

  let score = source.health.state === "healthy" ? 160 : source.health.state === "degraded" ? 80 : source.health.state === "probing" ? 35 : 20;
  const status = Number(source.health.status || 0);
  if (status >= 200 && status < 400) score += 40;
  else if (status > 0) score -= 80;
  score += Math.min(35, Number(source.health.segments || 0) / 4);
  score += Math.min(25, Number(source.health.duration || 0) / 30);
  const latency = Number(source.health.latencyMs || 0);
  if (latency > 0) score -= Math.min(30, latency / 100);
  return score;
}

export function selectRecommendedSource(sources: PlaybackSource[]) {
  return [...sources]
    .filter((source) => source.url)
    .sort((left, right) => {
      const scoreDiff = sourceScore(right) - sourceScore(left);
      if (scoreDiff) return scoreDiff;
      if (left.id === "primary") return -1;
      if (right.id === "primary") return 1;
      return left.id.localeCompare(right.id);
    })[0] || null;
}

export function nextFailoverSource(
  session: PlaybackSession | null,
  activeSourceId: string,
  attemptedSourceIds: string[]
) {
  if (!session?.decision.failoverAllowed) return null;
  return [...session.sources]
    .filter((source) => source.url && source.id !== activeSourceId && !attemptedSourceIds.includes(source.id))
    .sort((left, right) => sourceScore(right) - sourceScore(left))[0] || null;
}

export function shouldFailover(params: {
  startupElapsedMs?: number;
  fatalErrorTimes: number[];
  recoveryFailed?: boolean;
}) {
  return Number(params.startupElapsedMs || 0) >= 8_000
    || params.fatalErrorTimes.length >= 3
    || Boolean(params.recoveryFailed);
}

export function sourceHealthFromLegacy(stat?: {
  status?: number;
  latencyMs?: number;
  segments?: number;
  duration?: number;
  score?: number;
  error?: string;
  pending?: boolean;
} | null): PlaybackSourceHealth {
  if (!stat) return { state: "unknown" };
  return {
    state: stat.error ? "failed" : stat.pending ? "probing" : "healthy",
    status: stat.status,
    latencyMs: stat.latencyMs,
    segments: stat.segments,
    duration: stat.duration,
    score: stat.score,
    error: stat.error
  };
}

