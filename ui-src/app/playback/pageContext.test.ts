import { describe, expect, it } from "vitest";
import {
  contextKey,
  createPageContext,
  getActiveVlogMovieId,
  getDetailMovieId,
  isCurrentRequest,
  requiresNewPageGeneration,
  sameDetailPage
} from "./pageContext";

describe("播放页面上下文", () => {
  it("同时支持详情路径和查询参数编号", () => {
    expect(getDetailMovieId("https://txh068.com/movie/detail/35778")).toBe("35778");
    expect(getDetailMovieId("https://txh068.com/watch?videoId=35686")).toBe("35686");
    expect(getDetailMovieId({ params: { movie_id: "35723" } })).toBe("35723");
    expect(getDetailMovieId("https://txh068.com/")).toBe("");
  });

  it("页面代次变化后旧请求失效，即使 movieId 相同也不能回写", () => {
    const current = createPageContext("https://txh068.com/movie/detail/35778", 3);
    expect(isCurrentRequest(current, { movieId: "35778", pageKey: current.pageKey, pageEpoch: 3, active: true })).toBe(true);
    expect(isCurrentRequest(current, { movieId: "35778", pageKey: current.pageKey, pageEpoch: 2, active: true })).toBe(false);
    expect(isCurrentRequest(current, { movieId: "35686", pageKey: current.pageKey, pageEpoch: 3, active: true })).toBe(false);
    expect(isCurrentRequest(current, { movieId: "35778", pageKey: current.pageKey, pageEpoch: 3, active: false })).toBe(false);
  });

  it("生成稳定的上下文键", () => {
    const context = createPageContext("https://txh068.com/", 4);
    expect(contextKey(context)).toContain("#4:feed");
    expect(sameDetailPage(context, { ...context })).toBe(true);
    expect(sameDetailPage(context, { ...context, pageEpoch: 5 })).toBe(false);
  });

  it("Vlog 优先使用列表当前项而不是旁边预加载详情", () => {
    expect(getActiveVlogMovieId({
      listPlayerInfo: { id: "33199" },
      activeDetail: { id: "1828" },
      activeDetailEnabled: false,
      activePlayerMovieId: "33199"
    })).toBe("33199");
    expect(getActiveVlogMovieId({ activeDetail: { movie_id: "1828" }, activeDetailEnabled: true })).toBe("1828");
  });

  it("Vlog 同一路径切换活动视频也必须开启新代次", () => {
    const previous = { ...createPageContext("https://txh068.com/vlog/", 2), movieId: "33199" };
    const current = { ...createPageContext("https://txh068.com/vlog/", 2), movieId: "1828" };
    expect(requiresNewPageGeneration(previous, current)).toBe(true);
    expect(requiresNewPageGeneration(previous, { ...current, movieId: "33199" })).toBe(false);
  });
});
