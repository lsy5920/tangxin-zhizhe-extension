import { describe, expect, it } from "vitest";
import type { RepositoryUpdateState } from "../types";
import { APP_BUILD, APP_VERSION, deriveUpdateStatus, isUpdateAvailableForCurrentBuild } from "./helpers";

function updateState(version: string, build: string): RepositoryUpdateState {
  return {
    ok: true,
    status: "available",
    checkPhase: "cached",
    updateAvailable: true,
    local: { version: APP_VERSION, build: APP_BUILD },
    remote: { id: `${version}|${build}`, version, build }
  };
}

describe("升级界面同版本防误报", () => {
  it("旧缓存标记为 available 时仍复核当前 version/build", () => {
    const staleFlag = updateState(APP_VERSION, APP_BUILD);
    expect(isUpdateAvailableForCurrentBuild(staleFlag)).toBe(false);
    expect(deriveUpdateStatus(staleFlag)).toBe("latest");
  });

  it("远端确实更新时保留升级提示", () => {
    const newer = updateState(APP_VERSION, "2099-12-31-2359");
    expect(isUpdateAvailableForCurrentBuild(newer)).toBe(true);
    expect(deriveUpdateStatus(newer)).toBe("available");
  });
});
