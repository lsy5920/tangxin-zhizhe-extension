/**
 * 增强版全屏管理 Hook
 *
 * 新特性：
 * - 更流畅的全屏进入/退出动画
 * - 智能全屏检测和适配
 * - 移动端手势优化
 * - 画中画支持
 * - 旋转屏幕自动全屏
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { PlayerFullscreenDiagnostic } from "../components/VideoPlayer/types";

type UseEnhancedFullscreenProps = {
  shellRef: React.RefObject<HTMLDivElement>;
  playerShellClass: string;
  videoElement?: HTMLVideoElement | null;
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

type PiPVideoElement = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<any>;
  exitPictureInPicture?: () => Promise<void>;
};

type PiPDocument = Document & {
  pictureInPictureEnabled?: boolean;
  exitPictureInPicture?: () => Promise<void>;
  pictureInPictureElement?: HTMLVideoElement | null;
};

/**
 * 增强版全屏管理 Hook
 */
export function useEnhancedFullscreen({
  shellRef,
  playerShellClass,
  videoElement
}: UseEnhancedFullscreenProps) {
  const [browserFullscreenActive, setBrowserFullscreenActive] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PlayerFullscreenDiagnostic>({
    source: "未全屏",
    shellSize: "未测量",
    viewportSize: "未测量",
    coverage: 0,
    ok: true,
    issue: "普通播放模式"
  });

  const fullscreenActive = browserFullscreenActive || immersive;
  const animationFrameRef = useRef<number>();

  // 获取全屏元素
  const getFullscreenElement = useCallback(() => {
    const doc = document as FullscreenDocument;
    const hostElement = document.getElementById("txzz-candy-ui-root");
    const shadowFullscreen = hostElement?.shadowRoot?.fullscreenElement || null;
    return shadowFullscreen ||
           document.fullscreenElement ||
           doc.webkitFullscreenElement ||
           doc.msFullscreenElement ||
           null;
  }, []);

  // 检测是否为移动设备
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }, []);

  // 测量全屏诊断信息
  const measureDiagnostic = useCallback(() => {
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
    const viewportWidth = Math.max(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0
    );
    const viewportHeight = Math.max(
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0
    );
    const widthRatio = viewportWidth ? rect.width / viewportWidth : 0;
    const heightRatio = viewportHeight ? rect.height / viewportHeight : 0;
    const coverage = Math.round(
      Math.max(0, Math.min(1, Math.min(widthRatio, heightRatio))) * 100
    );

    const rounded =
      Math.abs(rect.left) > 2 ||
      Math.abs(rect.top) > 2 ||
      Math.abs(rect.width - viewportWidth) > 4 ||
      Math.abs(rect.height - viewportHeight) > 4;

    const hostModeMissing =
      source === "插件宿主" && !host?.classList.contains(playerShellClass);

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
  }, [shellRef, immersive, getFullscreenElement, playerShellClass]);

  // 请求浏览器全屏（带动画优化）
  const requestFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    const host = document.getElementById("txzz-candy-ui-root");

    if (!shell) return;

    try {
      // 添加过渡动画类
      shell.classList.add('txzz-fullscreen-entering');

      // 优先尝试播放器壳层全屏
      const shellTarget = shell as FullscreenTarget;
      const shellRequest =
        shellTarget.requestFullscreen ||
        shellTarget.webkitRequestFullscreen ||
        shellTarget.msRequestFullscreen;

      if (shellRequest) {
        host?.classList.add(playerShellClass);
        await shellRequest.call(shell);

        // 动画完成后移除过渡类
        setTimeout(() => {
          shell.classList.remove('txzz-fullscreen-entering');
          shell.classList.add('txzz-fullscreen-active');
        }, 300);

        return;
      }

      // 降级到插件宿主全屏
      if (host) {
        const hostTarget = host as FullscreenTarget;
        const hostRequest =
          hostTarget.requestFullscreen ||
          hostTarget.webkitRequestFullscreen ||
          hostTarget.msRequestFullscreen;

        if (hostRequest) {
          host.classList.add(playerShellClass);
          await hostRequest.call(host);

          setTimeout(() => {
            shell.classList.remove('txzz-fullscreen-entering');
            shell.classList.add('txzz-fullscreen-active');
          }, 300);

          return;
        }
      }

      // 浏览器不支持全屏，使用沉浸模式兜底
      shell.classList.remove('txzz-fullscreen-entering');
      setImmersive(true);
    } catch (error) {
      console.warn("[useEnhancedFullscreen] 浏览器全屏失败，使用沉浸模式:", error);
      shell.classList.remove('txzz-fullscreen-entering');
      setImmersive(true);
    }
  }, [shellRef, playerShellClass]);

  // 退出全屏（带动画优化）
  const exitFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    const doc = document as FullscreenDocument;
    const exit = document.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (shell) {
      shell.classList.add('txzz-fullscreen-exiting');
      shell.classList.remove('txzz-fullscreen-active');
    }

    if (getFullscreenElement() && exit) {
      try {
        await exit.call(document);
      } catch (error) {
        console.warn("[useEnhancedFullscreen] 退出全屏失败:", error);
      }
    }

    setImmersive(false);

    setTimeout(() => {
      shell?.classList.remove('txzz-fullscreen-exiting');
      document.getElementById("txzz-candy-ui-root")?.classList.remove(playerShellClass);
    }, 300);
  }, [shellRef, getFullscreenElement, playerShellClass]);

  // 切换沉浸模式
  const toggleImmersive = useCallback(() => {
    setImmersive(!immersive);
  }, [immersive]);

  // 请求画中画
  const requestPictureInPicture = useCallback(async () => {
    if (!videoElement) {
      console.warn("[useEnhancedFullscreen] 没有视频元素，无法开启画中画");
      return;
    }

    const pipDoc = document as PiPDocument;
    const pipVideo = videoElement as PiPVideoElement;

    if (!pipDoc.pictureInPictureEnabled || !pipVideo.requestPictureInPicture) {
      console.warn("[useEnhancedFullscreen] 浏览器不支持画中画");
      return;
    }

    try {
      await pipVideo.requestPictureInPicture();
      setPipActive(true);
    } catch (error) {
      console.error("[useEnhancedFullscreen] 画中画请求失败:", error);
    }
  }, [videoElement]);

  // 退出画中画
  const exitPictureInPicture = useCallback(async () => {
    const pipDoc = document as PiPDocument;

    if (pipDoc.pictureInPictureElement) {
      try {
        await pipDoc.exitPictureInPicture?.();
        setPipActive(false);
      } catch (error) {
        console.error("[useEnhancedFullscreen] 退出画中画失败:", error);
      }
    }
  }, []);

  // 监听浏览器全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(getFullscreenElement());
      setBrowserFullscreenActive(isFullscreen);

      if (!isFullscreen) {
        const shell = shellRef.current;
        shell?.classList.remove('txzz-fullscreen-active');
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
  }, [getFullscreenElement, measureDiagnostic, shellRef, playerShellClass]);

  // 监听画中画变化
  useEffect(() => {
    if (!videoElement) return;

    const handleEnterPip = () => setPipActive(true);
    const handleLeavePip = () => setPipActive(false);

    videoElement.addEventListener("enterpictureinpicture", handleEnterPip);
    videoElement.addEventListener("leavepictureinpicture", handleLeavePip);

    return () => {
      videoElement.removeEventListener("enterpictureinpicture", handleEnterPip);
      videoElement.removeEventListener("leavepictureinpicture", handleLeavePip);
    };
  }, [videoElement]);

  // 定期更新诊断信息（全屏时使用 RAF 优化）
  useEffect(() => {
    if (!fullscreenActive) return;

    const updateDiagnostic = () => {
      measureDiagnostic();
      animationFrameRef.current = requestAnimationFrame(updateDiagnostic);
    };

    animationFrameRef.current = requestAnimationFrame(updateDiagnostic);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [fullscreenActive, measureDiagnostic]);

  // 移动端屏幕旋转自动全屏
  useEffect(() => {
    if (!isMobile()) return;

    const handleOrientationChange = () => {
      // 横屏时自动全屏
      if (window.orientation === 90 || window.orientation === -90) {
        if (!fullscreenActive) {
          requestFullscreen();
        }
      }
      // 竖屏时退出全屏
      else if (window.orientation === 0 || window.orientation === 180) {
        if (fullscreenActive && !immersive) {
          exitFullscreen();
        }
      }
    };

    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, [isMobile, fullscreenActive, immersive, requestFullscreen, exitFullscreen]);

  return {
    fullscreenActive,
    browserFullscreenActive,
    immersive,
    pipActive,
    diagnostic,
    requestFullscreen,
    exitFullscreen,
    toggleImmersive,
    requestPictureInPicture,
    exitPictureInPicture,
    isMobile: isMobile()
  };
}
