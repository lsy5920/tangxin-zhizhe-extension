"use strict";

const tasks = new Map();
const completedFiles = new Map();
const DEFAULT_SEGMENT_CONCURRENCY = 8;

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
    keyCache.set(keyInfo.uri, (async () => {
      const keyBytes = new Uint8Array(await (await fetch(keyInfo.uri)).arrayBuffer());
      return await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
    })());
  }
  const key = await keyCache.get(keyInfo.uri);
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

function reportProgress(task, stage, current, total, url, extra = {}) {
  chrome.runtime.sendMessage({
    type: "downloadProgress",
    taskId: task.taskId,
    movieId: task.movieId,
    mode: "m3u8-merged-ts",
    stage,
    current,
    total,
    filename: task.filename,
    url,
    ...extra
  }).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBase64Bytes(value = "") {
  const base64 = String(value || "").trim();
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("已验证安装包的 Base64 数据无效");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function waitForDownloadCreated(downloadId, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = await chrome.downloads.search({ id: downloadId }).catch(() => []);
    const item = items[0];
    if (item) {
      if (item.state === "interrupted") {
        throw new Error(`浏览器已拒绝下载：${item.error || "未知下载错误"}`);
      }
      return item;
    }
    await sleep(80);
  }
  throw new Error("浏览器没有创建可追踪的下载任务");
}

function keepObjectUrlUntilDownloadSettles(downloadId, objectUrl) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    chrome.downloads.onChanged.removeListener(onChanged);
    URL.revokeObjectURL(objectUrl);
  };
  const onChanged = (delta) => {
    if (delta.id !== downloadId) return;
    if (delta.state?.current === "complete" || delta.state?.current === "interrupted" || delta.error?.current) {
      // downloads API 已接管 Blob 后再释放，避免后台过早销毁 URL 导致任务中断。
      window.setTimeout(release, 1000);
    }
  };
  chrome.downloads.onChanged.addListener(onChanged);
  window.setTimeout(release, 10 * 60 * 1000);
  return release;
}

async function saveVerifiedPackage(message = {}) {
  const bytes = decodeBase64Bytes(message.base64);
  const expectedSize = Number(message.expectedSize || 0);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || bytes.length !== expectedSize) {
    throw new Error(`安装包字节数不一致：收到 ${bytes.length}，预期 ${expectedSize || "未知"}`);
  }
  if (bytes.length > 32 * 1024 * 1024) throw new Error("安装包超过离屏下载大小上限");
  const filename = String(message.filename || "糖心志者最新版.crx").replace(/\\/g, "/");
  if (!filename.toLowerCase().endsWith(".crx") || filename.startsWith("/") || filename.split("/").includes("..")) {
    throw new Error("安装包文件名无效");
  }

  const blob = new Blob([bytes], { type: "application/x-chrome-extension" });
  const objectUrl = URL.createObjectURL(blob);
  let releaseObjectUrl = () => URL.revokeObjectURL(objectUrl);
  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename,
      // 用户主动点击更新时必须拉起保存对话框，不能只在后台静默创建编号。
      saveAs: message.saveAs !== false,
      conflictAction: "uniquify"
    });
    if (!Number.isInteger(downloadId) || downloadId <= 0) throw new Error("浏览器未返回有效下载编号");
    releaseObjectUrl = keepObjectUrlUntilDownloadSettles(downloadId, objectUrl);
    const item = await waitForDownloadCreated(downloadId);
    if (item.state === "complete") window.setTimeout(releaseObjectUrl, 1000);
    return {
      ok: true,
      downloadId,
      filename,
      state: item.state || "in_progress",
      danger: item.danger || "safe",
      saveVia: "offscreen-blob"
    };
  } catch (error) {
    releaseObjectUrl();
    throw error;
  }
}

function baseFileName(filename = "") {
  return String(filename || "糖心志者视频任务.ts").split(/[\\/]/).filter(Boolean).pop() || "糖心志者视频任务.ts";
}

function replaceExtension(filename = "", ext = "mp4") {
  const value = String(filename || "糖心志者视频任务").replace(/\.(ts|mp4)$/i, "");
  return `${value}.${ext}`;
}

