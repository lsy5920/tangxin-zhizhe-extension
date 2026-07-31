import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CinemaCatalogState, CinemaMovie } from "../../cinema/types";
import { CinemaAppShell } from "./CinemaAppShell";
import { CinemaHomeView } from "./CinemaCatalogViews";

const movies: CinemaMovie[] = Array.from({ length: 5 }, (_, index) => ({
  id: `58${index}`,
  title: index === 0 ? "这是一部标题很长但必须保持专业层级的糖果影院精选影片" : `精选影片 ${index + 1}`,
  posterUrl: `https://cdn.example/${index}.jpg`,
  creator: "糖果片场",
  durationSeconds: 600 + index,
  durationLabel: "10:00",
  orientation: index % 2 ? "portrait" : "landscape",
  access: index % 3 === 0 ? "free" : "vip",
  price: 0
}));

const catalog: CinemaCatalogState = {
  mode: "discover",
  phase: "ready",
  query: "",
  filters: {},
  sections: [{ id: "hot", title: "热播片单", filter: { order: "hot" }, items: movies }],
  items: movies,
  page: 1,
  pageSize: 24,
  hasMore: false,
  fetchedAt: "2026-07-31T00:00:00.000Z",
  error: ""
};

describe("cinema 5.8 visual contract", () => {
  it("renders the new desktop shell and complete navigation without changing routes", () => {
    const html = renderToStaticMarkup(
      <CinemaAppShell
        panelRef={createRef<HTMLDivElement>()}
        route={{ name: "home" }}
        canGoBack={false}
        libraryCount={3}
        bookmarkCount={2}
        historyCount={4}
        downloadCount={1}
        activeDownloadCount={1}
        catalogCount={40}
        storageIssueCount={0}
        resolving={false}
        toast={null}
        onNavigate={() => {}}
        onBack={() => {}}
        onExitWorkspace={() => {}}
        onClose={() => {}}
        onDismissToast={() => {}}
        standalone
      >
        <span>内容</span>
      </CinemaAppShell>
    );

    expect(html).toContain("txzz-cinema58-shell");
    expect(html).toContain("糖心影院");
    expect(html).toContain("我的片库");
    expect(html).toContain("时间书签");
    expect(html).toContain("离线下载");
    expect(html).toContain("存储管家");
    expect(html).toContain('data-cinema-route="home"');
  });

  it("renders a multi-feature hero, quick picks, rankings and explicit play action", () => {
    const html = renderToStaticMarkup(
      <CinemaHomeView
        catalog={catalog}
        history={[]}
        resolvingMovieId=""
        onMovie={() => {}}
        onPlay={() => {}}
        onQuery={() => {}}
        onLoadMore={() => {}}
        onRefresh={() => {}}
        onNavigate={() => {}}
      />
    );

    expect(html).toContain("txzz-cinema58-hero");
    expect(html).toContain("aria-roledescription=\"carousel\"");
    expect(html).toContain("立即播放");
    expect(html).toContain("今天想看哪一种");
    expect(html).toContain("影院热播榜");
    expect(html).not.toMatch(/play_link|backup_link|m3u8/i);
  });
});
