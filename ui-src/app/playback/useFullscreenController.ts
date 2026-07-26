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
  const [active, setActive] = useState(false);
  const [immersiveFallback, setImmersiveFallback] = useState(false);
  const [diagnostic, setDiagnostic] = useState("普通放映");

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    setActive(false);
    setImmersiveFallback(false);
    setDiagnostic("普通放映");
    try { (window.screen?.orientation as ScreenOrientationWithLock | undefined)?.unlock?.(); } catch { /* 浏览器可能拒绝无权限解锁。 */ }
    restoreFullscreenChrome(getPluginHost());
    applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
  }, [fillMode]);

  const exit = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    try { await exitBrowserFullscreen(); } finally {
      if (generation === generationRef.current) cleanup();
    }
  }, [cleanup]);

  const enter = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const host = getPluginHost();
    prepareFullscreenChrome(host);
    setActive(true);
    setDiagnostic("正在请求浏览器全屏");
    applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
    const result = await enterPlayerBrowserFullscreen({
      playerRoot: shellRef.current,
      video: videoGetterRef.current(),
      pluginHost: host
    });
    if (generation !== generationRef.current) return;
    setImmersiveFallback(!result.real);
    const orientation = await requestOrientation(orientationMode, videoGetterRef.current());
    if (generation !== generationRef.current) return;
    setDiagnostic(`${result.message} · ${orientation}`);
    window.requestAnimationFrame(() => applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode));
  }, [fillMode, orientationMode]);

  const toggle = useCallback(async () => {
    if (active || isBrowserFullscreen()) await exit();
    else await enter();
  }, [active, enter, exit]);

  useEffect(() => {
    const sync = () => {
      if (isBrowserFullscreen()) {
        setActive(true);
        applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
      } else if (!immersiveFallback) {
        cleanup();
      }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
    };
  }, [cleanup, fillMode, immersiveFallback]);

  useEffect(() => {
    if (active) applyAdaptiveVideoLayout(videoGetterRef.current(), fillMode);
  }, [active, fillMode]);

  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  return { shellRef, active, immersiveFallback, diagnostic, enter, exit, toggle };
}
