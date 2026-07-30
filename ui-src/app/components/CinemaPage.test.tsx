import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import type { CinemaMovie } from "../cinema/types";
import type { BridgeState } from "../types";

// Shaka 的浏览器包使用 self 作为全局根；服务端静态渲染测试需要先建立等价别名。
Object.defineProperty(globalThis, "self", { configurable: true, value: globalThis });
const { CinemaPage } = await import("./CinemaPage");

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

    const html = renderToStaticMarkup(
      <CinemaPage
        panelRef={createRef<HTMLDivElement>()}
        state={state}
        onAction={() => {}}
        onExitWorkspace={() => {}}
        onClose={() => {}}
      />
    );
    expect(html).toContain("目录更新失败，已保留上次片单");
    expect(html).toContain("目录服务暂时超时");
    expect(html).toContain("真实目录影片");
    expect(html).toContain("data-cinema-poster-state=\"idle\"");
    expect(html).toContain("role=\"alert\"");
  });
});
