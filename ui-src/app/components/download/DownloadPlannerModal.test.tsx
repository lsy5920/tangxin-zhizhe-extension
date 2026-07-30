import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DownloadPlannerModal, isDownloadPlanContractDirty } from "./DownloadPlannerModal";

describe("download planner states", () => {
  it("shows immediate probing feedback before the media plan is ready", () => {
    const html = renderToStaticMarkup(
      <DownloadPlannerModal
        planner={{ open: true, phase: "probing", movieId: "35856", movieTitle: "旅行日记 第 2 集" }}
        onAction={() => {}}
      />
    );

    expect(html).toContain("正在分析完整媒体");
    expect(html).toContain("旅行日记 第 2 集");
    expect(html).not.toContain("加入可恢复下载队列");
  });

  it("keeps a failed plan visible and retryable", () => {
    const html = renderToStaticMarkup(
      <DownloadPlannerModal
        planner={{ open: true, phase: "error", movieId: "35856", movieTitle: "旅行日记 第 2 集", error: "清单探测超时" }}
        onAction={() => {}}
      />
    );

    expect(html).toContain("下载方案未完成");
    expect(html).toContain("清单探测超时");
    expect(html).toContain("重新分析");
  });

  it("keeps submitting visible until the background atomically creates the task", () => {
    const html = renderToStaticMarkup(
      <DownloadPlannerModal
        planner={{ open: true, phase: "submitting", movieId: "35856", movieTitle: "旅行日记 第 2 集" }}
        onAction={() => {}}
      />
    );

    expect(html).toContain("正在写入可恢复队列");
    expect(html).toContain("写入成功后窗口会自动关闭");
  });

  it("invalidates the ticket contract only when source, network strategy, or quality changes", () => {
    const accepted = { sourceId: "backup", networkMode: "balanced", qualityHeight: 720 };
    expect(isDownloadPlanContractDirty({ ...accepted }, accepted)).toBe(false);
    expect(isDownloadPlanContractDirty({ ...accepted, sourceId: "primary" }, accepted)).toBe(true);
    expect(isDownloadPlanContractDirty({ ...accepted, networkMode: "high-quality" }, accepted)).toBe(true);
    expect(isDownloadPlanContractDirty({ ...accepted, qualityHeight: 1080 }, accepted)).toBe(true);
  });
});
