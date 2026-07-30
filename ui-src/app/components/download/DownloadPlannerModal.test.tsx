import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DownloadPlannerModal } from "./DownloadPlannerModal";

describe("download planner states", () => {
  it("shows immediate probing feedback before the media plan is ready", () => {
    const html = renderToStaticMarkup(
      <DownloadPlannerModal
        planner={{ open: true, phase: "probing", movieId: "35856", movieTitle: "旅行日记 第 2 集" }}
        onAction={() => {}}
      />
    );

    expect(html).toContain("正在检票并规划下载");
    expect(html).toContain("旅行日记 第 2 集");
    expect(html).not.toContain("放进可恢复下载队列");
  });

  it("keeps a failed plan visible and retryable", () => {
    const html = renderToStaticMarkup(
      <DownloadPlannerModal
        planner={{ open: true, phase: "error", movieId: "35856", movieTitle: "旅行日记 第 2 集", error: "清单探测超时" }}
        onAction={() => {}}
      />
    );

    expect(html).toContain("下载规划失败");
    expect(html).toContain("清单探测超时");
    expect(html).toContain("重新探测");
  });
});
