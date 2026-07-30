import { describe, expect, it } from "vitest";

await import("../../../cinema_catalog_core.js");

const core = (globalThis as typeof globalThis & { TxzzCinemaCatalogCore: any }).TxzzCinemaCatalogCore;

function rawMovie(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `影片 ${id}`,
    img: `/cover/${id}.jpg`,
    nickname: "糖心作者",
    duration_time: "01:02:03",
    pay_type: "money",
    money: 8,
    ...overrides
  };
}

describe("cinema catalog core", () => {
  it("removes ad blocks, invalid movies and duplicate movies", () => {
    const normalized = core.normalizeDiscoverResponse([
      { id: "", name: "广告", style: -1, ad: { image: "ad.jpg" } },
      { id: "negative", name: "装饰", style: -2, items: [rawMovie("9")] },
      { id: "featured", name: "今日精选", style: 1, filter: "{\"order\":\"new\"}", items: [rawMovie("1"), rawMovie("1"), { name: "missing id" }] },
      { id: "popular", name: "大家都在看", style: 2, items: [rawMovie("1"), rawMovie("2")] }
    ]);

    expect(normalized.sections.map((section: any) => section.id)).toEqual(["featured", "popular"]);
    expect(normalized.sections[0].items).toHaveLength(1);
    expect(normalized.items.map((movie: any) => movie.id)).toEqual(["1", "2"]);
  });

  it("keeps only directory metadata and never leaks playback fields", () => {
    const movie = core.normalizeMovie(rawMovie("11634", {
      play_link: "https://media.invalid/full.m3u8",
      backup_url: "https://media.invalid/backup.m3u8",
      m3u8: "https://media.invalid/raw.m3u8",
      nested: { signedUrl: "https://media.invalid/signed" }
    }));

    expect(movie).toMatchObject({ id: "11634", durationSeconds: 3723, durationLabel: "01:02:03", access: "coin", price: 8 });
    expect(core.containsPlaybackField(movie)).toBe(false);
    expect(JSON.stringify(movie)).not.toContain("media.invalid");
  });

  it("is idempotent so persisted poster, duration and access metadata survive reloads", () => {
    const first = core.normalizeMovie(rawMovie("11634", {
      img: "https://img.example/cover.jpg",
      nickname: "创作者",
      canvas: "short",
      duration: "31:55",
      duration_time: "1915",
      pay_type: "money",
      money: "25"
    }));
    const second = core.normalizeMovie(first);
    expect(second).toEqual(first);
    expect(second).toMatchObject({
      posterUrl: "https://img.example/cover.jpg",
      creator: "创作者",
      durationSeconds: 1915,
      durationLabel: "31:55",
      orientation: "landscape",
      access: "coin",
      price: 25
    });
  });

  it("normalizes orientation, access type and flexible durations", () => {
    expect(core.normalizeMovie(rawMovie("p", { canvas: "long", pay_type: "vip", money: 0, duration: "17:05" }))).toMatchObject({
      orientation: "portrait",
      access: "vip",
      durationSeconds: 3723
    });
    expect(core.normalizeMovie(rawMovie("l", { canvas: "short", pay_type: "free", money: 0, duration_time: "", duration: 65 }))).toMatchObject({
      orientation: "landscape",
      access: "free",
      durationSeconds: 65,
      durationLabel: "1:05"
    });
  });

  it("whitelists search parameters and clamps pagination", () => {
    expect(core.buildSearchParams({
      keywords: "  cos  ",
      order: "new",
      payType: "coin",
      canvas: "portrait",
      tagId: "272",
      categoryId: "140",
      position: "normal",
      page: -4,
      pageSize: 999,
      token: "must-not-pass",
      play_link: "must-not-pass"
    })).toEqual({
      keywords: "cos",
      order: "new",
      pay_type: "money",
      canvas: "long",
      tag_id: "272",
      cat_id: "140",
      position: "normal",
      page: 1,
      page_size: 48
    });
  });

  it("plans only the two read-only catalog endpoints and strips playback inputs", () => {
    expect(core.buildCatalogRequest({ mode: "discover", endpoint: "/movie/doBuy" })).toEqual({
      mode: "discover",
      endpoint: "/movie/block",
      data: { position: "app_home_tj" }
    });
    const search = core.buildCatalogRequest({
      mode: "search",
      query: "cos",
      page: 2,
      pageSize: 24,
      filters: {
        order: "hot",
        play_url: "https://media.invalid/full.m3u8",
        token: "must-not-pass"
      }
    });
    expect(search).toEqual({
      mode: "search",
      endpoint: "/movie/search",
      data: { keywords: "cos", order: "hot", page: 2, page_size: 24 }
    });
    expect(JSON.stringify(search)).not.toMatch(/detail|doBuy|playback|m3u8|token/i);
  });

  it("appends pages in stable order and reports the final page", () => {
    const first = core.normalizeSearchResponse({ list: [rawMovie("1"), rawMovie("2")], total: 3 }, { page: 1, pageSize: 2 });
    const second = core.normalizeSearchResponse({ data: { list: [rawMovie("2"), rawMovie("3")] }, total: 3 }, { page: 2, pageSize: 2 });
    const merged = core.appendUniqueMovies(first.items, second.items);

    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(merged.map((movie: any) => movie.id)).toEqual(["1", "2", "3"]);
  });

  it("treats an empty page as terminal when no total is available", () => {
    const result = core.normalizeSearchResponse({ list: [] }, { page: 3, pageSize: 24 });
    expect(result).toMatchObject({ items: [], page: 3, hasMore: false });
  });

  it("normalizes collection groups without exposing playback fields", () => {
    const collection = core.normalizeCollectionResponse({
      data: {
        ...rawMovie("35856", { name: "旅行日记 第 2 集", is_episode: "y" }),
        play_link: "https://media.invalid/current.m3u8",
        groups: [
          rawMovie("35855", { name: "旅行日记 第 1 集", duration: "12:08", play_link: "https://media.invalid/episode-1.m3u8" }),
          rawMovie("35856", { name: "旅行日记 第 2 集", duration: "18:26", backup_link: "https://media.invalid/episode-2.m3u8" })
        ]
      }
    }, rawMovie("35856", { name: "旅行日记 第 2 集", is_episode: "y" }));

    expect(collection).toMatchObject({ parentMovieId: "35856", title: "旅行日记" });
    expect(collection.items.map((item: any) => item.id)).toEqual(["35855", "35856"]);
    expect(collection.items.every((item: any) => item.isCollection)).toBe(true);
    expect(core.containsPlaybackField(collection)).toBe(false);
    expect(JSON.stringify(collection)).not.toContain("media.invalid");
  });

  it("keeps the selected parent episode when a collection exceeds the item limit", () => {
    const parent = rawMovie("999999", { name: "超长合集 第 121 集", is_episode: "y" });
    const groups = Array.from({ length: 121 }, (_, index) => rawMovie(String(index + 1), {
      name: `超长合集 第 ${index + 1} 集`,
      is_episode: "y"
    }));
    const collection = core.normalizeCollectionResponse({ data: { ...parent, groups } }, parent);

    expect(collection.items).toHaveLength(120);
    expect(collection.items.at(-1)?.id).toBe("999999");
  });
});
