import { describe, expect, it } from "vitest";
import { nextFailoverSource, selectRecommendedSource, shouldFailover } from "./sourcePolicy";
import type { PlaybackSession, PlaybackSource } from "./types";

const primary: PlaybackSource = { id: "primary", label: "主线路", url: "https://a.test/a.m3u8", protocol: "hls", health: { state: "healthy", latencyMs: 700 } };
const backup: PlaybackSource = { id: "backup", label: "备用线路", url: "https://b.test/b.m3u8", protocol: "hls", health: { state: "healthy", latencyMs: 80 } };

it("健康且更快的备用线路可以成为推荐线路，平分时主线优先", () => {
  expect(selectRecommendedSource([primary, backup])?.id).toBe("backup");
  expect(selectRecommendedSource([{ ...primary, health: { state: "unknown" } }, { ...backup, health: { state: "unknown" } }])?.id).toBe("primary");
});

it("按每个视频主备清单的相对覆盖时长选择完整版", () => {
  const shortPrimary: PlaybackSource = {
    ...primary,
    health: { state: "healthy", duration: 17 * 60, segments: 170, latencyMs: 30 }
  };
  const fullBackup: PlaybackSource = {
    ...backup,
    health: { state: "healthy", duration: 60 * 60, segments: 600, latencyMs: 900 }
  };
  expect(selectRecommendedSource([shortPrimary, fullBackup])?.id).toBe("backup");

  // 几秒钟的转码误差不属于截短，仍按健康度和延迟决策。
  expect(selectRecommendedSource([
    { ...shortPrimary, health: { ...shortPrimary.health, duration: 3_590 } },
    { ...fullBackup, health: { ...fullBackup.health, duration: 3_600 } }
  ])?.id).toBe("primary");
});

describe("故障切换", () => {
  const session: PlaybackSession = {
    id: "s", movieId: "1", title: "t", phase: "ready", sources: [primary, backup],
    decision: { recommendedSourceId: "primary", reasonCodes: [], failoverAllowed: true },
    acquisition: { mode: "direct", attempts: 1 }, fetchedAt: "", expiresAt: ""
  };

  it("8 秒起播超时或 30 秒内三次致命错误才触发切线", () => {
    expect(shouldFailover({ startupElapsedMs: 7_999, fatalErrorTimes: [1, 2] })).toBe(false);
    expect(shouldFailover({ startupElapsedMs: 8_000, fatalErrorTimes: [] })).toBe(true);
    expect(shouldFailover({ fatalErrorTimes: [1, 2, 3] })).toBe(true);
  });

  it("每条线路每个会话只自动尝试一次", () => {
    expect(nextFailoverSource(session, "primary", ["primary"])?.id).toBe("backup");
    expect(nextFailoverSource(session, "primary", ["primary", "backup"])).toBeNull();
  });
});
