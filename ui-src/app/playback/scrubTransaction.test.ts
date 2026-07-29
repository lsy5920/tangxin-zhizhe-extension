import { describe, expect, it } from "vitest";
import { beginScrubTransaction, settleScrubTransaction, updateScrubTransaction } from "./scrubTransaction";

const playingSnapshot = {
  currentTime: 42,
  duration: 300,
  bufferedEnd: 60,
  paused: false,
  volume: 0.8,
  muted: false,
  rate: 1
};

describe("进度预览事务", () => {
  it("移动只更新预览目标，松手才生成正式提交", () => {
    const started = beginScrubTransaction(null, playingSnapshot, 7, 1);
    const moved = updateScrubTransaction(started, 180, 7);

    expect(moved).toMatchObject({ originTime: 42, targetTime: 180, wasPlaying: true, phase: "active" });
    expect(settleScrubTransaction(moved, "commit", 181, 7)).toMatchObject({
      targetTime: 181,
      resumePlayback: true,
      committed: true
    });
  });

  it("取消恢复手势起点，旧媒体代次不能完成新事务", () => {
    const started = beginScrubTransaction(null, { ...playingSnapshot, paused: true }, 11, 2);
    const moved = updateScrubTransaction(started, 250, 11);

    expect(settleScrubTransaction(moved, "cancel", 250, 11)).toMatchObject({
      targetTime: 42,
      resumePlayback: false,
      committed: false
    });
    expect(updateScrubTransaction(started, 90, 12)).toBeNull();
    expect(settleScrubTransaction(started, "commit", 90, 12)).toBeNull();
  });

  it("滑回起点仍会完成事务并恢复开始时的播放语义", () => {
    const started = beginScrubTransaction(null, playingSnapshot, 13, 3);
    const moved = updateScrubTransaction(started, 120, 13);
    const returned = updateScrubTransaction(moved, playingSnapshot.currentTime, 13);

    expect(settleScrubTransaction(returned, "commit", playingSnapshot.currentTime, 13)).toMatchObject({
      targetTime: playingSnapshot.currentTime,
      resumePlayback: true,
      committed: true,
      transaction: { phase: "settling" }
    });
  });
});
