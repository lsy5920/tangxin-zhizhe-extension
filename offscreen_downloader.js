"use strict";

const tasks = new Map();

function absoluteUrl(link, baseUrl) {
  const value = String(link || "").trim();
  if (!value) return "";
  try {
    if (value.startsWith("//")) return `https:${value}`;
    return new URL(value, baseUrl || location.href).href;
  } catch (_) {
    return value;
  }
}

function parseAttributes(text = "") {
  const attrs = {};
  for (const item of String(text).matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)) {
    attrs[item[1].toUpperCase()] = String(item[2] || "").replace(/^"|"$/g, "");
  }
  return attrs;
}

function parseM3u8(text, playlistUrl) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const segments = [];
  const variants = [];
  const keys = new Map();
  let currentKey = null;
  let currentStream = null;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY")) {
      const attrs = parseAttributes(line.slice(line.indexOf(":") + 1));
      currentKey = {
        method: attrs.METHOD || "NONE",
        uri: attrs.URI ? absoluteUrl(attrs.URI, playlistUrl) : "",
        iv: attrs.IV || ""
      };
      if (currentKey.uri) keys.set(currentKey.uri, currentKey);
      continue;
    }
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      currentStream = parseAttributes(line.slice(line.indexOf(":") + 1));
      continue;
    }
    if (line.startsWith("#")) continue;
    if (currentStream) {
      variants.push({
        url: absoluteUrl(line, playlistUrl),
        bandwidth: Number(currentStream.BANDWIDTH || 0),
        resolution: currentStream.RESOLUTION || ""
      });
      currentStream = null;
      continue;
    }
    segments.push({
      url: absoluteUrl(line, playlistUrl),
      key: currentKey
    });
  }
  return { segments, variants, keys: Array.from(keys.values()) };
}

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/^0x/i, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function sequenceIv(index) {
  const iv = new Uint8Array(16);
  const view = new DataView(iv.buffer);
  view.setUint32(12, index + 1);
  return iv;
}

async function decryptSegment(bytes, keyInfo, keyCache, index) {
  if (!keyInfo || !keyInfo.uri || String(keyInfo.method || "NONE").toUpperCase() === "NONE") return bytes;
  if (String(keyInfo.method).toUpperCase() !== "AES-128") throw new Error(`暂不支持的加密方式：${keyInfo.method}`);
  if (!keyCache.has(keyInfo.uri)) {
    const keyBytes = new Uint8Array(await (await fetch(keyInfo.uri)).arrayBuffer());
    keyCache.set(keyInfo.uri, await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]));
  }
  const key = keyCache.get(keyInfo.uri);
  const iv = keyInfo.iv ? hexToBytes(keyInfo.iv) : sequenceIv(index);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, bytes));
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function mergeBytes(chunks) {
  const total = chunks.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function downloadM3u8(task) {
  const playlistUrl = absoluteUrl(task.url);
  const playlist = await (await fetch(playlistUrl)).text();
  let parsed = parseM3u8(playlist, playlistUrl);
  if (!parsed.segments.length && parsed.variants.length) {
    const best = [...parsed.variants].sort((a, b) => b.bandwidth - a.bandwidth)[0];
    const childPlaylist = await (await fetch(best.url)).text();
    parsed = parseM3u8(childPlaylist, best.url);
  }
  if (!parsed.segments.length) throw new Error("完整播放列表里没有可下载分片");
  const chunks = [];
  const keyCache = new Map();
  for (let i = 0; i < parsed.segments.length; i += 1) {
    const item = parsed.segments[i];
    chrome.runtime.sendMessage({
      type: "downloadProgress",
      taskId: task.taskId,
      stage: "segment",
      current: i + 1,
      total: parsed.segments.length
    }).catch(() => {});
    const raw = await fetchBytes(item.url);
    chunks.push(await decryptSegment(raw, item.key, keyCache, i));
  }
  const merged = mergeBytes(chunks);
  const blob = new Blob([merged], { type: "video/mp2t" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename: task.filename || "糖心志者完整视频.ts",
      saveAs: Boolean(task.saveAs)
    });
    return { downloadId, bytes: merged.length, segments: parsed.segments.length };
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type !== "offscreenDownloadM3u8") return;
    if (tasks.has(message.taskId)) throw new Error("该下载任务正在运行");
    tasks.set(message.taskId, true);
    try {
      sendResponse({ ok: true, ...(await downloadM3u8(message)) });
    } finally {
      tasks.delete(message.taskId);
    }
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
