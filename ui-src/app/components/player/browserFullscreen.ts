/**
 * 浏览器全屏（与网站原生视频一致的调用方式）
 *
 * 一般网站写法：
 *   1) 自定义播放器：playerRoot.requestFullscreen({ navigationUI: "hide" })
 *   2) 纯 video：video.requestFullscreen({ navigationUI: "hide" })
 *   3) iOS Safari：video.webkitEnterFullscreen()
 *   4) 旧 WebKit：element.webkitRequestFullscreen()
 *
 * 本扩展 UI 在 Shadow DOM 内，Shadow 子节点 requestFullscreen 经常失败，
 * 因此在「播放器根节点」之后追加 light DOM 宿主 / 页面根节点作为兼容路径。
 */

export type FullscreenOptions = {
  navigationUI?: "auto" | "hide" | "show";
};

type FsEl = HTMLElement & {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: (options?: FullscreenOptions | unknown) => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
  webkitEnterFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

export const PLAYER_FULLSCREEN_HOST_CLASS = "txzz-player-fullscreen-mode";

export function getPluginHost(): HTMLElement | null {
  return document.getElementById("txzz-candy-ui-root");
}

/** 当前全屏元素（含 Shadow 内、WebKit 前缀）。 */
export function getFullscreenElement(): Element | null {
  const doc = document as FsDoc;
  const host = getPluginHost();
  const shadowFs = host?.shadowRoot?.fullscreenElement || null;
  return shadowFs || document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
}

export function isBrowserFullscreen(): boolean {
  return Boolean(getFullscreenElement());
}

/**
 * 网站同源写法：对单个元素申请全屏。
 * 优先标准 Fullscreen API + navigationUI:hide（隐藏浏览器导航栏，更沉浸）。
 */
export async function requestElementFullscreen(element: HTMLElement): Promise<void> {
  const el = element as FsEl;
  const options: FullscreenOptions = { navigationUI: "hide" };

  if (typeof el.requestFullscreen === "function") {
    await el.requestFullscreen(options);
    return;
  }
  if (typeof el.webkitRequestFullscreen === "function") {
    await Promise.resolve(el.webkitRequestFullscreen(options));
    return;
  }
  if (typeof el.webkitRequestFullScreen === "function") {
    await Promise.resolve(el.webkitRequestFullScreen());
    return;
  }
  if (typeof el.msRequestFullscreen === "function") {
    await Promise.resolve(el.msRequestFullscreen());
    return;
  }
  // iOS：只有 HTMLVideoElement 有 webkitEnterFullscreen
  if (typeof el.webkitEnterFullscreen === "function") {
    await Promise.resolve(el.webkitEnterFullscreen());
    return;
  }
  throw new Error("当前环境不支持 Fullscreen API");
}

/** 退出全屏（网站通用写法）。 */
export async function exitBrowserFullscreen(): Promise<void> {
  const doc = document as FsDoc;
  if (!getFullscreenElement()) return;
  if (typeof document.exitFullscreen === "function") {
    try {
      await document.exitFullscreen();
      return;
    } catch {
      // 继续尝试前缀
    }
  }
  if (typeof doc.webkitExitFullscreen === "function") {
    await Promise.resolve(doc.webkitExitFullscreen());
    return;
  }
  if (typeof doc.msExitFullscreen === "function") {
    await Promise.resolve(doc.msExitFullscreen());
  }
}

export type EnterFullscreenResult = {
  ok: boolean;
  /** 实际进入全屏的元素类型 */
  via: "player" | "host" | "video" | "document" | "css-fallback";
  real: boolean;
  message: string;
};

function isIOSLike() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * 播放器进入浏览器全屏（对齐网站自定义播放器）。
 *
 * 顺序（扩展场景优化，避免 video 单独全屏导致自定义壳黑屏）：
 * 1. pluginHost（light DOM 宿主，扩展最稳）
 * 2. playerRoot（播放器壳，等同 Video.js player.el_）
 * 3. documentElement
 * 4. 仅 iOS：video.webkitEnterFullscreen()
 *
 * 注意：Android/桌面不要优先 video 单独全屏——video 进系统层后，
 * 插件壳仍在下面铺黑，用户会感觉「全屏后没画面」。
 */
export async function enterPlayerBrowserFullscreen(params: {
  playerRoot: HTMLElement | null;
  video: HTMLVideoElement | null;
  pluginHost?: HTMLElement | null;
}): Promise<EnterFullscreenResult> {
  const { playerRoot, video, pluginHost = getPluginHost() } = params;
  const candidates: Array<{ el: HTMLElement; via: EnterFullscreenResult["via"] }> = [];

  if (pluginHost) candidates.push({ el: pluginHost, via: "host" });
  if (playerRoot) candidates.push({ el: playerRoot, via: "player" });
  if (document.documentElement) candidates.push({ el: document.documentElement, via: "document" });
  // iOS 才把 video 作为候选（webkitEnterFullscreen）
  if (video && isIOSLike()) candidates.push({ el: video, via: "video" });

  let lastError: unknown = null;
  for (const item of candidates) {
    try {
      await requestElementFullscreen(item.el);
      await new Promise((r) => window.setTimeout(r, 16));
      const fsEl = getFullscreenElement();
      const real = Boolean(fsEl);
      // video 单独 webkit 全屏时 document.fullscreenElement 可能仍为空
      if (real || item.via === "video") {
        return {
          ok: true,
          via: item.via,
          real: real || item.via === "video",
          message: real
            ? `已调用浏览器全屏（${viaLabel(item.via)}）`
            : `已调用 iOS 视频全屏（${viaLabel(item.via)}）`
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  return {
    ok: false,
    via: "css-fallback",
    real: false,
    message: lastError instanceof Error
      ? `浏览器全屏被拒绝：${lastError.message}`
      : "浏览器全屏被拒绝，已使用页面内铺满"
  };
}

function viaLabel(via: EnterFullscreenResult["via"]) {
  if (via === "player") return "播放器容器";
  if (via === "host") return "插件宿主";
  if (via === "video") return "video 元素";
  if (via === "document") return "页面根节点";
  return "CSS 铺满";
}

/** 进入全屏前准备宿主：黑底、可点、铺满，隐藏插件壳。 */
export function prepareFullscreenChrome(host: HTMLElement | null) {
  if (!host) return;
  host.classList.add(PLAYER_FULLSCREEN_HOST_CLASS);
  host.style.setProperty("background", "#000", "important");
  host.style.setProperty("pointer-events", "auto", "important");
  host.style.setProperty("width", "100%", "important");
  host.style.setProperty("height", "100%", "important");
  host.style.setProperty("inset", "0", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("z-index", "2147483647", "important");
}

/** 退出全屏后恢复宿主默认透明穿透。 */
export function restoreFullscreenChrome(host: HTMLElement | null) {
  if (!host) return;
  host.classList.remove(PLAYER_FULLSCREEN_HOST_CLASS);
  host.style.removeProperty("background");
  host.style.pointerEvents = "none";
  host.style.position = "fixed";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
}

/**
 * 让 video 在容器内自适应：完整显示、居中、不变形。
 * 对应网站常见：object-fit: contain; width/height: 100%
 * 注意：不要写死像素宽高，避免全屏后变成 0×0 黑屏。
 */
export function applyAdaptiveVideoLayout(video: HTMLVideoElement | null, fill: "contain" | "cover" | "fill" = "contain") {
  if (!video) return;
  const fit = fill || "contain";
  video.style.cssText = [
    "position:absolute",
    "inset:0",
    "left:0",
    "top:0",
    "right:0",
    "bottom:0",
    "width:100%",
    "height:100%",
    "min-width:0",
    "min-height:0",
    "max-width:none",
    "max-height:none",
    "margin:0",
    "padding:0",
    "border:0",
    "transform:none",
    `object-fit:${fit}`,
    "object-position:50% 50%",
    "background:#000",
    "opacity:1",
    "visibility:visible",
    "z-index:1"
  ].join(";");
  // 移动端内联播放，避免非全屏时被系统播放器抢走
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
}

/** 全屏后强制校正播放器容器与 video 尺寸，防止 0 高/被盖住。 */
export function forceFullscreenVideoVisible(params: {
  shell: HTMLElement | null;
  container: HTMLElement | null;
  video: HTMLVideoElement | null;
  fill?: "contain" | "cover" | "fill";
}) {
  const { shell, container, video, fill = "contain" } = params;
  const box = "position:absolute;inset:0;left:0;top:0;right:0;bottom:0;width:100%;height:100%;min-width:0;min-height:0;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#000;overflow:hidden;transform:none;";
  if (shell) {
    shell.style.cssText = `${box}z-index:1;`;
  }
  if (container) {
    container.style.cssText = `${box}z-index:1;`;
  }
  applyAdaptiveVideoLayout(video, fill);
  // 尝试继续播放，防止全屏切换后卡在暂停/黑帧
  if (video && video.paused === false) {
    try {
      const p = video.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } catch {
      // 忽略自动播放限制
    }
  }
}
