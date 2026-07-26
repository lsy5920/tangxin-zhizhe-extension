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
    case "SOURCE_LOADING":
      return {
        ...state,
        phase: action.switching ? "switching" : "loading",
        activeSourceId: action.sourceId,
        attemptedSourceIds: state.attemptedSourceIds.includes(action.sourceId)
          ? state.attemptedSourceIds
          : [...state.attemptedSourceIds, action.sourceId],
        switchReason: action.reason || "",
        error: ""
      };
    case "PLAYING":
      return { ...state, phase: "playing", error: "" };
    case "PAUSED":
      return { ...state, phase: "paused" };
    case "BUFFERING":
      return { ...state, phase: "buffering" };
    case "ENDED":
      return { ...state, phase: "ended" };
    case "FATAL_ERROR":
      return {
        ...state,
        fatalErrorTimes: [...state.fatalErrorTimes.filter((time) => action.at - time <= 30_000), action.at],
        error: action.message
      };
    case "RECOVERY_USED":
      return action.kind === "network"
        ? { ...state, networkRecoveryUsed: true }
        : { ...state, mediaRecoveryUsed: true };
    case "STABLE":
      return {
        ...state,
        fatalErrorTimes: [],
        networkRecoveryUsed: false,
        mediaRecoveryUsed: false,
        error: ""
      };
    case "FAILED":
      return { ...state, phase: "error", error: action.message };
    default:
      return state;
  }
}