function concatByteArrays(chunks) {
  return mergeBytes(chunks.map((item) => item instanceof Uint8Array ? item : new Uint8Array(item || [])));
}

function transmuxTsToMp4(tsBytes) {
  if (!globalThis.muxjs?.mp4?.Transmuxer) throw new Error("mux.js 7.0.0 未加载，无法转封装 MP4");
  const transmuxer = new globalThis.muxjs.mp4.Transmuxer({ keepOriginalTimestamps: false });
  const chunks = [];
  transmuxer.on("data", (segment) => {
    if (segment.initSegment) chunks.push(new Uint8Array(segment.initSegment));
    if (segment.data) chunks.push(new Uint8Array(segment.data));
  });
  transmuxer.push(tsBytes);
  transmuxer.flush();
  if (!chunks.length) throw new Error("转封装没有输出 MP4 片段，可能是不支持的视频编码");
  return concatByteArrays(chunks);
}

async function latestDownloadId(filename = "") {
  if (!chrome.downloads?.search) return null;
  const basename = baseFileName(filename);
  const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 20 }).catch(() => []);
  const hit = items.find((item) => String(item.filename || "").includes(basename));
  return hit?.id || null;
}

async function anchorDownload(url, filename = "") {
  const a = document.createElement("a");
  a.href = url;
  a.download = baseFileName(filename);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  await sleep(1200);
  a.remove();
  return await latestDownloadId(filename);
}

