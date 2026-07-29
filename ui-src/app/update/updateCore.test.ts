import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { updateCore } from "./updateCore";

describe("更新版本与缓存决策", () => {
  it("同版本同构建永远不提示更新", () => {
    expect(updateCore.shouldUpdate(
      { version: "5.2.2", build: "2026-07-29-2359" },
      "5.2.2",
      "2026-07-29-2359"
    )).toBe(false);
  });

  it("只在版本更高或同版本构建更新时提示", () => {
    expect(updateCore.shouldUpdate({ version: "5.3.0", build: "2026-07-01-0000" }, "5.2.2", "2026-07-29-2359")).toBe(true);
    expect(updateCore.shouldUpdate({ version: "5.2.2", build: "2026-07-30-0001" }, "5.2.2", "2026-07-29-2359")).toBe(true);
    expect(updateCore.shouldUpdate({ version: "5.2.1", build: "2026-08-01-0000" }, "5.2.2", "2026-07-29-2359")).toBe(false);
  });

  it("不跨已安装版本复用旧的成功缓存", () => {
    const base = {
      cachedResult: { ok: true, local: { version: "5.2.1", build: "2026-07-29-1929" } },
      lastCheckedAt: 1_000,
      now: 2_000,
      ttlMs: 15 * 60 * 1_000,
      localVersion: "5.2.2",
      localBuild: "2026-07-29-2359"
    };
    expect(updateCore.canReuseSuccessCache(base)).toBe(false);
    expect(updateCore.canReuseSuccessCache({
      ...base,
      cachedResult: { ok: true, local: { version: "5.2.2", build: "2026-07-29-2359" } }
    })).toBe(true);
    expect(updateCore.canReuseSuccessCache({ ...base, force: true })).toBe(false);
  });

  it("Service Worker 通过决策核心校验构建号，不读取未定义的全局函数", () => {
    expect(updateCore.parseBuildStamp("2026-07-29-2030")).toBeTypeOf("number");
    expect(updateCore.parseBuildStamp("invalid")).toBeNull();

    const backgroundSource = readFileSync(new URL("../../../background.js", import.meta.url), "utf8");
    expect(backgroundSource).toContain("updateCore.parseBuildStamp(manifest.build)");
    expect(backgroundSource).not.toMatch(/Number\.isFinite\(parseBuildStamp\(manifest\.build\)\)/);
  });
});
