import { describe, expect, it } from "vitest";
import { decideFullscreenChange } from "./fullscreenTransitionCore";

describe("decideFullscreenChange", () => {
  it("退出事务中先收到空 fullscreenElement 时等待 Promise 提交", () => {
    expect(decideFullscreenChange({
      browserActive: false,
      controllerActive: true,
      fallbackActive: false,
      transition: "exiting"
    })).toBe("keep");
  });

  it("进入事务中的短暂空状态不会提前拆掉全屏壳", () => {
    expect(decideFullscreenChange({
      browserActive: false,
      controllerActive: true,
      fallbackActive: false,
      transition: "entering"
    })).toBe("keep");
  });

  it("浏览器外部 Esc 完成后清理当前控制器状态", () => {
    expect(decideFullscreenChange({
      browserActive: false,
      controllerActive: true,
      fallbackActive: false,
      transition: "idle"
    })).toBe("cleanup");
  });

  it("CSS 兜底和网站自己的全屏不会被误清理或误接管", () => {
    expect(decideFullscreenChange({
      browserActive: false,
      controllerActive: true,
      fallbackActive: true,
      transition: "idle"
    })).toBe("keep");
    expect(decideFullscreenChange({
      browserActive: true,
      controllerActive: false,
      fallbackActive: false,
      transition: "idle"
    })).toBe("ignore");
  });
});
