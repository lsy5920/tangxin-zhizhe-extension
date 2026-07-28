import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAdaptiveVideoLayout,
  enterPlayerBrowserFullscreen,
  exitBrowserFullscreen,
  getPluginHost,
  isBrowserFullscreen,
  prepareFullscreenChrome,
  restoreFullscreenChrome
} from "../components/player/browserFullscreen";
import { decideFullscreenChange, type FullscreenTransition } from "./fullscreenTransitionCore";
import type { PlayerFillMode, PlayerOrientationMode } from "./preferences";

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait" | "landscape-primary" | "portrait-primary") => Promise<void>;
  unlock?: () => void;
};

async function requestOrientation(mode: PlayerOrientationMode, video: HTMLVideoElement | null) {
  const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
  if (!orientation) return "方向 API 不可用";
  const landscapeVideo = Number(video?.videoWidth || 0) >= Number(video?.videoHeight || 0);
  const wanted = mode === "auto" ? (landscapeVideo ? "landscape" : "") : mode;
  if (!wanted) {
    orientation.unlock?.();
    return "自动方向";
  }
  if (!orientation.lock) return wanted === "landscape" ? "请横握设备" : "请竖握设备";
  try {
    await orientation.lock(wanted);
    return wanted === "landscape" ? "系统横屏" : "系统竖屏";
  } catch {
    return wanted === "landscape" ? "横屏锁定受限，请横握设备" : "竖屏锁定受限";
  }
}

export function useFullscreenController(options: {
  video: () => HTMLVideoElement | null;
  fillMode: PlayerFillMode;
  orientationMode: PlayerOrientationMode;
}) {
  const { fillMode, orientationMode } = options;
  const videoGetterRef = useRef(options.video);
  videoGetterRef.current = options.video;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const generationRef = useRef(0);
  const transitionRef = useRef<FullscreenTransition>("idle");
  const activeRef = useRef(false);
  const immersiveFallbackRef = useRef(false);
  const desiredActiveRef = useRef(false);
  const exitPromiseRef = useRef<Promise<void> | null>(null);
  const [active, setActive] = useState(false);
  const [immersiveFallback, setImmersiveFallback] = useState(false);
  const [diagnostic, setDiagnostic] = useState("普通放映");

  const commitCleanup = useCallback(() => {
    transitionRef.current = "idle";
    desiredActiveRef.current = false;
    activeRef.current = false;
    immersiveFallbackRef.current = false;
    setActive(false);
    setImmersiveFallback(false);
    setDiagnostic("普通放映");
    try { (window.screen?.orientation as ScreenOrientationWithLock | undefined)?.unlock?.(); } catch { /* 浏览器可能拒绝无权限解锁。 */ }
    restoreFullscreenChrome(getPluginHost());
    applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
  }, [fillMode]);

  const cleanup = useCallback(() => {
    // 外部退出或组件卸载会取消所有尚未完成的进入/退出回调，防止旧事务重新写回。
    generationRef.current += 1;
    commitCleanup();
  }, [commitCleanup]);

  const exit = useCallback(async () => {
    if (exitPromiseRef.current) return exitPromiseRef.current;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    desiredActiveRef.current = false;
    transitionRef.current = "exiting";
    setDiagnostic("正在退出全屏");

    let operation: Promise<void>;
    operation = (async () => {
      const exited = await exitBrowserFullscreen();
      if (generation !== generationRef.current) return;
      if (exited || !isBrowserFullscreen()) {
        commitCleanup();
        return;
      }

      // 浏览器拒绝或尚未完成退出时绝不能先恢复内嵌布局，否则会在系统全屏层里
      // 留下只有几十像素高的播放器。保留全屏壳，让用户可再次点击或按 Esc 重试。
      transitionRef.current = "idle";
      activeRef.current = true;
      immersiveFallbackRef.current = false;
      setActive(true);
      setImmersiveFallback(false);
      setDiagnostic("浏览器仍在全屏，请再按 Esc 或点击返回");
      prepareFullscreenChrome(getPluginHost());
      applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
    })().finally(() => {
      if (exitPromiseRef.current === operation) exitPromiseRef.current = null;
    });
    exitPromiseRef.current = operation;
    return operation;
  }, [commitCleanup, fillMode]);

  const enter = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    desiredActiveRef.current = true;
    transitionRef.current = "entering";
    const host = getPluginHost();
    prepareFullscreenChrome(host);
    activeRef.current = true;
    immersiveFallbackRef.current = false;
    setActive(true);
    setImmersiveFallback(false);
    setDiagnostic("正在请求浏览器全屏");
    applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
    try {
      const result = await enterPlayerBrowserFullscreen({
        playerRoot: shellRef.current,
        video: videoGetterRef.current(),
        pluginHost: host
      });
      if (generation !== generationRef.current) {
        // 快速“进入→退出”时，旧 requestFullscreen 仍可能晚到；只清理由本控制器
        // 发起且用户已明确取消的迟到全屏，避免留下浏览器全屏孤儿层。
        if (result.real && !desiredActiveRef.current) void exitBrowserFullscreen();
        return;
      }
      immersiveFallbackRef.current = !result.real;
      setImmersiveFallback(!result.real);
      const orientation = await requestOrientation(orientationMode, videoGetterRef.current());
      if (generation !== generationRef.current) return;
      transitionRef.current = "idle";
      setDiagnostic(`${result.message} · ${orientation}`);
      window.requestAnimationFrame(() => applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode));
    } catch (error) {
      if (generation !== generationRef.current) return;
      // 异常也保持页面内铺满，用户仍能通过返回按钮恢复，不能留下黑屏宿主。
      transitionRef.current = "idle";
      immersiveFallbackRef.current = true;
      setImmersiveFallback(true);
      setDiagnostic(error instanceof Error
        ? `浏览器全屏异常：${error.message} · 已使用页面内铺满`
        : "浏览器全屏异常 · 已使用页面内铺满");
    }
  }, [fillMode, orientationMode]);

  const toggle = useCallback(async () => {
    if (activeRef.current || isBrowserFullscreen()) await exit();
    else await enter();
  }, [enter, exit]);

  useEffect(() => {
    const sync = () => {
      const browserActive = isBrowserFullscreen();
      const decision = decideFullscreenChange({
        browserActive,
        controllerActive: activeRef.current,
        fallbackActive: immersiveFallbackRef.current,
        transition: transitionRef.current
      });
      if (decision === "activate") {
        activeRef.current = true;
        immersiveFallbackRef.current = false;
        setActive(true);
        setImmersiveFallback(false);
        prepareFullscreenChrome(getPluginHost());
        applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
      } else if (decision === "cleanup") {
        cleanup();
      }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
    };
  }, [cleanup, fillMode]);

  useEffect(() => {
    if (active) applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
  }, [active, fillMode]);

  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  return { shellRef, active, immersiveFallback, diagnostic, enter, exit, toggle };
}
