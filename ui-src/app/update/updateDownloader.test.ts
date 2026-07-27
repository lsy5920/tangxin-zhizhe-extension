import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

type ClientSavePayload = {
  base64: string;
  expectedSize: number;
  expectedSha256: string;
  filename: string;
};

type DownloadEnvironment = {
  crypto: Crypto;
  document: unknown;
  URL: unknown;
  Blob: typeof Blob;
  setTimeout: (callback: () => void, delay: number) => number;
};

type UpdateDownloader = {
  saveVerifiedPackage: (
    payload: ClientSavePayload,
    environment: DownloadEnvironment
  ) => Promise<{ ok: boolean; saveVia: string; filename: string; verifiedSha256: string }>;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const downloaderSource = readFileSync(resolve(currentDirectory, "../../../update_downloader.js"), "utf8");

function loadDownloader(): UpdateDownloader {
  const context = createContext({
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    Uint8Array,
    DataView,
    Blob,
    crypto: webcrypto,
    globalThis: null
  });
  context.globalThis = context;
  runInContext(downloaderSource, context, { filename: "update_downloader.js" });
  return context.TxzzUpdateDownloader as UpdateDownloader;
}

function makeCrx3Bytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x43, 0x72, 0x32, 0x34], 0);
  new DataView(bytes.buffer).setUint32(4, 3, true);
  new DataView(bytes.buffer).setUint32(8, 16, true);
  for (let index = 12; index < bytes.length; index += 1) bytes[index] = (index * 17) % 251;
  return bytes;
}

function makePayload(bytes: Uint8Array): ClientSavePayload {
  return {
    base64: Buffer.from(bytes).toString("base64"),
    expectedSize: bytes.length,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    filename: "tangxin-zhizhe-latest.crx"
  };
}

function makeEnvironment() {
  const events = { clicked: 0, appended: 0, removed: 0, revoked: 0 };
  const anchor = {
    href: "",
    download: "",
    rel: "",
    style: { display: "" },
    click: () => { events.clicked += 1; },
    remove: () => { events.removed += 1; }
  };
  const parent = {
    appendChild: () => { events.appended += 1; }
  };
  const environment: DownloadEnvironment = {
    crypto: webcrypto as unknown as Crypto,
    document: {
      body: parent,
      documentElement: parent,
      createElement: () => anchor
    },
    URL: {
      createObjectURL: () => "blob:verified-crx",
      revokeObjectURL: () => { events.revoked += 1; }
    },
    Blob,
    setTimeout: (callback) => {
      callback();
      return 1;
    }
  };
  return { environment, events, anchor };
}

describe("页面 CRX 下载兜底", () => {
  it("复核大小、CRX3 文件头和 SHA-256 后点击 Blob 下载", async () => {
    const downloader = loadDownloader();
    const bytes = makeCrx3Bytes();
    const { environment, events, anchor } = makeEnvironment();

    const result = await downloader.saveVerifiedPackage(makePayload(bytes), environment);

    expect(result).toMatchObject({
      ok: true,
      saveVia: "content-blob",
      filename: "tangxin-zhizhe-latest.crx",
      verifiedSha256: makePayload(bytes).expectedSha256
    });
    expect(anchor.href).toBe("blob:verified-crx");
    expect(anchor.download).toBe("tangxin-zhizhe-latest.crx");
    expect(events).toEqual({ clicked: 1, appended: 1, removed: 1, revoked: 1 });
  });

  it("消息字节被篡改时在点击下载前拒绝", async () => {
    const downloader = loadDownloader();
    const bytes = makeCrx3Bytes();
    const payload = makePayload(bytes);
    payload.expectedSha256 = "0".repeat(64);
    const { environment, events } = makeEnvironment();

    await expect(downloader.saveVerifiedPackage(payload, environment)).rejects.toThrow("SHA-256 复核失败");
    expect(events.clicked).toBe(0);
  });

  it("拒绝带路径的 CRX 文件名", async () => {
    const downloader = loadDownloader();
    const bytes = makeCrx3Bytes();
    const payload = makePayload(bytes);
    payload.filename = "../tangxin-zhizhe-latest.crx";
    const { environment, events } = makeEnvironment();

    await expect(downloader.saveVerifiedPackage(payload, environment)).rejects.toThrow("文件名无效");
    expect(events.clicked).toBe(0);
  });
});
