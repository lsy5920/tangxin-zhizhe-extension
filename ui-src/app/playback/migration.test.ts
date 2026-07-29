import { describe, expect, it } from "vitest";
import { mergeScreeningSession, normalizePlaybackSession, playbackSessionFromLegacy, reconcileScreeningState, screeningStateFromLegacy } from "./migration";
import type { PlaybackSession } from "./types";

describe("5.0 放映历史迁移", () => {
  it("首次升级把旧 fullDetails 合并为按视频编号保存的新历史", () => {
    const state = screeningStateFromLegacy([
      { movieId: "1", movieTitle: "旧电影票", playLink: "/a.m3u8", fetchedAt: "2026-07-01T00:00:00.000Z" },
      { movieId: "2", movieTitle: "备用电影票", backupLink: "/b.mp4", fetchedAt: "2026-07-02T00:00:00.000Z" }
    ]);
    expect(state.schemaVersion).toBe(2);
    expect(state.history.map((item) => item.movieId)).toEqual(["1", "2"]);
    expect(state.activeSession?.movieId).toBe("2");
    expect(state.history[0].sources[0].protocol).toBe("hls");
  });

  it("新会话替换同影片旧记录而不影响其他历史", () => {
    const old = playbackSessionFromLegacy({ movieId: "1", playLink: "/old.m3u8", fetchedAt: "2026-07-01T00:00:00.000Z" });
    const next: PlaybackSession = {
      id: "new",
      movieId: "1",
      title: "刷新后的电影票",
      phase: "ready",
      sources: [{ id: "primary", label: "主线路", url: "https://example.com/new.m3u8", protocol: "hls", health: { state: "healthy" } }],
      decision: { recommendedSourceId: "primary", reasonCodes: ["healthy-source"], failoverAllowed: false },
      acquisition: { mode: "direct", attempts: 1 },
      fetchedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2026-07-27T00:10:00.000Z"
    };
    const state = mergeScreeningSession({
      schemaVersion: 2,
      activeSession: old,
      history: old ? [old, { ...next, id: "other", movieId: "2" }] : [],
      request: { phase: "resolving" }
    }, next);
    expect(state.history.map((item) => item.id)).toEqual(["other", "new"]);
    expect(state.request.phase).toBe("idle");
  });

  it("正式构建先写入空会话后会用后到的旧详情线路修复", () => {
    const empty: PlaybackSession = {
      id: "early-build",
      movieId: "35778",
      title: "视频 35778",
      phase: "ready",
      sources: [],
      decision: { recommendedSourceId: "", reasonCodes: ["legacy-migration"], failoverAllowed: false },
      acquisition: { mode: "legacy", attempts: 1 },
      fetchedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2026-07-27T00:10:00.000Z"
    };
    const repaired = reconcileScreeningState({
      schemaVersion: 2,
      activeSession: empty,
      history: [empty],
      request: { phase: "idle" }
    }, [{
      movieId: "35778",
      movieTitle: "真实影片",
      playLink: "https://media.example/35778.m3u8",
      fetchedAt: "2026-07-27T00:01:00.000Z"
    }]);
    expect(repaired.activeSession?.sources[0].url).toBe("https://media.example/35778.m3u8");
    expect(repaired.history).toHaveLength(1);
  });

  it("补齐旧会话缺失的 acquisition 与 decision 契约", () => {
    const normalized = normalizePlaybackSession({
      id: "partial",
      movieId: "9527",
      title: "旧缓存会话",
      phase: "ready",
      sources: []
    } as unknown as PlaybackSession);
    expect(normalized?.acquisition).toMatchObject({ mode: "direct", attempts: 1 });
    expect(normalized?.decision).toMatchObject({ recommendedSourceId: "", failoverAllowed: false });
  });
});
