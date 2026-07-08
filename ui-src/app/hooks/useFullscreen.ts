import { useEffect, useRef, useState } from "react";
import type { PlayerFullscreenDiagnostic } from "../components/VideoPlayer/types";

type UseFullscreenProps = {
  shellRef: React.RefObject<HTMLDivElement>;
  playerShellClass: string;
};

type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

/**
 * 全屏管理 Hook
 *
 * 职责：
 * - 管理浏览器全屏和沉浸全屏
 * - 全屏诊断
 * - 提供全屏控制方法
 */
export function useFullscreen({ shellRef, playerShellClass }: UseFullscreenProps) {
  const [browserFullscreenActive, setBrowserFullscreenActive] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PlayerFullscreenDiagnostic>({
    source: "未全屏",
    shellSize: "未测量",
    viewportSize: "未测量",
    coverage: 0,
    ok: true,
    issue: "普通播放模式"
  });

  const fullscreenActive = browserFullscreenActive || immersive;

  // 获取全屏元素
  const getFullscreenElement = () => {
    const doc = document as FullscreenDocument;
    const hostElement = document.getElementById("txzz-candy-ui-root");
    const shadowFullscreen = hostElement?.shadowRoot?.fullscreenElement || null;
    return shadowFullscreen || document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
  };

  // 测量全屏诊断
  const measureDiagnostic = () => {
    const shell = shellRef.current;
    const host = document.getElementById("txzz-candy-ui-root");
    if (!shell) return;

    const fullscreenNode = getFullscreenElement();
    let source: PlayerFullscreenDiagnostic["source"] = "未全屏";

    if (shell && fullscreenNode && (fullscreenNode === shell || shell.contains(fullscreenNode))) {
      source = "播放器壳层";
    } else if (host && fullscreenNode === host) {
      source = "插件宿主";
    } else if (immersive) {
      source = "沉浸兜底";
    } else if (!fullscreenNode) {
      source = "未全屏";
    } else {
      source = "未知";
    }

    if (source === "未全屏") {
      setDiagnostic({
        source: "未全屏",
        shellSize: "未测量",
        viewportSize: "未测量",
        coverage: 0,
        ok: true,
        issue: "普通播放模式"
      });
      return;
    }

    const rect = shell.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const widthRatio = viewportWidth ? rect.width / viewportWidth : 0;
    const heightRatio = viewportHeight ? rect.height / viewportHeight : 0;
    const coverage = Math.round(Math.max(0, Math.min(1, Math.min(widthRatio, heightRatio))) * 100);

    const rounded = Math.abs(rect.left) > 2 || Math.abs(rect.top) > 2 ||
      Math.abs(rect.width - viewportWidth) > 4 || Math.abs(rect.height - viewportHeight) > 4;

    const hostModeMissing = source === "插件宿主" && !host?.classList.contains(playerShellClass);

    const issue = hostModeMissing
      ? "宿主全屏模式未生效"
      : rounded
        ? "播放器容器未完全贴合视口"
        : "容器已贴合视口";

    setDiagnostic({
      source,
      shellSize: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      viewportSize: `${viewportWidth}x${viewportHeight}`,
      coverage,
      ok: !hostModeMissing && !rounded && coverage >= 99,
      issue
    });
  };

  // 请求浏览器全屏
  const requestFullscreen = async () => {
    const shell = shellRef.current;
    const host = document.getElementById("txzz-candy-ui-root");

    if (!shell) return;

    try {
      // 优先尝试播放器壳层全屏
      const shellTarget = shell as FullscreenTarget;
      const shellRequest = shellTarget.requestFullscreen || shellTarget.webkitRequestFullscreen || shellTarget.msRequestFullscreen;

      if (shellRequest) {
        host?.classList.add(playerShellClass);
        await shellRequest.call(shell);
        return;
      }

      // 降级到插件宿主全屏
      if (host) {
        const hostTarget = host as FullscreenTarget;
        const hostRequest = hostTarget.requestFullscreen || hostTarget.webkitRequestFullscreen || hostTarget.msRequestFullscreen;

        if (hostRequest) {
          host.classList.add(playerShellClass);
          await hostRequest.call(host);
          return;
        }
      }

      // 浏览器不支持全屏，使用沉浸模式兜底
      setImmersive(true);
    } catch (error) {
      console.warn("浏览器全屏失败，使用沉浸模式:", error);
      setImmersive(true);
    }
  };

  // 退出全屏
  const exitFullscreen = async () => {
    const doc = document as FullscreenDocument;
    const exit = document.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (getFullscreenElement() && exit) {
      try {
        await exit.call(document);
      } catch (error) {
        console.warn("退出全屏失败:", error);
      }
    }

    setImmersive(false);
    document.getElementById("txzz-candy-ui-root")?.classList.remove(playerShellClass);
  };

  // 切换沉浸模式
  const toggleImmersive = () => {
    setImmersive(!immersive);
  };

  // 监听浏览器全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(getFullscreenElement());
      setBrowserFullscreenActive(isFullscreen);

      if (!isFullscreen) {
        document.getElementById("txzz-candy-ui-root")?.classList.remove(playerShellClass);
      }

      measureDiagnostic();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    };
  }, [immersive, shellRef, playerShellClass]);

  // 定期更新诊断信息（全屏时）
  useEffect(() => {
    if (!fullscreenActive) return;

    const timer = setInterval(measureDiagnostic, 1000);
    measureDiagnostic(); // 立即测量一次

    return () => clearInterval(timer);
  }, [fullscreenActive, shellRef]);

  return {
    fullscreenActive,
    browserFullscreenActive,
    immersive,
    diagnostic,
    requestFullscreen,
    exitFullscreen,
    toggleImmersive
  };
}
