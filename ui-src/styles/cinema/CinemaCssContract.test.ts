import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const playerStyles = readFileSync(new URL("./player.css", import.meta.url), "utf8");
const collectionStyles = readFileSync(new URL("./collections.css", import.meta.url), "utf8");

describe("cinema responsive CSS contract", () => {
  it("keeps a definite player-menu height and a scrollable body", () => {
    // An auto-height CSS Grid can collapse its 1fr track to zero when only max-height is set.
    expect(playerStyles).toMatch(/\.txzz-player-menu-sheet\s*\{[\s\S]*top:\s*auto;[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto;[\s\S]*height:\s*min\(500px,\s*calc\(100cqh - 94px\)\)/);
    expect(playerStyles).toMatch(/\.txzz-player-menu-body\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto/);
    expect(playerStyles).toMatch(/@media \(max-width:\s*639px\)[\s\S]*\.txzz-player-menu-sheet\s*\{[\s\S]*position:\s*fixed;[\s\S]*height:\s*min\(72dvh,\s*560px\)/);
    expect(playerStyles).toMatch(/@media \(max-height:\s*520px\) and \(orientation:\s*landscape\)[\s\S]*\.txzz-player-menu-sheet\s*\{[\s\S]*height:\s*calc\(100cqh - 64px\)/);
  });

  it("keeps compact collection layouts on narrow screens", () => {
    expect(collectionStyles).toMatch(/@media \(max-width:\s*639px\)[\s\S]*\.txzz-cinema58-library-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(collectionStyles).toContain(".txzz-cinema58-history-list > article");
    expect(collectionStyles).toContain(".txzz-cinema58-bookmark-list > article");
  });
});
