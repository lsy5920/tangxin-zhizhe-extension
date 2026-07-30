import { describe, expect, it } from "vitest";
import type { PlaybackSession, ScreeningState } from "../playback/types";
import { buildCinemaPlaybackViewModel } from "./playbackViewModel";

function session(movieId: string, id = `session-${movieId}`, fetchedAt = "2026-07-30T00:00:00Z"): PlaybackSession {
  return {
    id,
    movieId,
    title: `影片 ${movieId}`,
    phase: "ready",
    sources: [],
    decision: { recommendedSourceId: "", reasonCodes: [], failoverAllowed: false },
    acquisition: { mode: "direct", attempts: 1 },
    fetchedAt,
    expiresAt: "2026-07-31T00:00:00Z"
  };
}

function screening(activeSession: PlaybackSession | null, history: PlaybackSession[] = []): ScreeningState {
  return { schemaVersion: 2, activeSession, history, request: { phase: "idle" } };
}

describe("cinema playback view model", () => {
  it("selects only a session matching the route", () => {
    const view = buildCinemaPlaybackViewModel(screening(session("100"), [session("200")]), "200");
    expect(view.session?.movieId).toBe("200");
  });

  it("keeps the current same-movie session visible during a refresh", () => {
    const state = screening(session("100"));
    state.request = { phase: "resolving", movieId: "100", movieTitle: "新检票" };
    const view = buildCinemaPlaybackViewModel(state, "100");
    expect(view.session?.movieId).toBe("100");
    expect(view.resolving).toBe(true);
  });

  it("does not leak the previous active movie into a new route", () => {
    const state = screening(session("100"));
    state.request = { phase: "resolving", movieId: "200", movieTitle: "影片 200" };
    const view = buildCinemaPlaybackViewModel(state, "200");
    expect(view.session).toBeNull();
    expect(view.resolving).toBe(true);
  });
});
