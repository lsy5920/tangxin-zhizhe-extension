import { describe, expect, it } from "vitest";
import type { CinemaMovie } from "./types";
import {
  collectCinemaMovieIndex,
  createCinemaRouteStack,
  navigateCinemaPrimary,
  popCinemaRoute,
  pushCinemaRoute,
  selectCinemaHistory,
  selectCinemaLibrary,
  shouldLoadCinemaCollection,
  syncCinemaRouteStack
} from "./appModel";

const movie: CinemaMovie = {
  id: "35807",
  title: "目录影片",
  posterUrl: "https://cdn.example/35807.bnc?ext=.jpg",
  creator: "创作者",
  durationSeconds: 120,
  durationLabel: "2:00",
  orientation: "landscape",
  access: "vip",
  price: 0
};

describe("cinema app model", () => {
  it("keeps app-local navigation independent from the host page history", () => {
    let stack = createCinemaRouteStack("discover");
    stack = pushCinemaRoute(stack, { name: "detail", movieId: "35807" });
    stack = pushCinemaRoute(stack, { name: "playback", movieId: "35807" });
    expect(stack.map((route) => route.name)).toEqual(["discover", "detail", "playback"]);
    expect(popCinemaRoute(stack).at(-1)).toEqual({ name: "detail", movieId: "35807" });
    expect(navigateCinemaPrimary("library")).toEqual([{ name: "library" }]);
    expect(navigateCinemaPrimary("downloads")).toEqual([{ name: "downloads" }]);
    expect(createCinemaRouteStack({ name: "playback", movieId: "35856" })).toEqual([
      { name: "home" },
      { name: "playback", movieId: "35856" }
    ]);
  });

  it("syncs an externally changed standalone hash without duplicating the current route", () => {
    const current = [{ name: "home" }] as const;
    expect(syncCinemaRouteStack([...current], { name: "playback", movieId: "35855" })).toEqual([
      { name: "home" },
      { name: "playback", movieId: "35855" }
    ]);
    const playback = [{ name: "home" }, { name: "playback", movieId: "35855" }] as const;
    expect(syncCinemaRouteStack([...playback], { name: "playback", movieId: "35855" })).toEqual(playback);
    expect(syncCinemaRouteStack([...playback], { name: "downloads" })).toEqual([{ name: "downloads" }]);
  });

  it("deduplicates catalog movies while preferring the current result page", () => {
    const updated = { ...movie, title: "搜索页新标题" };
    const index = collectCinemaMovieIndex({
      sections: [{ id: "s", title: "推荐", filter: {}, items: [movie] }],
      items: [updated]
    });
    expect(index.size).toBe(1);
    expect(index.get("35807")?.title).toBe("搜索页新标题");
  });

  it("adds normalized collection episodes to the shared movie index", () => {
    const episode = { ...movie, id: "35856", title: "合集第二集", isCollection: true };
    const index = collectCinemaMovieIndex({ items: [movie] }, {
      phase: "ready",
      parentMovieId: "35856",
      title: "合集",
      items: [episode]
    });
    expect(index.get("35856")).toEqual(episode);
  });

  it("restores collection metadata once for a direct detail or playback route", () => {
    expect(shouldLoadCinemaCollection(null, "35855")).toBe(true);
    expect(shouldLoadCinemaCollection({ phase: "loading", parentMovieId: "35855", items: [] }, "35855")).toBe(false);
    expect(shouldLoadCinemaCollection({ phase: "ready", parentMovieId: "other", items: [{ ...movie, id: "35855" }] }, "35855")).toBe(false);
    expect(shouldLoadCinemaCollection({ phase: "error", parentMovieId: "35855", items: [], error: "upstream" }, "35855")).toBe(false);
  });

  it("projects playback history without leaking source URLs into the cinema catalog view model", () => {
    const history = selectCinemaHistory({
      schemaVersion: 2,
      activeSession: null,
      request: { phase: "idle" },
      history: [{
        id: "session",
        movieId: "35807",
        title: "历史影片",
        phase: "ready",
        sources: [{ id: "primary", label: "主线", url: "https://signed.example/full.m3u8", protocol: "hls", health: { state: "healthy" } }],
        decision: { recommendedSourceId: "primary", reasonCodes: [], failoverAllowed: false },
        acquisition: { mode: "direct", attempts: 1 },
        fetchedAt: "2026-07-30T01:00:00Z",
        expiresAt: "2026-07-30T02:00:00Z"
      }]
    }, new Map([[movie.id, movie]]));
    expect(history[0].movie).toEqual(movie);
    expect(JSON.stringify(history)).not.toContain("signed.example");
    expect(JSON.stringify(history)).not.toContain("sources");
  });

  it("builds a searchable library even when the current catalog no longer contains the movie", () => {
    const rows = selectCinemaLibrary({
      11634: { movieId: "11634", title: "旅行 Vlog", favorite: true, tags: ["海边"], updatedAt: "2026-07-30T00:00:00Z" }
    }, new Map(), "favorite", "海边");
    expect(rows).toHaveLength(1);
    expect(rows[0].movie).toMatchObject({ id: "11634", title: "旅行 Vlog", posterUrl: "" });
  });
});
