import type { FullDetail } from "../types";

export type PlaybackPhase =
  | "idle"
  | "resolving"
  | "ready"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "switching"
  | "ended"
  | "error";

export type PlaybackSourceHealthState = "unknown" | "probing" | "healthy" | "degraded" | "failed";

export type PlaybackSourceHealth = {
  state: PlaybackSourceHealthState;
  status?: number;
  latencyMs?: number;
  segments?: number;
  duration?: number;
  score?: number;
  error?: string;
  checkedAt?: string;
};

export type PlaybackSource = {
  id: "primary" | "backup" | string;
  label: string;
  url: string;
  protocol: "hls" | "progressive" | "unknown";
  role?: "primary" | "backup" | "alternate";
  health: PlaybackSourceHealth;
  media?: {
    durationSeconds?: number;
    container?: "mpeg-ts" | "fmp4" | "progressive" | "unknown";
    live?: boolean;
    audioMode?: "muxed" | "separate" | "unknown";
    variants?: Array<{
      id: string;
      label: string;
      width?: number;
      height?: number;
      bandwidth?: number;
      url: string;
      estimatedBytes?: number;
    }>;
  };
};

export type PlaybackDecision = {
  recommendedSourceId: string;
  reasonCodes: string[];
  failoverAllowed: boolean;
  policyVersion?: string;
};

export type PlaybackAcquisition = {
  mode: "cache" | "direct" | "purchased" | "legacy";
  attempts: number;
  failed?: { accountId?: string; label?: string; stage?: string; code?: string; message: string }[];
  purchase?: {
    status: "pending" | "charged" | "resolved" | "failed_before_charge" | "uncertain";
    accountId?: string;
    price?: number;
  };
};

export type PlaybackSession = {
  id: string;
  revision?: string;
  movieId: string;
  title: string;
  phase: "ready";
  sources: PlaybackSource[];
  decision: PlaybackDecision;
  account?: { id?: string; label?: string };
  acquisition: PlaybackAcquisition;
  fetchedAt: string;
  expiresAt: string;
};

export type ScreeningState = {
  schemaVersion: 2;
  activeSession: PlaybackSession | null;
  history: PlaybackSession[];
  request: {
    phase: "idle" | "resolving" | "error";
    requestId?: string;
    movieId?: string;
    error?: string;
    startedAt?: string;
  };
};

export type PlaybackRuntimeState = {
  generation: number;
  phase: PlaybackPhase;
  session: PlaybackSession | null;
  activeSourceId: string;
  attemptedSourceIds: string[];
  fatalErrorTimes: number[];
  networkRecoveryUsed: boolean;
  mediaRecoveryUsed: boolean;
  sourceRecovery: Record<string, {
    fatalErrorTimes: number[];
    networkRecoveryUsed: boolean;
    mediaRecoveryUsed: boolean;
  }>;
  error: string;
  switchReason: string;
};

export type PlaybackRuntimeAction =
  | { type: "SESSION_REQUESTED"; generation: number }
  | { type: "SESSION_READY"; generation: number; session: PlaybackSession }
  | { type: "SESSION_METADATA_UPDATED"; generation: number; session: PlaybackSession }
  | { type: "SOURCE_LOADING"; generation: number; sourceId: string; switching?: boolean; reason?: string }
  | { type: "PLAYING"; generation: number }
  | { type: "PAUSED"; generation: number }
  | { type: "BUFFERING"; generation: number }
  | { type: "ENDED"; generation: number }
  | { type: "FATAL_ERROR"; generation: number; at: number; message: string }
  | { type: "RECOVERY_USED"; generation: number; kind: "network" | "media" }
  | { type: "STABLE"; generation: number }
  | { type: "FAILED"; generation: number; message: string }
  | { type: "RESET"; generation: number };

export type LegacyPlaybackDetail = FullDetail & {
  accountId?: string;
  rotation?: { tried?: number; failed?: { accountId?: string; label?: string; stage?: string; error?: string }[] };
};
