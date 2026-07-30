import { describe, expect, it } from "vitest";

await import("../../experience_core.js");

const core = (globalThis as typeof globalThis & { TxzzExperienceCore: any }).TxzzExperienceCore;

describe("experience core", () => {
  it("keeps favorite and watch-later flags independent and searchable", () => {
    let state = core.defaultExperienceState();
    state = core.updateLibraryEntry(state, {
      movieId: "11634",
      title: "甜甜 Vlog",
      posterUrl: "https://cdn.example/11634.bnc?ext=.jpg",
      creator: "甜甜",
      durationSeconds: 3600,
      durationLabel: "1:00:00",
      orientation: "portrait",
      access: "vip",
      isCollection: true,
      favorite: true,
      tags: ["旅行"]
    }, 1);
    state = core.updateLibraryEntry(state, { movieId: "11634", watchLater: true, note: "周末看" }, 2);
    expect(core.selectLibrary(state, { keyword: "旅行" })).toHaveLength(1);
    expect(core.selectLibrary(state, { filter: "watchLater" })[0]).toMatchObject({ favorite: true, watchLater: true });
    expect(core.selectLibrary(state, { filter: "watchLater" })[0]).toMatchObject({
      posterUrl: "https://cdn.example/11634.bnc?ext=.jpg",
      durationSeconds: 3600,
      orientation: "portrait",
      access: "vip",
      isCollection: true
    });
    state = core.updateLibraryEntry(state, { movieId: "11634", favorite: false, watchLater: false }, 3);
    expect(core.selectLibrary(state, {})).toEqual([]);
  });

  it("orders bookmarks and validates A-B ranges without silently clamping invalid points", () => {
    let state = core.defaultExperienceState();
    state = core.addBookmark(state, { id: "b", movieId: "m", startSeconds: 30, durationSeconds: 60 }, 2);
    state = core.addBookmark(state, { id: "a", movieId: "m", startSeconds: 10, endSeconds: 20, durationSeconds: 60 }, 1);
    expect(state.bookmarks.m.map((item: any) => item.id)).toEqual(["a", "b"]);
    expect(core.validateLoopRange(10, 10.5, 60).ok).toBe(false);
    expect(core.validateLoopRange(10, 70, 60).reason).toContain("超过");
    expect(core.validateLoopRange(10, 20, 60)).toMatchObject({ ok: true, startSeconds: 10, endSeconds: 20 });
    expect(() => core.addBookmark(state, { id: "bad", movieId: "m", startSeconds: 10, endSeconds: 10.5, durationSeconds: 60 }, 3)).toThrow("至少");
  });

  it("selects due downloads by priority and respects concurrency and overnight windows", () => {
    const tasks = {
      active: { taskId: "active", stage: "downloading" },
      low: { taskId: "low", stage: "queued", priority: "low", createdAt: "2026-01-01T00:00:00Z" },
      high: { taskId: "high", stage: "queued", priority: "high", createdAt: "2026-01-02T00:00:00Z" },
      future: { taskId: "future", stage: "queued", priority: "high", notBefore: "2099-01-01T00:00:00Z" }
    };
    expect(core.selectDueDownloads(tasks, { maxConcurrent: 2 }, Date.parse("2026-01-03T00:00:00Z")).map((item: any) => item.taskId)).toEqual(["high"]);
    const night = new Date(2026, 0, 1, 23, 0).getTime();
    const noon = new Date(2026, 0, 1, 12, 0).getTime();
    expect(core.withinDownloadWindow({ windowEnabled: true, windowStart: "22:00", windowEnd: "06:00" }, night)).toBe(true);
    expect(core.withinDownloadWindow({ windowEnabled: true, windowStart: "22:00", windowEnd: "06:00" }, noon)).toBe(false);
  });

  it("rebuilds the next alarm for future tasks and the next allowed window", () => {
    const now = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
    const tasks = { due: { taskId: "due", stage: "queued" } };
    const wakeAt = core.nextDownloadAlarmAt(tasks, { windowEnabled: true, windowStart: "22:00", windowEnd: "06:00" }, now);
    expect(new Date(wakeAt).getHours()).toBe(22);
    expect(core.nextDownloadAlarmAt(tasks, { windowEnabled: false }, now)).toBe(0);
    const future = new Date(2026, 0, 2, 8, 0, 0, 0).toISOString();
    const delayed = core.nextDownloadAlarmAt({ future: { stage: "queued", notBefore: future } }, { windowEnabled: true, windowStart: "22:00", windowEnd: "06:00" }, now);
    expect(new Date(delayed).getDate()).toBe(2);
    expect(new Date(delayed).getHours()).toBe(22);
  });

  it("applies network backoff and credential attention rules", () => {
    let record: any = { accountId: "account" };
    record = core.applyHealthResult(record, { accountId: "account", ok: false, category: "network", reason: "timeout" }, 0);
    expect(record).toMatchObject({ state: "degraded", consecutiveFailures: 1, cooldownUntil: "" });
    record = core.applyHealthResult(record, { accountId: "account", ok: false, category: "network", reason: "timeout" }, 1000);
    expect(record.state).toBe("cooling");
    expect(Date.parse(record.cooldownUntil)).toBe(1000 + 15 * 60 * 1000);
    record = core.applyHealthResult(record, { accountId: "account", ok: true }, 2000);
    expect(record).toMatchObject({ state: "healthy", consecutiveFailures: 0, cooldownUntil: "" });
    const credential = core.applyHealthResult({ accountId: "account" }, { accountId: "account", ok: false, error: { status: 401, message: "token expired" } }, 0);
    expect(credential.state).toBe("needs_attention");
  });

  it("uses 1 hour then 6 hour cooling and keeps only ten health samples", () => {
    let record: any = { accountId: "account" };
    for (let index = 0; index < 12; index += 1) {
      record = core.applyHealthResult(record, { accountId: "account", ok: false, category: "network", reason: "timeout" }, index * 1000);
    }
    expect(record.history).toHaveLength(10);
    expect(record.state).toBe("cooling");
    expect(Date.parse(record.cooldownUntil)).toBe(11_000 + 6 * 60 * 60 * 1000);
  });

  it("deduplicates unread alerts and keeps the latest detail", () => {
    let state = core.defaultExperienceState();
    state = core.pushAlert(state, { key: "download:x", title: "下载失败", detail: "one", level: "error" }, 1);
    state = core.pushAlert(state, { key: "download:x", title: "下载失败", detail: "two", level: "error" }, 2);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]).toMatchObject({ count: 2, detail: "two" });
  });

  it("re-groups migrated bookmarks by the normalized movie id", () => {
    const state = core.normalizeExperienceState({
      bookmarks: {
        legacy: [{ id: "mismatch", movieId: "actual", startSeconds: 12 }]
      }
    });
    expect(state.bookmarks.legacy).toBeUndefined();
    expect(state.bookmarks.actual[0]).toMatchObject({ id: "mismatch", movieId: "actual" });
  });
});
