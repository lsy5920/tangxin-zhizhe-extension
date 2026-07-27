import { describe, expect, it } from "vitest";

await import("../../../page_context_core.js");

const core = (globalThis as typeof globalThis & {
  TxzzPageContextCore: {
    resolveVlogMovieId: (evidence: Record<string, unknown>) => { movieId: string; confidence: string };
    reconcileContext: (previous: Record<string, unknown>, input: Record<string, unknown>) => Record<string, unknown>;
    isCurrentRequest: (current: Record<string, unknown>, request: Record<string, unknown>, vlog: boolean) => boolean;
    normalizeAuthoritativeContext: (payload: Record<string, unknown>, expectedPageKey?: string) => Record<string, unknown> | null;
    shouldAcceptAuthoritativeContext: (previous: Record<string, unknown> | null, next: Record<string, unknown> | null) => boolean;
  };
}).TxzzPageContextCore;

describe("production page context core", () => {
  it("cross-checks active DOM, player, Vue active state and list fallback", () => {
    expect(core.resolveVlogMovieId({ activeSlideId: "200", activePlayerId: "200", listId: "199" })).toEqual({ movieId: "200", confidence: "confirmed" });
    expect(core.resolveVlogMovieId({ activeSlideId: "200", activePlayerId: "201", listId: "199" })).toEqual({ movieId: "", confidence: "transitioning" });
    expect(core.resolveVlogMovieId({ listId: "199" })).toEqual({ movieId: "199", confidence: "list-fallback" });
  });

  it("keeps the stable ID through old → empty → new and isolates the old response", () => {
    const initial = { pageKey: "https://txh068.com/vlog/", pageEpoch: 4, movieId: "100", transitioning: false };
    const empty = core.reconcileContext(initial, { pageKey: initial.pageKey, movieId: "", isVlog: true });
    expect(empty).toMatchObject({ movieId: "100", pageEpoch: 4, transitioning: true });
    expect(core.isCurrentRequest(empty, { movieId: "100", pageKey: initial.pageKey, pageEpoch: 4, active: true }, true)).toBe(false);

    const next = core.reconcileContext(empty, { pageKey: initial.pageKey, movieId: "101", isVlog: true });
    expect(next).toMatchObject({ movieId: "101", pageEpoch: 5, transitioning: false, movieChanged: true });
    expect(core.isCurrentRequest(next, { movieId: "100", pageKey: initial.pageKey, pageEpoch: 4, active: true }, true)).toBe(false);
    expect(core.isCurrentRequest(next, { movieId: "101", pageKey: initial.pageKey, pageEpoch: 5, active: true }, true)).toBe(true);
  });

  it("uses the main-world snapshot when the isolated world cannot see Vue state", () => {
    const pageKey = "https://txh068.com/vlog/";
    const isolated = core.reconcileContext(
      { pageKey, pageEpoch: 0, movieId: "" },
      { pageKey, movieId: "", isVlog: true }
    );
    expect(isolated).toMatchObject({ movieId: "", transitioning: true });

    const authoritative = core.normalizeAuthoritativeContext({
      pageKey,
      pageEpoch: 0,
      pageMovieId: "33337",
      transitioning: false,
      contextRevision: 1,
      active: true
    }, pageKey);
    expect(authoritative).toMatchObject({ movieId: "33337", transitioning: false, contextRevision: 1 });
    expect(core.isCurrentRequest(authoritative!, {
      movieId: "33337",
      pageKey,
      pageEpoch: 0,
      active: true
    }, true)).toBe(true);
  });

  it("rejects delayed authoritative revisions and wrong-page snapshots", () => {
    const pageKey = "https://txh068.com/vlog/";
    const current = core.normalizeAuthoritativeContext({
      pageKey,
      pageEpoch: 5,
      movieId: "11634",
      transitioning: false,
      contextRevision: 9
    }, pageKey)!;
    const stale = core.normalizeAuthoritativeContext({
      pageKey,
      pageEpoch: 4,
      movieId: "33337",
      transitioning: false,
      contextRevision: 8
    }, pageKey)!;
    expect(core.shouldAcceptAuthoritativeContext(current, stale)).toBe(false);
    expect(core.shouldAcceptAuthoritativeContext(current, {
      ...current,
      movieId: "33337",
      contextRevision: 10
    })).toBe(false);
    expect(core.normalizeAuthoritativeContext({
      pageKey: "https://txh068.com/movie/detail/11634",
      pageEpoch: 5,
      movieId: "11634",
      contextRevision: 10
    }, pageKey)).toBeNull();
  });

  it("does not carry the previous movie ID across a real route change", () => {
    const next = core.reconcileContext(
      { pageKey: "https://txh068.com/movie/detail/11634", pageEpoch: 2, movieId: "11634" },
      { pageKey: "https://txh068.com/vlog/", movieId: "", isVlog: true }
    );
    expect(next).toMatchObject({ movieId: "", pageEpoch: 3, transitioning: true, routeChanged: true });
  });
});
