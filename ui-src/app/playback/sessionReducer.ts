import type { PlaybackRuntimeAction, PlaybackRuntimeState } from "./types";

export function createPlaybackRuntimeState(generation = 0): PlaybackRuntimeState {
  return {
    generation,
    phase: "idle",
    session: null,
    activeSourceId: "",
    attemptedSourceIds: [],
    fatalErrorTimes: [],
    networkRecoveryUsed: false,
    mediaRecoveryUsed: false,
    sourceRecovery: {},
    error: "",
    switchReason: ""
  };
}

function stale(state: PlaybackRuntimeState, action: PlaybackRuntimeAction) {
  return !["RESET", "SESSION_REQUESTED"].includes(action.type) && action.generation !== state.generation;
}

export function playbackSessionReducer(
  state: PlaybackRuntimeState,
  action: PlaybackRuntimeAction
): PlaybackRuntimeState {
  if (stale(state, action)) return state;

  switch (action.type) {
    case "RESET":
      return createPlaybackRuntimeState(action.generation);
    case "SESSION_REQUESTED":
      return { ...createPlaybackRuntimeState(action.generation), phase: "resolving" };
    case "SESSION_READY":
      return {
        ...createPlaybackRuntimeState(action.generation),
        phase: "ready",
        session: action.session,
        activeSourceId: action.session.decision.recommendedSourceId
      };
    case "SESSION_METADATA_UPDATED":
      return { ...state, session: action.session };
    case "SOURCE_LOADING":
      {
        const recovery = state.sourceRecovery[action.sourceId] || {
          fatalErrorTimes: [],
          networkRecoveryUsed: false,
          mediaRecoveryUsed: false
        };
      return {
        ...state,
        phase: action.switching ? "switching" : "loading",
        activeSourceId: action.sourceId,
        attemptedSourceIds: state.attemptedSourceIds.includes(action.sourceId)
          ? state.attemptedSourceIds
          : [...state.attemptedSourceIds, action.sourceId],
        fatalErrorTimes: recovery.fatalErrorTimes,
        networkRecoveryUsed: recovery.networkRecoveryUsed,
        mediaRecoveryUsed: recovery.mediaRecoveryUsed,
        switchReason: action.reason || "",
        error: ""
      };
      }
    case "PLAYING":
      return { ...state, phase: "playing", error: "" };
    case "PAUSED":
      return { ...state, phase: "paused" };
    case "BUFFERING":
      return { ...state, phase: "buffering" };
    case "ENDED":
      return { ...state, phase: "ended" };
    case "FATAL_ERROR":
      {
        const fatalErrorTimes = [...state.fatalErrorTimes.filter((time) => action.at - time <= 30_000), action.at];
        const recovery = {
          fatalErrorTimes,
          networkRecoveryUsed: state.networkRecoveryUsed,
          mediaRecoveryUsed: state.mediaRecoveryUsed
        };
        return {
        ...state,
        fatalErrorTimes,
        sourceRecovery: state.activeSourceId
          ? { ...state.sourceRecovery, [state.activeSourceId]: recovery }
          : state.sourceRecovery,
        error: action.message
      };
      }
    case "RECOVERY_USED":
      {
        const recovery = {
          fatalErrorTimes: state.fatalErrorTimes,
          networkRecoveryUsed: action.kind === "network" ? true : state.networkRecoveryUsed,
          mediaRecoveryUsed: action.kind === "media" ? true : state.mediaRecoveryUsed
        };
        return {
          ...state,
          networkRecoveryUsed: recovery.networkRecoveryUsed,
          mediaRecoveryUsed: recovery.mediaRecoveryUsed,
          sourceRecovery: state.activeSourceId
            ? { ...state.sourceRecovery, [state.activeSourceId]: recovery }
            : state.sourceRecovery
        };
      }
    case "STABLE":
      {
        const cleared = { fatalErrorTimes: [], networkRecoveryUsed: false, mediaRecoveryUsed: false };
        return {
        ...state,
        fatalErrorTimes: [],
        networkRecoveryUsed: false,
        mediaRecoveryUsed: false,
        sourceRecovery: state.activeSourceId
          ? { ...state.sourceRecovery, [state.activeSourceId]: cleared }
          : state.sourceRecovery,
        error: ""
      };
      }
    case "FAILED":
      return { ...state, phase: "error", error: action.message };
    default:
      return state;
  }
}
