import { describe, expect, it } from "vitest";
import { resolveStageMediaOrientation } from "./stageLayout";

describe("放映舞台方向策略", () => {
  it("优先尊重用户明确选择", () => {
    expect(resolveStageMediaOrientation("vertical", 1920, 1080).orientation).toBe("portrait");
    expect(resolveStageMediaOrientation("wide", 1080, 1920).orientation).toBe("landscape");
  });

  it("自动模式使用真实视频尺寸识别 9:16", () => {
    expect(resolveStageMediaOrientation("auto", 1080, 1920)).toEqual({ orientation: "portrait", source: "video" });
    expect(resolveStageMediaOrientation("auto", 1920, 1080)).toEqual({ orientation: "landscape", source: "video" });
  });

  it("metadata 未到达时使用清单变体并稳定回退", () => {
    expect(resolveStageMediaOrientation("auto", 0, 0, [
      { width: 720, height: 1280, bandwidth: 2_000_000 },
      { width: 360, height: 640, bandwidth: 700_000 }
    ])).toEqual({ orientation: "portrait", source: "manifest" });
    expect(resolveStageMediaOrientation("auto", 0, 0, [])).toEqual({ orientation: "landscape", source: "fallback" });
  });
});
