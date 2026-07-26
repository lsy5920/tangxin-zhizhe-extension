import { describe, expect, it } from "vitest";
import { createPlaybackRuntimeState, playbackSessionReducer } from "./sessionReducer";
import type { PlaybackSession } from "./types";

const session: PlaybackSession = {
  id: "session-1",
  movieId: "9527",
  title: "测试影片",
  phase: "ready",
  sources: [{ id: "primary", label: "主线路", url: "https://media.test/a.m3u8", protocol: "hls", health: { state: "healthy" } }],
  decision: { recommendedSourceId: "primary", reasonCodes: ["healthy"], failoverAllowed: false },
  acquisition: { mode: "direct", attempts: 1 },
  fetchedAt: "2026-07-26T00:00:00.000Z",
  expiresAt: "2026-07-26T00:10:00.000Z"
};

describe("playbackSessionReducer", () => {
  it("按单一状态机推进且忽略旧代次事件", () => {
    let state = playbackSessionReducer(createPlaybackRuntimeState(), { type: "SESSION_REQUESTED", generation: 1 });
    state = playbackSessionReducer(state, { type: "SESSION_READY", generation: 1, session });
    state = playbackSessionReducer(state, { type: "SOURCE_LOADING", generation: 1, sourceId: "primary" });
    state = playbackSessionReducer(state, { type: "PLAYING", generation: 1 });
    expect(state.phase).toBe("playing");
    const stale = playbackSessionReducer(state, { type: "FAILED", generation: 0, message: "旧错误" });
    expect(stale).toBe(state);
  });

  it("只记录一次已尝试线路并在稳定播放后清理恢复计数", () => {
    let state = playbackSessionReducer({ ...createPlaybackRuntimeState(2), session }, { type: "SOURCE_LOADING", generation: 2, sourceId: "primary" });
    state = playbackSessionReducer(state, { type: "SOURCE_LOADING", generation: 2, sourceId: "primary" });
    state = playbackSessionReducer(state, { type: "FATAL_ERROR", generation: 2, at: 10_000, message: "网络错误" });
    state = playbackSessionReducer(state, { type: "RECOVERY_USED", generation: 2, kind: "network" });
    expect(state.attemptedSourceIds).toEqual(["primary"]);
    expect(state.networkRecoveryUsed).toBe(true);
    state = playbackSessionReducer(state, { type: "STABLE", generation: 2 });
    expect(state.fatalErrorTimes).toEqual([]);
    expect(state.networkRecoveryUsed).toBe(false);
  });

  it("网络与媒体恢复各自只记录一次，旧 HLS 事件不能污染新会话", () => {
    let state = playbackSessionReducer(createPlaybackRuntimeState(3), { type: "SESSION_READY", generation: 3, session });
    state = playbackSessionReducer(state, { type: "RECOVERY_USED", generation: 3, kind: "network" });
    state = playbackSessionReducer(state, { type: "RECOVERY_USED", generation: 3, kind: "media" });
    expect(state.networkRecoveryUsed).toBe(true);
    expect(state.mediaRecoveryUsed).toBe(true);
    const current = playbackSessionReducer(state, { type: "SESSION_REQUESTED", generation: 4 });
    const stale = playbackSessionReducer(current, { type: "FATAL_ERROR", generation: 3, at: 99_000, message: "旧 HLS 错误" });
    expect(stale.fatalErrorTimes).toEqual([]);
    expect(stale.phase).toBe("resolving");
  });
});
