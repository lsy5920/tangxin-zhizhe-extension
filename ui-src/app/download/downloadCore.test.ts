import { describe, expect, it } from "vitest";
import { Parser } from "m3u8-parser";

await import("../../../download_core.js");

const core = (globalThis as typeof globalThis & {
  TxzzDownloadCore: {
    chooseVariant: (variants: unknown[], options: Record<string, unknown>) => Record<string, unknown>;
    parsePlaylist: (text: string, url: string, parser: typeof Parser) => {
      mediaSequence: number;
      endList: boolean;
      live: boolean;
      segments: Array<{
        sequence: number;
        byteRange: { length: number; offset: number } | null;
        discontinuity: boolean;
        key: { method: string; uri: string; iv: Uint8Array | null } | null;
        map: { url: string; byteRange: { length: number; offset: number } | null } | null;
      }>;
      variants: Array<Record<string, unknown>>;
      unsupportedReasons: string[];
    };
    selectByteRangeBytes: (range: { length: number; offset: number }, status: number, contentRange: string, bytes: Uint8Array) => Uint8Array;
    sequenceIv: (sequence: number) => Uint8Array;
    validatePlan: (plan: unknown) => unknown;
  };
}).TxzzDownloadCore;

describe("download core", () => {
  it("uses MEDIA-SEQUENCE for implicit AES IV and preserves explicit IV", () => {
    const implicit = core.sequenceIv(513);
    expect(Array.from(implicit.slice(12))).toEqual([0, 0, 2, 1]);

    const plan = core.parsePlaylist(`#EXTM3U
#EXT-X-MEDIA-SEQUENCE:513
#EXT-X-KEY:METHOD=AES-128,URI="key-a.bin",IV=0x0000000000000000000000000000002A
#EXTINF:4,
segment-a.ts
#EXT-X-KEY:METHOD=AES-128,URI="key-b.bin"
#EXTINF:4,
segment-b.ts
#EXT-X-ENDLIST`, "https://media.example/path/index.m3u8", Parser);

    expect(plan.segments[0].sequence).toBe(513);
    expect(plan.segments[1].sequence).toBe(514);
    expect(plan.segments[0].key?.uri).toBe("https://media.example/path/key-a.bin");
    expect(Array.from(plan.segments[0].key?.iv || [])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 42]);
    expect(plan.segments[1].key?.uri).toBe("https://media.example/path/key-b.bin");
    expect(plan.segments[1].key?.iv).toBeNull();
  });

  it("normalizes MAP, implicit BYTERANGE offsets, key rotation and discontinuity", () => {
    const plan = core.parsePlaylist(`#EXTM3U
#EXT-X-MEDIA-SEQUENCE:10
#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"
#EXT-X-BYTERANGE:1000@100
#EXTINF:4,
video.mp4
#EXT-X-DISCONTINUITY
#EXT-X-BYTERANGE:1200
#EXTINF:4,
video.mp4
#EXT-X-ENDLIST`, "https://media.example/vod/index.m3u8", Parser);

    expect(plan.segments[0].map).toMatchObject({
      url: "https://media.example/vod/init.mp4",
      byteRange: { length: 100, offset: 0 }
    });
    expect(plan.segments[0].byteRange).toEqual({ length: 1000, offset: 100 });
    expect(plan.segments[1].byteRange).toEqual({ length: 1200, offset: 1100 });
    expect(plan.segments[1].discontinuity).toBe(true);
  });

  it("rejects live, SAMPLE-AES and separate audio before download", () => {
    const live = core.parsePlaylist(`#EXTM3U
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.bin"
#EXTINF:4,
segment.ts`, "https://media.example/live.m3u8", Parser);
    expect(live.live).toBe(true);
    expect(live.unsupportedReasons.join(" ")).toContain("SAMPLE-AES");
    expect(() => core.validatePlan(live)).toThrow(/直播|SAMPLE-AES/);

    const master = core.parsePlaylist(`#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="主音轨",URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="audio"
video.m3u8`, "https://media.example/master.m3u8", Parser);
    expect(master.variants[0]).toMatchObject({ separateAudio: true });
  });

  it("selects data-saver, balanced and high-quality variants deterministically", () => {
    const variants = [
      { id: "360", height: 360, bandwidth: 800_000 },
      { id: "720", height: 720, bandwidth: 2_400_000 },
      { id: "1080", height: 1080, bandwidth: 5_000_000 }
    ];
    expect(core.chooseVariant(variants, { networkMode: "data-saver" }).id).toBe("720");
    expect(core.chooseVariant(variants, { networkMode: "balanced", viewportHeight: 720 }).id).toBe("720");
    expect(core.chooseVariant(variants, { networkMode: "high-quality" }).id).toBe("1080");
  });

  it("accepts only the exact Content-Range and safely handles servers that ignore Range", () => {
    const exact = core.selectByteRangeBytes(
      { offset: 4, length: 3 },
      206,
      "bytes 4-6/20",
      new Uint8Array([4, 5, 6])
    );
    expect(Array.from(exact)).toEqual([4, 5, 6]);

    expect(() => core.selectByteRangeBytes(
      { offset: 4, length: 3 },
      206,
      "bytes 3-5/20",
      new Uint8Array([3, 4, 5])
    )).toThrow(/区间不匹配/);

    const sliced = core.selectByteRangeBytes(
      { offset: 4, length: 3 },
      200,
      "",
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    );
    expect(Array.from(sliced)).toEqual([4, 5, 6]);

    expect(() => core.selectByteRangeBytes(
      { offset: 4, length: 3 },
      200,
      "",
      new Uint8Array([4, 5, 6])
    )).toThrow(/未覆盖/);
  });
});
