import { describe, expect, it } from "vitest";
import { buildCinemaPresetQuery, buildCinemaSearchQuery, cinemaPresetActive } from "./CinemaFilters";

const hotPreset = { key: "hot", label: "热门", mode: "browse" as const, filters: { order: "hot" } };
const discoverPreset = { key: "discover", label: "发现", mode: "discover" as const, filters: {} };

describe("cinema filter query composition", () => {
  it("keeps the selected filter when searching and when clearing the keyword", () => {
    expect(buildCinemaSearchQuery("  cos  ", { order: "hot" })).toEqual({
      mode: "search",
      query: "cos",
      filters: { order: "hot" }
    });
    expect(buildCinemaSearchQuery("", { order: "hot" })).toEqual({
      mode: "browse",
      query: "",
      filters: { order: "hot" }
    });
  });

  it("combines a preset with the current keyword while discover resets both", () => {
    expect(buildCinemaPresetQuery(hotPreset, "护士")).toEqual({
      mode: "search",
      query: "护士",
      filters: { order: "hot" }
    });
    expect(buildCinemaPresetQuery(discoverPreset, "护士")).toEqual({ mode: "discover", query: "", filters: {} });
  });

  it("shows a filter as active for both browse and combined search modes", () => {
    expect(cinemaPresetActive(hotPreset, "browse", { order: "hot" })).toBe(true);
    expect(cinemaPresetActive(hotPreset, "search", { order: "hot" })).toBe(true);
    expect(cinemaPresetActive(discoverPreset, "search", {})).toBe(false);
  });
});
