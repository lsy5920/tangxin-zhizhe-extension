import type { BridgeState } from "../types";

export type CinemaRuntimeResponse = {
  ok?: boolean;
  error?: string;
  state?: BridgeState;
  stale?: boolean;
  [key: string]: unknown;
};

export type CinemaRuntimeError = Error & { response?: CinemaRuntimeResponse };

/**
 * 独立影院只通过这一处访问 Service Worker。统一超时和错误对象后，目录、播放与下载
 * 不再各自实现一套 Promise.race，也能在失败时可靠合并后台返回的最新公开状态。
 */
export async function sendCinemaRuntime(
  type: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 120_000
): Promise<CinemaRuntimeResponse> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`后台操作超时：${type}`)), timeoutMs);
  });
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type, ...payload }) as Promise<CinemaRuntimeResponse>,
      timeout
    ]);
    if (!response?.ok) {
      const error = new Error(response?.error || `后台操作失败：${type}`) as CinemaRuntimeError;
      error.response = response;
      throw error;
    }
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function copyCinemaText(text: string) {
  const value = String(text || "");
  if (!value) throw new Error("当前没有可复制的内容");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("浏览器没有完成复制操作");
}
