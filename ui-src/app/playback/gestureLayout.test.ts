import { describe, expect, it } from "vitest";
import { normalizePlaybackPreferences } from "./preferences";
import { gestureHoldAction, gestureSeekDirection, horizontalScrubSeconds } from "./gestureLayout";

describe("播放器左右手势布局", () => {
  it("标准布局保持左退右进", () => {
    expect(gestureSeekDirection("left", "standard")).toBe(-1);
    expect(gestureSeekDirection("right", "standard")).toBe(1);
    expect(gestureHoldAction("left", "standard")).toBe("rewind");
    expect(gestureHoldAction("right", "standard")).toBe("rate-forward");
  });

  it("镜像布局切换为左进右退", () => {
    expect(gestureSeekDirection("left", "mirrored")).toBe(1);
    expect(gestureSeekDirection("right", "mirrored")).toBe(-1);
    expect(gestureHoldAction("left", "mirrored")).toBe("rate-forward");
    expect(gestureHoldAction("right", "mirrored")).toBe("rewind");
  });

  it("镜像偏好可持久化且旧数据默认标准布局", () => {
    expect(normalizePlaybackPreferences({}).gestureLayout).toBe("standard");
    expect(normalizePlaybackPreferences({ gestureLayout: "mirrored" }).gestureLayout).toBe("mirrored");
  });

  it("镜像布局不改变横向滑动的时间方向", () => {
    expect(horizontalScrubSeconds(-100, 400, 1_200)).toBeLessThan(0);
    expect(horizontalScrubSeconds(100, 400, 1_200)).toBeGreaterThan(0);
  });
});
