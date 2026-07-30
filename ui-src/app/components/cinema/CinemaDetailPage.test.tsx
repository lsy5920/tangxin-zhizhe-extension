import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CinemaCollectionState, CinemaMovie } from "../../cinema/types";
import { CinemaDetailPage } from "./CinemaDetailPage";

const parentMovie: CinemaMovie = {
  id: "35856",
  title: "旅行日记 第 2 集",
  posterUrl: "https://cdn.example/35856.bnc?ext=.jpg",
  creator: "旅行创作者",
  durationSeconds: 1106,
  durationLabel: "18:26",
  orientation: "landscape",
  access: "vip",
  price: 0,
  isCollection: true
};

const collection: CinemaCollectionState = {
  phase: "ready",
  parentMovieId: "35856",
  title: "旅行日记",
  items: [
    { ...parentMovie, id: "35855", title: "旅行日记 第 1 集", durationLabel: "12:08" },
    parentMovie
  ]
};

describe("cinema collection detail", () => {
  it("renders a selectable episode list without embedding playback URLs", () => {
    const html = renderToStaticMarkup(
      <CinemaDetailPage
        movie={parentMovie}
        collection={collection}
        resolving={false}
        related={[]}
        onOpenPlayback={() => {}}
        onPlanDownload={() => {}}
        onRefreshCollection={() => {}}
        onToggleFavorite={() => {}}
        onToggleWatchLater={() => {}}
        onMovie={() => {}}
        onBack={() => {}}
      />
    );

    expect(html).toContain("旅行日记");
    expect(html).toContain("共 2 集");
    expect(html).toContain("当前第 2 集");
    expect(html).toContain("开映当前集");
    expect(html).toContain("下载当前集");
    expect(html).not.toMatch(/play_link|backup_link|m3u8/i);
  });

  it("offers a direct full-video download action for a standalone movie", () => {
    const html = renderToStaticMarkup(
      <CinemaDetailPage
        movie={{ ...parentMovie, id: "11634", title: "独立影片", isCollection: false }}
        resolving={false}
        related={[]}
        onOpenPlayback={() => {}}
        onPlanDownload={() => {}}
        onRefreshCollection={() => {}}
        onToggleFavorite={() => {}}
        onToggleWatchLater={() => {}}
        onMovie={() => {}}
        onBack={() => {}}
      />
    );

    expect(html).toContain("下载完整视频");
    expect(html).toContain("明确点击开映或下载");
  });

  it("keeps stale episodes visible when a refresh fails", () => {
    const html = renderToStaticMarkup(
      <CinemaDetailPage
        movie={parentMovie}
        collection={{ ...collection, phase: "error", error: "合集接口超时" }}
        resolving={false}
        related={[]}
        onOpenPlayback={() => {}}
        onPlanDownload={() => {}}
        onRefreshCollection={() => {}}
        onToggleFavorite={() => {}}
        onToggleWatchLater={() => {}}
        onMovie={() => {}}
        onBack={() => {}}
      />
    );

    expect(html).toContain("刷新失败，已保留上次的 2 集");
    expect(html).toContain("旅行日记 第 1 集");
  });
});
