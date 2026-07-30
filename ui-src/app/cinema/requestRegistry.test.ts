import { describe, expect, it, vi } from "vitest";
import { CinemaRequestRegistry } from "./requestRegistry";

describe("cinema request registry", () => {
  it("allows only the newest generation in a domain to commit", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("one").mockReturnValueOnce("two") });
    const registry = new CinemaRequestRegistry();
    const first = registry.begin("playback", "100");
    const second = registry.begin("playback", "200");
    expect(registry.isCurrent(first)).toBe(false);
    expect(registry.isCurrent(second)).toBe(true);
    expect(registry.currentKey("playback")).toBe("200");
    registry.invalidate("playback");
    expect(registry.currentKey("playback")).toBe("");
    vi.unstubAllGlobals();
  });

  it("does not clear a newer request when an older request finishes", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("one").mockReturnValueOnce("two") });
    const registry = new CinemaRequestRegistry();
    const first = registry.begin("catalog", "discover");
    const second = registry.begin("catalog", "search:latest");
    registry.finish(first);
    expect(registry.isCurrent(second)).toBe(true);
    registry.finish(second);
    expect(registry.isCurrent(second)).toBe(false);
    vi.unstubAllGlobals();
  });
});
