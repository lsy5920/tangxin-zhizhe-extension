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
  // 关键：不要写 filter / -webkit-filter，Android/Kiwi 会黑屏只剩声音
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
    "filter:none",
    "-webkit-filter:none",
    `object-fit:${fit}`,
    "object-position:50% 50%",
    // 透明底：letterbox 黑边由外壳提供，避免 video 黑底在 Android 全屏合成时整层黑死
    "background:transparent",
    "opacity:1",
    "visibility:visible",
    "display:block",
    "z-index:2"
  ].join(";");
  // 移动端内联播放，避免非全屏时被系统播放器抢走
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("x5-playsinline", "true");
  video.setAttribute("x5-video-player-type", "h5");
  video.setAttribute("x5-video-player-fullscreen", "true");
  (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
}

/**
 * 强制 video 重新参与合成（Android/Kiwi 全屏后常见「只出声不画面」）。
 * 用 visibility 闪一下 + 尺寸重算，避免 filter/transform 类副作用。
 */
export function kickVideoPaint(video: HTMLVideoElement | null) {
  if (!video) return;
  try {
    video.style.setProperty("visibility", "hidden", "important");
    // 强制 reflow
    void video.offsetWidth;
    video.style.setProperty("visibility", "visible", "important");
    video.style.setProperty("opacity", "1", "important");
    video.style.setProperty("display", "block", "important");
  } catch {
    // 忽略
  }
}

/** 隐藏 ArtPlayer 可能盖住画面的海报/遮罩层 */
function hideArtCoverLayers(container: HTMLElement | null, video: HTMLVideoElement | null) {
  const roots: Element[] = [];
  if (container) roots.push(container);
  if (video?.parentElement) roots.push(video.parentElement);
  const player = video?.closest?.(".art-video-player") as HTMLElement | null;
  if (player) roots.push(player);
  const seen = new Set<Element>();
  roots.forEach((root) => {
    if (seen.has(root)) return;
    seen.add(root);
    root.querySelectorAll?.(".art-poster, .art-mask, .art-loading, .art-state").forEach((node) => {
      const el = node as HTMLElement;
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("opacity", "0", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.style.setProperty("background", "transparent", "important");
    });
    if (root instanceof HTMLElement && root.classList.contains("art-video-player")) {
      root.style.setProperty("background", "transparent", "important");
      root.style.setProperty("background-color", "transparent", "important");
    }
  });
}

/** 全屏后强制校正播放器容器与 video 尺寸，防止 0 高/被盖住/合成层丢失。 */
export function forceFullscreenVideoVisible(params: {
  shell: HTMLElement | null;
  container: HTMLElement | null;
  video: HTMLVideoElement | null;
  fill?: "contain" | "cover" | "fill";
}) {
  const { shell, container, video, fill = "contain" } = params;
  // 只改必要属性，并打标记，退出全屏时必须 clearForcedFullscreenStyles 清掉，
  // 否则会卡在「竖排假全屏 + 浏览器导航栏」无法回面板。
  const applyOuterBox = (el: HTMLElement | null, black: boolean, enforceGeometry = true) => {
    if (!el) return;
    el.dataset.txzzFsForced = "1";
    if (enforceGeometry) {
      el.style.setProperty("position", "absolute", "important");
      el.style.setProperty("inset", "0", "important");
      el.style.setProperty("left", "0", "important");
      el.style.setProperty("top", "0", "important");
      el.style.setProperty("right", "0", "important");
      el.style.setProperty("bottom", "0", "important");
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("height", "100%", "important");
      el.style.setProperty("min-width", "0", "important");
      el.style.setProperty("min-height", "0", "important");
      el.style.setProperty("max-width", "none", "important");
      el.style.setProperty("max-height", "none", "important");
      el.style.setProperty("margin", "0", "important");
      el.style.setProperty("padding", "0", "important");
      el.style.setProperty("border", "0", "important");
      el.style.setProperty("border-radius", "0", "important");
      el.style.setProperty("transform", "none", "important");
    }
    // 外层壳可黑底；含 video 的容器必须透明，否则 Android 合成层只出声
    el.style.setProperty("background", black ? "#000" : "transparent", "important");
    el.style.setProperty("background-color", black ? "#000" : "transparent", "important");
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("z-index", "1", "important");
  };
  // shell 的几何与 transform 由 React/CSS 全屏状态负责；强写 none 会破坏竖屏视口下的 90° 横屏兜底。
  applyOuterBox(shell, true, false);
  applyOuterBox(container, false);
  const stage = shell?.querySelector?.(".txzz-player-orientation-stage") as HTMLElement | null;
  applyOuterBox(stage, false);
  const artPlayer = (container?.querySelector?.(".art-video-player") || video?.closest?.(".art-video-player")) as HTMLElement | null;
  applyOuterBox(artPlayer, false);

  applyAdaptiveVideoLayout(video, fill);
  if (video) {
    // video 本身背景透明，让画面层露出来
    video.style.setProperty("background", "transparent", "important");
    video.style.setProperty("background-color", "transparent", "important");
    video.style.setProperty("z-index", "2", "important");
    video.style.setProperty("opacity", "1", "important");
    video.style.setProperty("visibility", "visible", "important");
    video.style.setProperty("display", "block", "important");
    video.style.setProperty("filter", "none", "important");
    video.style.setProperty("-webkit-filter", "none", "important");
    video.style.setProperty("object-position", "var(--txzz-player-video-position-x, 50%) 50%", "important");
  }
  hideArtCoverLayers(container, video);
  kickVideoPaint(video);

  if (video && video.paused === false) {
    try {
      const p = video.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } catch {
      // 忽略
    }
  }
}

/**
 * 退出全屏时清掉 forceFullscreenVideoVisible 留下的内联样式，
 * 让 React className/style 重新接管，回到插件面板内嵌播放器。
 */
export function clearForcedFullscreenStyles(params: {
  shell: HTMLElement | null;
  container: HTMLElement | null;
  stage?: HTMLElement | null;
  video: HTMLVideoElement | null;
  fill?: "contain" | "cover" | "fill";
}) {
  const { shell, container, stage, video, fill = "contain" } = params;
  const clearEl = (el: HTMLElement | null) => {
    if (!el) return;
    // 逐个移除全屏强制属性，避免 cssText 清空把 React 正在管的属性搞乱后再残留
    [
      "position", "inset", "left", "top", "right", "bottom",
      "width", "height", "min-width", "min-height", "max-width", "max-height",
      "margin", "padding", "border", "border-radius", "background", "background-color",
      "overflow", "transform", "z-index", "box-shadow", "outline"
    ].forEach((name) => {
      el.style.removeProperty(name);
    });
    delete el.dataset.txzzFsForced;
  };
  clearEl(shell);
  clearEl(container);
  clearEl(stage || null);
  // forceFullscreenVideoVisible 也会校正 ArtPlayer 内层，退出时必须对称清理，避免二次全屏残留。
  const artPlayer = (container?.querySelector?.(".art-video-player") || video?.closest?.(".art-video-player")) as HTMLElement | null;
  clearEl(artPlayer);
  // video 只恢复自适应，不要保留 absolute 全屏盒模型以外的脏样式
  if (video) {
    [
      "position", "inset", "left", "top", "right", "bottom",
      "width", "height", "min-width", "min-height", "max-width", "max-height",
      "margin", "padding", "border", "transform", "filter", "-webkit-filter",
      "object-fit", "object-position", "background", "opacity", "visibility",
      "display", "z-index"
    ].forEach((name) => video.style.removeProperty(name));
    applyAdaptiveVideoLayout(video, fill);
  }
}
