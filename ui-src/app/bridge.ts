import type { BridgeState, CloudDiagnosticsResponse, UiActionPayload } from "./types";

const STATE_EVENT = "txzz:state";
const ACTION_EVENT = "txzz:ui-action";
const READY_EVENT = "txzz:ui-ready";

declare global {
  interface Window {
    __txzzBridgeState?: BridgeState;
  }
}

export function readBridgeState(): BridgeState {
  return window.__txzzBridgeState || {};
}

export function listenBridgeState(callback: (state: BridgeState) => void) {
  const handler = (event: Event) => {
    callback((event as CustomEvent<BridgeState>).detail || readBridgeState());
  };
  window.addEventListener(STATE_EVENT, handler);
  callback(readBridgeState());

  return () => {
    window.removeEventListener(STATE_EVENT, handler);
  };
}

export function sendUiAction(action: string, payload: Record<string, unknown> = {}) {
  const detail: UiActionPayload = { action, payload };
  window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail }));
}

export function notifyUiReady() {
  window.dispatchEvent(new CustomEvent(READY_EVENT));
}

/** 云端体检由扩展后台按服务地址发起，并只向界面返回脱敏结果。 */
export async function requestCloudDiagnostics(): Promise<CloudDiagnosticsResponse> {
  const response = await chrome.runtime.sendMessage({ type: "checkRemoteDiagnostics" }) as CloudDiagnosticsResponse;
  if (!response?.ok && response?.error) throw new Error(response.error);
  return response || {};
}
