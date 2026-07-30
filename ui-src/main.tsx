import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { APP_BUILD, APP_VERSION } from "./app/constants";
import "./styles/index.css";
import candyUiStyles from "./styles/index.css?inline";

const HOST_ID = "txzz-candy-ui-root";
const ROOT_ID = "txzz-candy-ui";
const MEDIA_STYLE_ID = "txzz-media-style";
const APP_STYLE_ID = "txzz-app-style";
const APP_STYLE_MARKERS = [
  "--txzz-shadow-property-fallback",
  ".txzz-stat-ornament",
  ".txzz-cinema-app-shell",
  "@keyframes txzz-stat-float",
  "@keyframes txzz-companion-breathe"
] as const;

function resolveUiStylesheetHref() {
  const getRuntimeUrl = globalThis.chrome?.runtime?.getURL;
  const rawHref = typeof getRuntimeUrl === "function"
    ? getRuntimeUrl("dist-ui/txzz-ui.css")
    : "./dist-ui/txzz-ui.css";
  const stylesheetUrl = new URL(rawHref, document.baseURI);
  stylesheetUrl.searchParams.set("build", APP_BUILD);
  return stylesheetUrl.href;
}

function hasCompleteAppStyle(style: HTMLElement | null) {
  if (!(style instanceof HTMLStyleElement)) return false;
  if (style.dataset.txzzUiBuild !== APP_BUILD) return false;
  const css = style.textContent || "";
  return APP_STYLE_MARKERS.every((marker) => css.includes(marker));
}

function canReuseShadowRoot(host: HTMLElement, shadow: ShadowRoot, styleHref: string) {
  const appStyle = shadow.getElementById(APP_STYLE_ID);
  const mediaStyle = shadow.getElementById(MEDIA_STYLE_ID);
  const externalStyle = shadow.querySelector<HTMLLinkElement>('link[data-txzz-ui-stylesheet="external"]');
  const root = shadow.getElementById(ROOT_ID);

  return host.dataset.txzzUiBuild === APP_BUILD
    && hasCompleteAppStyle(appStyle)
    && mediaStyle instanceof HTMLStyleElement
    && mediaStyle.dataset.txzzUiBuild === APP_BUILD
    && (mediaStyle.textContent || "").includes(".txzz-player-shell")
    && externalStyle instanceof HTMLLinkElement
    && externalStyle.dataset.txzzUiBuild === APP_BUILD
    && externalStyle.href === styleHref
    && root instanceof HTMLDivElement;
}

function syncHostVisualViewport(host: HTMLElement) {
  const visual = window.visualViewport;
  const width = Math.max(280, Math.round(visual?.width || window.innerWidth || document.documentElement.clientWidth || 390));
  const height = Math.max(360, Math.round(visual?.height || window.innerHeight || document.documentElement.clientHeight || 640));
  const left = Math.round(visual?.offsetLeft || 0);
  const top = Math.round(visual?.offsetTop || 0);
  host.style.setProperty("--txzz-vvw", `${width}px`);
  host.style.setProperty("--txzz-vvh", `${height}px`);
  host.style.setProperty("--txzz-vleft", `${left}px`);
  host.style.setProperty("--txzz-vtop", `${top}px`);
  host.style.setProperty("--txzz-vcenter-x", `${left + width / 2}px`);
}

function bindHostVisualViewport(host: HTMLElement) {
  syncHostVisualViewport(host);
  if (host.dataset.txzzViewportBound === "1") return;
  host.dataset.txzzViewportBound = "1";
  const sync = () => syncHostVisualViewport(host);
  window.addEventListener("resize", sync, { passive: true });
  window.visualViewport?.addEventListener("resize", sync, { passive: true });
  window.visualViewport?.addEventListener("scroll", sync, { passive: true });
}