async function downloadM3u8(task) {
  const playlistUrl = absoluteUrl(task.url);
  reportProgress(task, "playlist", 0, 0, playlistUrl, { bytes: 0, totalBytes: 0, speedBps: 0, percent: 1, lineKey: task.lineKey || "" });
  const playlist = await (await fetch(playlistUrl)).text();
  let parsed = parseM3u8(playlist, playlistUrl);
  if (!parsed.segments.length && parsed.variants.length) {
    const best = [...parsed.variants].sort((a, b) => b.bandwidth - a.bandwidth)[0];
    const childPlaylist = await (await fetch(best.url)).text();
    parsed = parseM3u8(childPlaylist, best.url);
  }
  if (!parsed.segments.length) throw new Error("播放列表里没有可下载分片");
  reportProgress(task, "segments", 0, parsed.segments.length, playlistUrl, {
    bytes: 0,
    totalBytes: 0,
    speedBps: 0,
    percent: 3,
    lineKey: task.lineKey || ""
  });
  const chunks = new Array(parsed.segments.length);
  const keyCache = new Map();
  let nextIndex = 0;
  let completed = 0;
  let downloadedBytes = 0;
  const startedAt = Date.now();
  const workerCount = Math.max(1, Math.min(Number(task.concurrency || DEFAULT_SEGMENT_CONCURRENCY), parsed.segments.length));
  async function runWorker() {
    while (nextIndex < parsed.segments.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = parsed.segments[index];
      const raw = await fetchBytes(item.url);
      const decrypted = await decryptSegment(raw, item.key, keyCache, index);
      chunks[index] = decrypted;
      completed += 1;
      downloadedBytes += decrypted?.length || raw?.length || 0;
      const elapsedSec = Math.max(0.05, (Date.now() - startedAt) / 1000);
      const speedBps = Math.round(downloadedBytes / elapsedSec);
      // 按已下载字节估算总量，进度更接近真实体积百分比。
      const avgSegment = downloadedBytes / Math.max(1, completed);
      const estimatedTotalBytes = Math.max(downloadedBytes, Math.round(avgSegment * parsed.segments.length));
      const percent = Math.max(3, Math.min(99, Math.round((downloadedBytes / Math.max(1, estimatedTotalBytes)) * 100)));
      reportProgress(task, "segment", completed, parsed.segments.length, playlistUrl, {
        bytes: downloadedBytes,
        totalBytes: estimatedTotalBytes,
        speedBps,
        percent,
        lineKey: task.lineKey || ""
      });
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  const merged = mergeBytes(chunks);
  let outputBytes = merged;
  let outputFormat = "mp4";
  let outputMime = "video/mp4";
  let outputFilename = replaceExtension(task.filename || "糖心志者视频任务.mp4", "mp4");
  let transmuxError = "";
  try {
    outputBytes = transmuxTsToMp4(merged);
  } catch (err) {
    outputBytes = merged;
    outputFormat = "ts";
    outputMime = "video/mp2t";
    outputFilename = replaceExtension(task.filename || "糖心志者视频任务.ts", "ts");
    transmuxError = err?.message || String(err);
  }
  const blob = new Blob([outputBytes], { type: outputMime });
  const objectUrl = URL.createObjectURL(blob);
  const old = completedFiles.get(task.taskId);
  if (old?.objectUrl) URL.revokeObjectURL(old.objectUrl);
  completedFiles.set(task.taskId, {
    objectUrl,
    filename: outputFilename,
    movieId: task.movieId,
    movieTitle: task.movieTitle || "",
    titleSnippet: task.titleSnippet || "",
    bytes: outputBytes.length,
    segments: parsed.segments.length,
    format: outputFormat,
    transmuxError,
    createdAt: Date.now()
  });
  reportProgress(task, "ready", parsed.segments.length, parsed.segments.length, playlistUrl, {
    bytes: outputBytes.length,
    totalBytes: outputBytes.length,
    speedBps: 0,
    percent: 100,
    movieTitle: task.movieTitle || "",
    titleSnippet: task.titleSnippet || "",
    filename: outputFilename,
    format: outputFormat,
    transmuxError,
    lineKey: task.lineKey || ""
  });
  return { ready: true, bytes: outputBytes.length, segments: parsed.segments.length, format: outputFormat, transmuxError };
}

async function saveMergedDownload(message = {}) {
  const item = completedFiles.get(message.taskId);
  if (!item?.objectUrl) throw new Error("合并文件缓存不存在，请重新创建下载任务");
  const task = {
    taskId: message.taskId,
    movieId: item.movieId,
    filename: item.filename,
    movieTitle: item.movieTitle,
    titleSnippet: item.titleSnippet
  };
  reportProgress(task, "save-dialog", item.segments || 0, item.segments || 0, message.url || "", {
    bytes: item.bytes
  });
  let downloadId = null;
  let via = "downloads-api";
  if (chrome.downloads?.download) {
    const downloadPromise = chrome.downloads.download({
      url: item.objectUrl,
      filename: item.filename,
      saveAs: Boolean(message.saveAs)
    });
    downloadId = await Promise.race([
      downloadPromise,
      sleep(5000).then(() => null)
    ]);
  }
  if (!downloadId) {
    via = "anchor-fallback";
    downloadId = await anchorDownload(item.objectUrl, item.filename);
  }
  reportProgress(task, "complete", item.segments || 0, item.segments || 0, message.url || "", {
    downloadId,
    bytes: item.bytes,
    saveVia: via
  });
  return {
    ok: true,
    downloadId,
    saveVia: via,
    bytes: item.bytes,
    segments: item.segments,
    filename: item.filename,
    movieId: item.movieId,
    movieTitle: item.movieTitle,
    titleSnippet: item.titleSnippet,
    format: item.format,
    transmuxError: item.transmuxError
  };
}

function deleteMergedDownload(taskId = "") {
  const item = completedFiles.get(taskId);
  if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
  completedFiles.delete(taskId);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "offscreenSaveVerifiedPackage") {
      sendResponse(await saveVerifiedPackage(message));
      return;
    }
    if (message?.type === "offscreenSaveMergedDownload") {
      sendResponse(await saveMergedDownload(message));
      return;
    }
    if (message?.type === "offscreenDeleteDownloadTask") {
      sendResponse(deleteMergedDownload(String(message.taskId || "")));
      return;
    }
    if (message?.type !== "offscreenDownloadM3u8") return;
    if (tasks.has(message.taskId)) throw new Error("该下载任务正在运行");
    tasks.set(message.taskId, true);
    sendResponse({ ok: true, started: true, taskId: message.taskId });
    downloadM3u8(message)
      .catch((err) => {
        chrome.runtime.sendMessage({
          type: "downloadProgress",
          taskId: message.taskId,
          movieId: message.movieId,
          mode: "m3u8-merged-ts",
          stage: "error",
          current: 0,
          total: 0,
          filename: message.filename,
          url: message.url,
          error: err?.message || String(err)
        }).catch(() => {});
      })
      .finally(() => {
        tasks.delete(message.taskId);
      });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
