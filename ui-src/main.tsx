import React from "react";
import { createRoot } from "react-dom/client";
import Artplayer from "artplayer";
import App from "./app/App";
import "./styles/index.css";

const HOST_ID = "txzz-candy-ui-root";
const ROOT_ID = "txzz-candy-ui";
const ARTPLAYER_STYLE_ID = "txzz-artplayer-style";

// 插件界面运行在 Shadow DOM 中，必须把播放器核心样式注入同一个 Shadow DOM，
// 否则 ArtPlayer 的控制栏、全屏和网页全屏样式会被隔离在外层页面里。
Artplayer.FULLSCREEN_WEB_IN_BODY = false;
Artplayer.LOG_VERSION = false;
// 关闭 ArtPlayer 内置单击播放 / 双击全屏：插件已有自定义控制层与手势，
// 内置双击全屏在扩展 Shadow DOM 里常失败，还会误触发我们的沉浸全屏，导致面板“突然消失”。
Artplayer.DBCLICK_FULLSCREEN = false;
Artplayer.MOBILE_CLICK_PLAY = false;
Artplayer.MOBILE_DBCLICK_PLAY = false;

function createHost() {
  const existed = document.getElementById(HOST_ID);
  if (existed?.shadowRoot) {
    return existed.shadowRoot;
  }

  const host = existed || document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    width: "100vw",
    height: "100vh",
    background: "transparent",
    pointerEvents: "none"
  });
  if (!existed) document.documentElement.appendChild(host);

  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  const styleHref = chrome.runtime.getURL("dist-ui/txzz-ui.css");

  if (!shadow.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = styleHref;
    shadow.appendChild(link);
  }

  if (!shadow.getElementById(ARTPLAYER_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = ARTPLAYER_STYLE_ID;
    style.textContent = `${Artplayer.STYLE}
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
:host(:-webkit-full-screen) .txzz-app-main {
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
:host(:-webkit-full-screen) .txzz-player-card-body,
:host(:fullscreen) .art-video-player,
:host(:-webkit-full-screen) .art-video-player {
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
:host(:fullscreen) video,
:host(:-webkit-full-screen) video,
:host(:fullscreen) .art-video,
:host(:-webkit-full-screen) .art-video {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  object-position: center !important;
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
:host(:fullscreen) .art-poster,
:host(:-webkit-full-screen) .art-poster,
:host(:fullscreen) .art-mask,
:host(:-webkit-full-screen) .art-mask,
:host(:fullscreen) .art-loading,
:host(:-webkit-full-screen) .art-loading,
:host(:fullscreen) .art-state,
:host(:-webkit-full-screen) .art-state {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
:host(:fullscreen) .txzz-app-panel-backdrop,
:host(:-webkit-full-screen) .txzz-app-panel-backdrop,
:host(:fullscreen) .txzz-app-sidebar,
:host(:-webkit-full-screen) .txzz-app-sidebar,
:host(:fullscreen) .txzz-app-header,
:host(:-webkit-full-screen) .txzz-app-header,
:host(:fullscreen) .txzz-app-mobile-nav,
:host(:-webkit-full-screen) .txzz-app-mobile-nav,
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
    shadow.appendChild(root);
  }

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