function createHost() {
  const styleHref = resolveUiStylesheetHref();
  let existed = document.getElementById(HOST_ID);
  if (existed) {
    if (existed.shadowRoot && canReuseShadowRoot(existed, existed.shadowRoot, styleHref)) {
      existed.dataset.txzzStyleIntegrity = "verified";
      bindHostVisualViewport(existed);
      return existed.shadowRoot;
    }
    // 页面未刷新但扩展已升级，或样式节点被缓存/页面脚本破坏时，必须整体重建。
    // 只比较构建号会永久复用残缺 ShadowRoot，表现为边框、背景和动画成片消失。
    existed.dataset.txzzStyleIntegrity = "rebuilding";
    existed.remove();
    existed = null;
  }

  const host = existed || document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    width: "100vw",
    // 动态视口避免手机地址栏/软键盘变化时产生双滚动；旧浏览器保留 vh 回退。
    height: globalThis.CSS?.supports?.("height", "100dvh") ? "100dvh" : "100vh",
    background: "transparent",
    pointerEvents: "none"
  });
  if (!existed) document.documentElement.appendChild(host);
  host.dataset.txzzUiVersion = APP_VERSION;
  host.dataset.txzzUiBuild = APP_BUILD;
  host.dataset.txzzStyleIntegrity = "initializing";
  bindHostVisualViewport(host);

  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });

  if (!shadow.querySelector('link[data-txzz-ui-stylesheet="external"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = styleHref;
    link.dataset.txzzUiStylesheet = "external";
    link.dataset.txzzUiBuild = APP_BUILD;
    link.addEventListener("load", () => {
      host.dataset.txzzExternalStyle = "ready";
    }, { once: true });
    link.addEventListener("error", () => {
      // 外置资源偶发被缓存或扩展资源策略拦截时，下面的同构内联副本仍保证完整 UI。
      host.dataset.txzzExternalStyle = "fallback-inline";
    }, { once: true });
    shadow.appendChild(link);
  }

  // 正式扩展页面可能在首帧尚未完成 chrome-extension:// 样式加载；内联同源构建样式
  // 作为确定性副本，确保 CRX 与开发者模式解压加载使用完全相同的 UI 元素与断点。
  if (!shadow.getElementById(APP_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = APP_STYLE_ID;
    style.dataset.txzzUiBuild = APP_BUILD;
    style.textContent = candyUiStyles;
    shadow.appendChild(style);
  }

  if (!shadow.getElementById(MEDIA_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = MEDIA_STYLE_ID;
    style.dataset.txzzUiBuild = APP_BUILD;
    // 浏览器 Fullscreen API 发生在 Shadow host 上，这部分结构样式必须与媒体内核无关。
    style.textContent = `
/* 真正进入浏览器 Fullscreen API 时：铺满系统全屏层，隐藏浏览器 UI 后的可视区域。 */
:host(:fullscreen),
:host(:-webkit-full-screen) {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: #000 !important;
  pointer-events: auto !important;
  overflow: hidden !important;
}
:host(:fullscreen) #${ROOT_ID},
:host(:-webkit-full-screen) #${ROOT_ID},
:host(:fullscreen) .txzz-candy-app,
:host(:-webkit-full-screen) .txzz-candy-app,
:host(:fullscreen) .txzz-app-panel-overlay,
:host(:-webkit-full-screen) .txzz-app-panel-overlay,
:host(:fullscreen) .txzz-app-panel-frame,
:host(:-webkit-full-screen) .txzz-app-panel-frame,
:host(:fullscreen) .txzz-app-main,
:host(:-webkit-full-screen) .txzz-app-main,
:host(:fullscreen) .txzz-cinema-app-shell,
:host(:-webkit-full-screen) .txzz-cinema-app-shell,
:host(:fullscreen) .txzz-cinema-app-main,
:host(:-webkit-full-screen) .txzz-cinema-app-main {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 100% !important;
  min-height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: #000 !important;
  box-shadow: none !important;
  overflow: hidden !important;
  pointer-events: auto !important;
  transform: none !important;
}
/* 播放器内部：absolute + 透明底，禁止层层 fixed 黑底盖住 video */
:host(:fullscreen) .txzz-playback-root,
:host(:-webkit-full-screen) .txzz-playback-root,
:host(:fullscreen) .txzz-player-card,
:host(:-webkit-full-screen) .txzz-player-card,
:host(:fullscreen) .txzz-player-shell,
:host(:-webkit-full-screen) .txzz-player-shell {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: #000 !important;
  overflow: hidden !important;
  transform: none !important;
}
:host(:fullscreen) .txzz-player-orientation-stage,
:host(:-webkit-full-screen) .txzz-player-orientation-stage,
:host(:fullscreen) .txzz-player-card-body,
:host(:-webkit-full-screen) .txzz-player-card-body {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: transparent !important;
  background-color: transparent !important;
  overflow: hidden !important;
  transform: none !important;
  z-index: 1 !important;
}
/* 手势层：全屏铺满但背景必须透明，否则会盖住 video */
:host(:fullscreen) .txzz-player-gesture-surface,
:host(:-webkit-full-screen) .txzz-player-gesture-surface {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: transparent !important;
  background-color: transparent !important;
  pointer-events: auto !important;
  z-index: 12 !important;
}
:host(:fullscreen) .txzz-player-brightness-mask,
:host(:-webkit-full-screen) .txzz-player-brightness-mask {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none !important;
  z-index: 8 !important;
}
:host(:fullscreen) .txzz-shaka-video,
:host(:-webkit-full-screen) .txzz-shaka-video {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  object-position: var(--txzz-player-video-position-x, 50%) 50% !important;
  filter: none !important;
  -webkit-filter: none !important;
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  z-index: 2 !important;
  background: transparent !important;
  background-color: transparent !important;
  transform: none !important;
}
:host(:fullscreen) .txzz-app-panel-backdrop,
:host(:-webkit-full-screen) .txzz-app-panel-backdrop,
:host(:fullscreen) .txzz-app-sidebar,
:host(:-webkit-full-screen) .txzz-app-sidebar,
:host(:fullscreen) .txzz-app-header,
:host(:-webkit-full-screen) .txzz-app-header,
:host(:fullscreen) .txzz-app-mobile-nav,
:host(:-webkit-full-screen) .txzz-app-mobile-nav,
:host(:fullscreen) .txzz-cinema-app-header,
:host(:-webkit-full-screen) .txzz-cinema-app-header,
:host(:fullscreen) .txzz-cinema-app-sidebar,
:host(:-webkit-full-screen) .txzz-cinema-app-sidebar,
:host(:fullscreen) .txzz-cinema-app-mobile-nav,
:host(:-webkit-full-screen) .txzz-cinema-app-mobile-nav,
:host(:fullscreen) .txzz-playback-hidden-during-fullscreen,
:host(:-webkit-full-screen) .txzz-playback-hidden-during-fullscreen,
:host(:fullscreen) .txzz-player-card-title,
:host(:-webkit-full-screen) .txzz-player-card-title,
:host(:fullscreen) .txzz-player-card-actions,
:host(:-webkit-full-screen) .txzz-player-card-actions {
  display: none !important;
}`;
    shadow.appendChild(style);
  }

  let root = shadow.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.txzzUiBuild = APP_BUILD;
    shadow.appendChild(root);
  }

  host.dataset.txzzStyleIntegrity = canReuseShadowRoot(host, shadow, styleHref) ? "verified" : "incomplete";

  return shadow;
}

const shadow = createHost();
const rootElement = shadow.getElementById(ROOT_ID);

if (rootElement && !rootElement.dataset.mounted) {
  rootElement.dataset.mounted = "1";
  document.documentElement.classList.add("txzz-candy-ui-ready");
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
