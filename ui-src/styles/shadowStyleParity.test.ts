import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const candyUiStyles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("Shadow DOM 样式一致性", () => {
  it("为 Tailwind 注册属性提供影子树内的确定性初值", () => {
    // Chromium 不会稳定应用 Shadow DOM 内的 @property 注册；没有这些显式初值时，
    // border、gradient、shadow、ring 和 transform utilities 会整组失效。
    expect(candyUiStyles).toContain("--txzz-shadow-property-fallback");
    expect(candyUiStyles).toMatch(/@layer\s+properties\s*\{[\s\S]*--txzz-shadow-property-fallback/);
    expect(candyUiStyles).toMatch(/--tw-border-style\s*:\s*solid/);
    expect(candyUiStyles).toMatch(/--tw-gradient-from-position\s*:\s*0%/);
    expect(candyUiStyles).toMatch(/--tw-shadow\s*:\s*0 0 #0000/);
    expect(candyUiStyles).toMatch(/--tw-ring-offset-width\s*:\s*0px/);
    expect(candyUiStyles).toMatch(/--tw-translate-x\s*:\s*0/);
  });

  it("保留糖果主题的插画与动画门禁标记", () => {
    for (const marker of [
      ".txzz-stat-ornament",
      "@keyframes txzz-stat-float",
      "@keyframes txzz-companion-breathe"
    ]) {
      expect(candyUiStyles).toContain(marker);
    }
  });

  it("为竖屏舞台和三分类设置提供容器级响应规则", () => {
    expect(candyUiStyles).toMatch(/\.txzz-player-shell--portrait:not\([\s\S]*height:\s*min\(60dvh,\s*40rem\)/);
    expect(candyUiStyles).toMatch(/\.txzz-player-menu-tabs\s*\{[\s\S]*repeat\(3,/);
    expect(candyUiStyles).toContain("@container (min-width: 500px)");
  });

  it("保留跟随进度点的实时小画面及两端收边规则", () => {
    expect(candyUiStyles).toContain(".txzz-player-progress-preview");
    expect(candyUiStyles).toContain('.txzz-player-progress-preview[data-align="start"]');
    expect(candyUiStyles).toContain('.txzz-player-progress-preview[data-align="end"]');
  });
});
