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

/**
 * 播放器进入浏览器全屏（对齐网站自定义播放器）。
 *
 * 顺序：
 * 1. playerRoot（播放器壳，含画面+控件，等同 Video.js / Plyr 的 player.el_）
 * 2. pluginHost（扩展 light DOM 宿主，Shadow 失败时的主兼容路径）
 * 3. video（等同 <video>.requestFullscreen / iOS webkitEnterFullscreen）
 * 4. documentElement（少数浏览器只允许根节点）
 */
export async function enterPlayerBrowserFullscreen(params: {
  playerRoot: HTMLElement | null;
  video: HTMLVideoElement | null;
  pluginHost?: HTMLElement | null;
}): Promise<EnterFullscreenResult> {
  const { playerRoot, video, pluginHost = getPluginHost() } = params;
  const candidates: Array<{ el: HTMLElement; via: EnterFullscreenResult["via"] }> = [];

  // 1) 播放器根：网站自定义播放器首选（画面+自绘控件一起进全屏）
  if (playerRoot) candidates.push({ el: playerRoot, via: "player" });
  // 2) 扩展宿主 light DOM
  if (pluginHost) candidates.push({ el: pluginHost, via: "host" });
  // 3) video 节点：网站原生 <video> 写法 / iOS
  if (video) candidates.push({ el: video, via: "video" });
  // 4) 页面根
  if (document.documentElement) candidates.push({ el: document.documentElement, via: "document" });

  let lastError: unknown = null;
  for (const item of candidates) {
    try {
      await requestElementFullscreen(item.el);
      // 部分浏览器 resolve 时 fullscreenElement 尚未更新，稍等一帧再确认
      await new Promise((r) => window.setTimeout(r, 0));
      const real = isBrowserFullscreen();
      if (real || item.via === "video") {
        return {
          ok: true,
          via: item.via,
          real: real || item.via === "video",
          message: real
            ? `已调用浏览器全屏（${viaLabel(item.via)}）`
            : `已调用 iOS/内核视频全屏（${viaLabel(item.via)}）`
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
 */
export function applyAdaptiveVideoLayout(video: HTMLVideoElement | null, fill: "contain" | "cover" | "fill" = "contain") {
  if (!video) return;
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.left = "0";
  video.style.top = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.maxWidth = "100%";
  video.style.maxHeight = "100%";
  video.style.margin = "0";
  video.style.padding = "0";
  video.style.border = "0";
  video.style.objectFit = fill;
  video.style.objectPosition = "50% 50%";
  video.style.background = "#000";
  // 移动端内联播放，避免一播放就强制系统播放器（非用户点全屏时）
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
}
