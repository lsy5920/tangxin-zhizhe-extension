import { afterEach, describe, expect, it, vi } from "vitest";

await import("../../../download_core.js");

type DownloadControl = {
  taskId: string;
  attemptId: string;
  paused: boolean;
  cancelled: boolean;
  resumeWaiters: Array<() => void>;
  activeControllers: Set<{ abort: () => void }>;
};

type DownloaderHooks = {
  cancelTask: (taskId: string, attemptId: string) => { ok: boolean };
  clearTasks: () => void;
  createControl: (message: Record<string, unknown>) => DownloadControl;
  pauseTask: (taskId: string, attemptId: string) => { ok: boolean };
  registerControl: (control: DownloadControl) => DownloadControl;
  resumeTask: (taskId: string, attemptId: string) => { ok: boolean };
  waitIfPaused: (control: DownloadControl) => Promise<void>;
};

const progressMessages: Array<Record<string, unknown>> = [];
Object.assign(globalThis, {
  __TXZZ_TEST__: true,
  chrome: {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(async (message: Record<string, unknown>) => {
        progressMessages.push(message);
        return { ok: true };
      })
    }
  }
});

await import("../../../offscreen_downloader.js");

const hooks = (globalThis as typeof globalThis & {
  TxzzOffscreenDownloaderTestHooks: DownloaderHooks;
}).TxzzOffscreenDownloaderTestHooks;

afterEach(() => {
  hooks.clearTasks();
  progressMessages.length = 0;
});

describe("offscreen download controls", () => {
  it("pauses a running attempt and wakes the same attempt on resume", async () => {
    const control = hooks.registerControl(hooks.createControl({ taskId: "task-1", attemptId: "attempt-1" }));
    expect(hooks.pauseTask("task-1", "attempt-1").ok).toBe(true);

    let resumed = false;
    const waiting = hooks.waitIfPaused(control).then(() => { resumed = true; });
    await Promise.resolve();
    expect(resumed).toBe(false);

    expect(hooks.resumeTask("task-1", "attempt-1").ok).toBe(true);
    await waiting;
    expect(resumed).toBe(true);
    expect(progressMessages.map((message) => message.stage)).toEqual(["paused", "recovering"]);
  });

  it("aborts active requests on cancel and rejects controls from an older attempt", async () => {
    const abort = vi.fn();
    const control = hooks.registerControl(hooks.createControl({ taskId: "task-2", attemptId: "attempt-new" }));
    control.activeControllers.add({ abort });

    expect(hooks.pauseTask("task-2", "attempt-old").ok).toBe(false);
    expect(hooks.cancelTask("task-2", "attempt-new").ok).toBe(true);
    expect(abort).toHaveBeenCalledOnce();
    expect(control.cancelled).toBe(true);
    await expect(hooks.waitIfPaused(control)).rejects.toMatchObject({ name: "AbortError" });
  });
});
