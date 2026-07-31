import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const candyUiStyles = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const cinemaUiStyles = readFileSync(new URL("./cinema/index.css", import.meta.url), "utf8");
const shadowBootstrap = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

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

  it("让新版影院外链样式与 Shadow DOM 内联回退使用同一构建顺序", () => {
    for (const layer of ["tokens.css", "layout.css", "catalog.css", "collections.css", "operations.css", "player.css", "motion.css"]) {
      expect(cinemaUiStyles).toContain(layer);
    }
    expect(shadowBootstrap).toContain('import "./styles/cinema/index.css"');
    expect(shadowBootstrap).toContain('import cinemaUiStyles from "./styles/cinema/index.css?inline"');
    expect(shadowBootstrap).toContain("${candyUiStyles}\\n${cinemaUiStyles}");
    expect(shadowBootstrap).toContain('".txzz-cinema58-shell"');
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

  it("全屏可见性只作用于主视频，不把隐藏的预览 video 强制显示", () => {
    // visibility 可以被子元素重新覆盖；全局 `video { visibility:visible!important }`
    // 会穿透进度预览父层的 invisible，造成未拖动时也漏出一块缩略画面。
    expect(candyUiStyles).toContain(".txzz-player-shell .txzz-shaka-video");
    expect(candyUiStyles).not.toMatch(/\.txzz-player-shell\s+video\b/);
    expect(candyUiStyles).not.toMatch(/:host\(:fullscreen\)\s+video\b/);
    expect(shadowBootstrap).not.toMatch(/:host\(:fullscreen\)\s+video\b/);
  });
});
