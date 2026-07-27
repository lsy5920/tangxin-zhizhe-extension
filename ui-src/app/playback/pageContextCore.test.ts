import { describe, expect, it } from "vitest";

await import("../../../page_context_core.js");

const core = (globalThis as typeof globalThis & {
  TxzzPageContextCore: {
    resolveVlogMovieId: (evidence: Record<string, unknown>) => { movieId: string; confidence: string };
    reconcileContext: (previous: Record<string, unknown>, input: Record<string, unknown>) => Record<string, unknown>;
    isCurrentRequest: (current: Record<string, unknown>, request: Record<string, unknown>, vlog: boolean) => boolean;
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
});
