import { describe, expect, it } from "vitest";
import { contextKey, createPageContext, getDetailMovieId, isCurrentRequest, sameDetailPage } from "./pageContext";

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
});
