import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

type FakeElement = {
  textContent: string;
  hidden: boolean;
  disabled: boolean;
  download: string;
  href: string;
  classList: { add: (name: string) => void; remove: (name: string) => void };
  addEventListener: (type: string, listener: () => Promise<void> | void) => void;
  click: () => void;
  remove: () => void;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const savePageSource = readFileSync(resolve(currentDirectory, "../../../save.js"), "utf8");

async function eventually(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  }
  throw new Error("保存页初始化超时");
}

function createSavePage(options: { picker?: boolean; artifactDirectory?: string[] } = {}) {
  const listeners = new Map<string, () => Promise<void> | void>();
  const classes = new Set<string>();
  const elements = new Map<string, FakeElement>();
  const makeElement = (id: string): FakeElement => ({
    textContent: "",
    hidden: id === "details" || id === "confirm",
    disabled: id === "save",
    download: "",
    href: "",
    classList: {
      add: (name) => classes.add(`${id}:${name}`),
      remove: (name) => classes.delete(`${id}:${name}`)
    },
    addEventListener: (type, listener) => listeners.set(`${id}:${type}`, listener),
    click: () => {},
    remove: () => {}
  });
  for (const id of ["title", "message", "details", "filename", "filesize", "verification", "save", "confirm"]) {
    elements.set(id, makeElement(id));
  }

  const events = { anchorClicks: 0, writes: 0, closes: 0, claims: 0, completions: 0, opfsReads: 0 };
  const file = Object.assign(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" }), { name: "糖果电影.mp4" });
  const artifact = {
    directory: options.artifactDirectory || ["txzz-downloads-v1", "task_1", "attempt_1"],
    filename: "糖果电影.mp4",
    bytes: file.size
  };
  const sendMessage = async (message: { type: string }) => {
    if (message.type === "claimSavePageToken") {
      events.claims += 1;
      return { ok: true, token: "ticket", kind: "video", artifact, expectedSize: file.size, filename: file.name };
    }
    if (message.type === "completeSavePageToken") {
      events.completions += 1;
      return { ok: true, saved: true };
    }
    throw new Error(`未预期消息：${message.type}`);
  };
  const directory = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async () => ({
      getFile: async () => {
        events.opfsReads += 1;
        return file;
      }
    })
  };
  const anchor = makeElement("anchor");
  anchor.click = () => { events.anchorClicks += 1; };

  const contextShape: Record<string, unknown> = {
    Blob,
    DataView,
    TextDecoder,
    Uint8Array,
    URLSearchParams,
    crypto: webcrypto,
    location: { hash: "#token=ticket" },
    navigator: { storage: { getDirectory: async () => directory } },
    chrome: { runtime: { sendMessage } },
    document: {
      body: { appendChild: () => {} },
      getElementById: (id: string) => elements.get(id),
      createElement: () => anchor
    },
    URL: {
      createObjectURL: () => "blob:artifact",
      revokeObjectURL: () => {}
    },
    setTimeout: (callback: () => void, delay = 0) => (delay < 1_000 ? setTimeout(callback, delay) : 1),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    console
  };
  if (options.picker) {
    contextShape.showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async () => { events.writes += 1; },
        close: async () => { events.closes += 1; },
        abort: async () => {}
      })
    });
  }
  const context = createContext(contextShape);
  runInContext(savePageSource, context, { filename: "save.js" });

  return { classes, elements, events, listeners };
}

describe("扩展安全保存页", () => {
  it("文件选择器实际写盘并关闭后才核销一次性令牌", async () => {
    const page = createSavePage({ picker: true });
    await eventually(() => page.elements.get("save")?.disabled === false);

    await page.listeners.get("save:click")?.();

    expect(page.events).toMatchObject({ writes: 1, closes: 1, completions: 1, anchorClicks: 0 });
    expect(page.elements.get("verification")?.textContent).toBe("已保存");
  });

  it("Blob 下载兜底只提交不误报完成，用户确认后才核销", async () => {
    const page = createSavePage();
    await eventually(() => page.elements.get("save")?.disabled === false);

    await page.listeners.get("save:click")?.();
    expect(page.events.anchorClicks).toBe(1);
    expect(page.events.completions).toBe(0);
    expect(page.elements.get("confirm")?.hidden).toBe(false);
    expect(page.elements.get("save")?.disabled).toBe(false);

    await page.listeners.get("confirm:click")?.();
    expect(page.events.completions).toBe(1);
    expect(page.elements.get("verification")?.textContent).toBe("已保存");
  });

  it("目录记录越界时在读取 OPFS 文件前拒绝", async () => {
    const page = createSavePage({ artifactDirectory: ["txzz-downloads-v1", "..", "attempt_1"] });
    await eventually(() => page.classes.has("message:error"));

    expect(page.events.opfsReads).toBe(0);
    expect(page.elements.get("save")?.disabled).toBe(true);
    expect(page.elements.get("message")?.textContent).toMatch(/目录记录无效/);
  });
});
