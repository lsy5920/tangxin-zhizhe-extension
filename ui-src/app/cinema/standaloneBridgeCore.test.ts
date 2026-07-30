import { describe, expect, it } from "vitest";
import type { BridgeState } from "../types";
import {
  buildDownloadReport,
  cinemaCatalogIntentKey,
  cinemaHashForRoute,
  cinemaRouteEntryFromHash,
  cinemaRouteFromHash,
  mergeStandaloneBridgeState,
  selectDownloadTasksByIds,
  STANDALONE_RUNTIME_ACTIONS
} from "./standaloneBridgeCore";

describe("standalone cinema bridge core", () => {
  it("normalizes independent page hashes including the full download center", () => {
    expect(cinemaRouteFromHash("#/downloads")).toBe("downloads");
    expect(cinemaRouteFromHash("#/search?q=狐狸")).toBe("search");
    expect(cinemaRouteFromHash("#/unknown")).toBe("home");
    expect(cinemaHashForRoute("library")).toBe("#/library");
    expect(cinemaRouteEntryFromHash("#/detail/35855")).toEqual({ name: "detail", movieId: "35855" });
    expect(cinemaRouteEntryFromHash("#/playback/%33%35%38%35%36?from=collection")).toEqual({ name: "playback", movieId: "35856" });
  });

  it("builds a stable catalog intent key regardless of filter insertion order", () => {
    expect(cinemaCatalogIntentKey({ mode: "browse", query: "  test ", filters: { pay_type: "free", order: "new" } }))
      .toBe(cinemaCatalogIntentKey({ mode: "browse", query: "test", filters: { order: "new", pay_type: "free" } }));
    expect(cinemaCatalogIntentKey({ mode: "search", query: "test", filters: {} }))
      .not.toBe(cinemaCatalogIntentKey({ mode: "browse", query: "test", filters: {} }));
  });

  it("preserves page-local collection and planner while merging persisted progress", () => {
    const current = {
      cinemaCollection: { phase: "ready", parentMovieId: "10", items: [] },
      downloadPlanner: { open: true, phase: "probing", movieId: "10" },
      downloadTasks: { old: { taskId: "old", stage: "queued" } }
    } as BridgeState;
    const incoming = {
      downloadTasks: { fresh: { taskId: "fresh", stage: "downloading" } }
    } as BridgeState;
    const merged = mergeStandaloneBridgeState(current, incoming);
    expect(merged.expanded).toBe(true);
    expect(merged.cinemaCollection?.parentMovieId).toBe("10");
    expect(merged.downloadPlanner?.movieId).toBe("10");
    expect(Object.keys(merged.downloadTasks || {})).toEqual(["fresh"]);
  });

  it("maps every stateful cinema action to a background message", () => {
    expect(STANDALONE_RUNTIME_ACTIONS["update-library-entry"]).toBe("updateLibraryEntry");
    expect(STANDALONE_RUNTIME_ACTIONS["pause-download-task"]).toBe("pauseDownloadTask");
    expect(STANDALONE_RUNTIME_ACTIONS["run-storage-audit"]).toBe("runStorageAudit");
  });

  it("selects requested download tasks and builds a useful failure report", () => {
    const state = {
      downloadTasks: {
        a: { taskId: "a", movieId: "100", movieTitle: "第一部", stage: "complete", url: "https://cdn.example/a.mp4" },
        b: { taskId: "b", movieId: "200", movieTitle: "第二部", stage: "error", url: "https://cdn.example/b.m3u8", error: "线路过期" }
      }
    } as BridgeState;
    const selected = selectDownloadTasksByIds(state, ["b"]);
    expect(selected.map((task) => task.taskId)).toEqual(["b"]);
    const report = buildDownloadReport(selected, "失败", true);
    expect(report).toContain("糖心影院下载失败摘要");
    expect(report).toContain("第二部");
    expect(report).toContain("线路过期");
    expect(report).not.toContain("第一部");
  });
});
