import { describe, expect, it } from "vitest";
import type { CinemaMovie } from "./types";
import { canAutoAdvanceEpisode, resolveEpisodePlayback } from "./episodePlayback";

function episode(id: string, access: CinemaMovie["access"] = "free", price = 0): CinemaMovie {
  return {
    id,
    title: `第 ${id} 集`,
    posterUrl: "",
    creator: "合集",
    durationSeconds: 60,
    durationLabel: "1:00",
    orientation: "landscape",
    access,
    price,
    isCollection: true
  };
}

describe("cinema episode playback", () => {
  it("preserves collection order and resolves the next episode", () => {
    const model = resolveEpisodePlayback({
      phase: "ready",
      parentMovieId: "2",
      items: [episode("1"), episode("2"), episode("2"), episode("3")]
    }, "2");
    expect(model.episodes.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(model.currentIndex).toBe(1);
    expect(model.nextEpisode?.id).toBe("3");
  });

  it("does not expose an unrelated cached collection to the current session", () => {
    expect(resolveEpisodePlayback({ items: [episode("1"), episode("2")] }, "9")).toEqual({
      episodes: [],
      currentIndex: -1,
      nextEpisode: null
    });
  });

  it("requires a fresh click before a paid episode can continue", () => {
    expect(canAutoAdvanceEpisode(episode("2", "free"))).toBe(true);
    expect(canAutoAdvanceEpisode(episode("2", "vip"))).toBe(true);
    expect(canAutoAdvanceEpisode(episode("2", "coin", 3))).toBe(false);
  });
});
