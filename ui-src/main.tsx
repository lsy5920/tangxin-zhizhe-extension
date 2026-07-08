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
:host(:fullscreen), :host(:-webkit-full-screen) {
  width: 100vw !important;
  height: 100vh !important;
  background: #000 !important;
}
:host(:fullscreen) #${ROOT_ID}, :host(:-webkit-full-screen) #${ROOT_ID} {
  width: 100vw !important;
  height: 100vh !important;
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
