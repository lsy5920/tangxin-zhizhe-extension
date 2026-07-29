import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const menuSource = readFileSync(new URL("./PlayerMenuSheet.tsx", import.meta.url), "utf8");

describe("播放器设置菜单信息架构", () => {
  it("只保留片源、观看和工具三类", () => {
    expect(menuSource).toContain('PlayerMorePanelKey = "source" | "view" | "tools"');
    expect(menuSource).toContain('label: "片源"');
    expect(menuSource).toContain('label: "观看"');
    expect(menuSource).toContain('label: "工具"');
    expect(menuSource).not.toContain('panel === "sound"');
  });

  it("移除与主控及片源抽屉重复的动作", () => {
    expect(menuSource).not.toContain('label="备用线路"');
    expect(menuSource).not.toContain('label="复制链接"');
    expect(menuSource).not.toContain('label="新窗口打开"');
    expect(menuSource).not.toContain('label="下载视频"');
    expect(menuSource).not.toContain("onToggleMute");
  });
});
