import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type RuntimeListener = (
  message: Record<string, unknown>,
  sender: unknown,
  sendResponse: (response: Record<string, unknown>) => void
) => boolean;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CRX 离屏下载提交", () => {
  it("从已验证字节创建 Blob、拉起保存对话框并确认下载任务", async () => {
    let runtimeListener: RuntimeListener | null = null;
    const download = vi.fn().mockResolvedValue(54);
    const search = vi.fn().mockResolvedValue([{ id: 54, state: "in_progress", danger: "safe" }]);
    const addChangedListener = vi.fn();
    const removeChangedListener = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:txzz-verified-crx");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: {
          addListener: (listener: RuntimeListener) => {
            runtimeListener = listener;
          }
        }
      },
      downloads: {
        download,
        search,
        onChanged: {
          addListener: addChangedListener,
          removeListener: removeChangedListener
        }
      }
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    // 不执行长达十分钟的 Blob 兜底回收计时器；本测试只验证提交契约。
    vi.stubGlobal("window", { setTimeout: vi.fn(() => 1) });

    // 直接执行正式离屏脚本，确保测试覆盖发布包实际使用的消息处理器。
    const source = readFileSync(resolve(process.cwd(), "offscreen_downloader.js"), "utf8");
    new Function(source)();
    expect(runtimeListener).not.toBeNull();

    const bytes = Buffer.from("Cr24-test-package", "utf8");
    const response = await new Promise<Record<string, unknown>>((resolveResponse) => {
      const keepChannelOpen = runtimeListener?.({
        type: "offscreenSaveVerifiedPackage",
        base64: bytes.toString("base64"),
        expectedSize: bytes.length,
        filename: "糖心志者/糖心志者_5.0.3_最新版.crx",
        saveAs: true
      }, {}, resolveResponse);
      expect(keepChannelOpen).toBe(true);
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith({
      url: "blob:txzz-verified-crx",
      filename: "糖心志者/糖心志者_5.0.3_最新版.crx",
      saveAs: true,
      conflictAction: "uniquify"
    });
    expect(search).toHaveBeenCalledWith({ id: 54 });
    expect(addChangedListener).toHaveBeenCalledOnce();
    expect(response).toMatchObject({
      ok: true,
      downloadId: 54,
      state: "in_progress",
      danger: "safe",
      saveVia: "offscreen-blob"
    });
  });
});
