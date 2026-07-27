import { describe, expect, it } from "vitest";

await import("../../state_mutation_core.js");

const core = (globalThis as typeof globalThis & {
  TxzzStateMutationCore: {
    bufferedDownloadEventIsStale: (buffered: Record<string, unknown> | null, message: Record<string, unknown>) => boolean;
    canTakeSaveTokenClaim: (record: Record<string, unknown>, claimant: string, active: boolean) => boolean;
    downloadEventStageChanged: (observed: Record<string, unknown> | null, message: Record<string, unknown>) => boolean;
    mergeConcurrentState: (base: unknown, incoming: unknown, current: unknown) => Record<string, unknown>;
    normalizeDownloadStage: (stage: string) => string;
    planPersistedDownloadRecovery: (tasks: Record<string, Record<string, unknown>>) => Array<{ task: Record<string, unknown>; action: string }>;
    validateDownloadEvent: (existing: Record<string, unknown> | null, message: Record<string, unknown>, deleted?: string[]) => { accepted: boolean; reason: string };
  };
}).TxzzStateMutationCore;

describe("serialized state mutation core", () => {
  it("merges concurrent account, download and playback changes without losing fields", () => {
    const base = {
      accountPool: [{ id: "a", status: "idle" }],
      downloadTasks: { task: { attemptId: "one", sequence: 1, percent: 10 } },
      screening: { activeSession: { id: "old" } }
    };
    const accountWrite = {
      ...base,
      accountPool: [{ id: "a", status: "verified" }]
    };
    const downloadWrite = {
      ...base,
      downloadTasks: { task: { attemptId: "one", sequence: 2, percent: 25 } }
    };
    const afterDownload = core.mergeConcurrentState(base, downloadWrite, base);
    const afterAccount = core.mergeConcurrentState(base, accountWrite, afterDownload) as typeof base;
    const playbackWrite = {
      ...base,
      screening: { activeSession: { id: "new" } }
    };
    const result = core.mergeConcurrentState(base, playbackWrite, afterAccount) as typeof base;

    expect(result.accountPool[0].status).toBe("verified");
    expect(result.downloadTasks.task).toMatchObject({ sequence: 2, percent: 25 });
    expect(result.screening.activeSession.id).toBe("new");
  });

  it("lets deletion win over late progress so cleared tasks cannot reappear", () => {
    const base = { downloadTasks: { task: { attemptId: "one", sequence: 1 } } };
    const deletion = { downloadTasks: {} };
    const lateProgress = { downloadTasks: { task: { attemptId: "one", sequence: 2 } } };
    const result = core.mergeConcurrentState(base, deletion, lateProgress) as typeof deletion;
    expect(result.downloadTasks).toEqual({});
  });

  it("rejects old attempts and non-monotonic events", () => {
    const existing = { taskId: "task", attemptId: "new", sequence: 8 };
    expect(core.validateDownloadEvent(existing, { taskId: "task", attemptId: "old", sequence: 99, stage: "downloading" }).reason).toBe("attempt-mismatch");
    expect(core.validateDownloadEvent(existing, { taskId: "task", attemptId: "new", sequence: 8, stage: "downloading" }).reason).toBe("stale-sequence");
    expect(core.validateDownloadEvent(existing, { taskId: "task", attemptId: "new", sequence: 9, stage: "segment" }).accepted).toBe(true);
    expect(core.normalizeDownloadStage("segment")).toBe("downloading");
  });

  it("recovers only resumable tasks and marks legacy tasks without attempt ids stale", () => {
    const plan = core.planPersistedDownloadRecovery({
      active: { taskId: "active", attemptId: "attempt-1", stage: "segments" },
      legacy: { taskId: "legacy", stage: "queued" },
      paused: { taskId: "paused", attemptId: "attempt-2", stage: "paused" },
      complete: { taskId: "complete", attemptId: "attempt-3", stage: "complete" }
    });
    expect(plan.map((item) => [item.task.taskId, item.action])).toEqual([
      ["active", "recover"],
      ["legacy", "stale"]
    ]);
  });

  it("keeps a live save-token claim exclusive but lets a closed tab hand it over", () => {
    const claimed = { claimedBy: "tab-1" };
    expect(core.canTakeSaveTokenClaim(claimed, "tab-1", true)).toBe(true);
    expect(core.canTakeSaveTokenClaim(claimed, "tab-2", true)).toBe(false);
    expect(core.canTakeSaveTokenClaim(claimed, "tab-2", false)).toBe(true);
  });

  it("compares buffered progress only within the same attempt generation", () => {
    const buffered = { attemptId: "old", sequence: 99, stage: "downloading" };
    expect(core.bufferedDownloadEventIsStale(buffered, { attemptId: "old", sequence: 98 })).toBe(true);
    expect(core.bufferedDownloadEventIsStale(buffered, { attemptId: "new", sequence: 1 })).toBe(false);
    expect(core.downloadEventStageChanged(buffered, { attemptId: "new", stage: "downloading" })).toBe(true);
    expect(core.downloadEventStageChanged(buffered, { attemptId: "old", stage: "segments" })).toBe(false);
  });
});
