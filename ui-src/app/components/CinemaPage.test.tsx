import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CinemaMovie } from "../cinema/types";
import type { BridgeState } from "../types";
import { CinemaPage } from "./CinemaPage";

const movie: CinemaMovie = {
  id: "35807",
  title: "真实目录影片",
  posterUrl: "https://cdn.example/cover.bnc?ext=.jpg",
  creator: "糖心创作者",
  durationSeconds: 1915,
  durationLabel: "31:55",
  orientation: "landscape",
  access: "coin",
  price: 25
};

describe("cinema page resilient states", () => {
  it("keeps the last successful shelf visible while showing a retryable refresh error", () => {
    const state = {
      cinemaCatalog: {
        mode: "browse",
        phase: "error",
        query: "",
        filters: { order: "new" },
        sections: [],
        items: [movie],
        page: 1,
        pageSize: 24,
        hasMore: false,
        fetchedAt: "2026-07-30T02:40:00.000Z",
        error: "目录服务暂时超时"
      },
      screening: { request: { phase: "idle" } }
    } as unknown as BridgeState;

    const html = renderToStaticMarkup(<CinemaPage state={state} onAction={() => {}} onPage={() => {}} />);
    expect(html).toContain("本次更新失败，正在展示上次成功片单");
    expect(html).toContain("目录服务暂时超时");
    expect(html).toContain("真实目录影片");
    expect(html).toContain("data-cinema-poster-state=\"idle\"");
    expect(html).toContain("role=\"alert\"");
  });
});
