import type { MediaSnapshot } from "./mediaKernel";

export type ScrubTransaction = {
  id: number;
  generation: number;
  originTime: number;
  targetTime: number;
  wasPlaying: boolean;
  phase: "active" | "settling";
};

export type ScrubSettlement = {
  transaction: ScrubTransaction;
  targetTime: number;
  resumePlayback: boolean;
  committed: boolean;
};

function safeTime(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 拖动预览与正式播放进度必须是两套状态。事务保存手势开始时的真实快照，
 * 这样 pointercancel、切线和迟到事件都不能把“看过的预览点”误当成播放进度。
 */
export function beginScrubTransaction(
  current: ScrubTransaction | null,
  snapshot: MediaSnapshot,
  generation: number,
  id: number
): ScrubTransaction {
  if (current?.phase === "active" && current.generation === generation) return current;
  const originTime = safeTime(snapshot.currentTime);
  return {
    id,
    generation,
    originTime,
    targetTime: originTime,
    wasPlaying: snapshot.paused === false,
    phase: "active"
  };
}

export function updateScrubTransaction(
  transaction: ScrubTransaction | null,
  targetTime: number,
  generation: number
): ScrubTransaction | null {
  if (!transaction || transaction.phase !== "active" || transaction.generation !== generation) return null;
  return { ...transaction, targetTime: safeTime(targetTime) };
}

export function settleScrubTransaction(
  transaction: ScrubTransaction | null,
  mode: "commit" | "cancel",
  targetTime: number,
  generation: number
): ScrubSettlement | null {
  if (!transaction || transaction.phase !== "active" || transaction.generation !== generation) return null;
  const committed = mode === "commit";
  const settledTarget = committed ? safeTime(targetTime) : transaction.originTime;
  return {
    transaction: { ...transaction, targetTime: settledTarget, phase: "settling" },
    targetTime: settledTarget,
    resumePlayback: transaction.wasPlaying,
    committed
  };
}
