import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaybackSession } from "../../playback/types";
import { ScreeningSidebar } from "./ScreeningSidebar";

describe("放映侧栏旧会话兼容", () => {
  it("会话缺少 acquisition 时仍可渲染并使用安全默认值", () => {
    const partialSession = {
      id: "partial",
      movieId: "9527",
      title: "旧缓存会话",
      phase: "ready",
      sources: [],
      fetchedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: "2026-07-29T00:10:00.000Z"
    } as unknown as PlaybackSession;
    const html = renderToStaticMarkup(
      <ScreeningSidebar
        session={partialSession}
        request={{ phase: "idle" }}
        onRefresh={() => {}}
        onToggleFavorite={() => {}}
        onToggleWatchLater={() => {}}
      />
    );
    expect(html).toContain("账号直取");
    expect(html).toContain("已尝试 1 个账号");
  });
});
