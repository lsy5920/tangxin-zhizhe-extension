export type FullscreenTransition = "idle" | "entering" | "exiting";

export type FullscreenChangeDecision = "activate" | "cleanup" | "keep" | "ignore";

/**
 * 把 fullscreenchange 的时序判断收口为纯函数。
 *
 * Fullscreen API 的事件可能早于或晚于 Promise 完成，因此正在进入/退出时只能
 * 等待事务提交；否则事件处理器会提前恢复宿主样式，造成系统仍全屏但播放器已缩回。
 */
export function decideFullscreenChange(input: {
  browserActive: boolean;
  controllerActive: boolean;
  fallbackActive: boolean;
  transition: FullscreenTransition;
}): FullscreenChangeDecision {
  if (input.browserActive) {
    // 只接管本控制器发起/维护的全屏；网站自身播放器进入全屏时不能误激活插件壳。
    return input.controllerActive || input.transition !== "idle" ? "activate" : "ignore";
  }
  if (input.transition !== "idle" || input.fallbackActive) return "keep";
  if (input.controllerActive) return "cleanup";
  return "ignore";
}
