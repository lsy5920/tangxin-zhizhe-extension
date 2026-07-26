import { describe, expect, it } from "vitest";
import { loadPlaybackResume, RESUME_MAX_AGE_MS, savePlaybackResume } from "./resumeStore";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) || null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); }
  };
}

describe("断点续播", () => {
  it("忽略片头与距离结尾不足 30 秒的位置", () => {
    const storage = memoryStorage();
    expect(savePlaybackResume(storage, "1", 10, 100)).toBeNull();
    expect(savePlaybackResume(storage, "1", 80, 100)).toBeNull();
    expect(savePlaybackResume(storage, "1", 40, 100)?.currentTime).toBe(40);
  });

  it("记录 30 天后过期", () => {
    const storage = memoryStorage();
    savePlaybackResume(storage, "1", 40, 100, 1_000);
    expect(loadPlaybackResume(storage, "1", 1_000 + RESUME_MAX_AGE_MS - 1)?.currentTime).toBe(40);
    expect(loadPlaybackResume(storage, "1", 1_000 + RESUME_MAX_AGE_MS + 1)).toBeNull();
  });
});

