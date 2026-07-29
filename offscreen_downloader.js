"use strict";

const core = globalThis.TxzzDownloadCore;
if (!core) throw new Error("下载核心未加载");

const tasks = new Map();
const keyCache = new Map();
const ROOT_DIRECTORY = "txzz-downloads-v1";
const DEFAULT_SEGMENT_CONCURRENCY = 6;

function safePathPart(value = "") {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "unknown";
}

function outputFileName(filename = "", container = "mp4") {
  const basename = String(filename || "糖心志者视频").split(/[\\/]/).filter(Boolean).pop() || "糖心志者视频";
  return `${basename.replace(/\.(?:mp4|ts|crx)$/i, "")}.${container}`;
}

async function getRootDirectory() {
  if (!navigator.storage?.getDirectory) throw new Error("当前浏览器不支持 OPFS，无法安全保存大视频");
  const originRoot = await navigator.storage.getDirectory();
  return originRoot.getDirectoryHandle(ROOT_DIRECTORY, { create: true });
}

async function* directoryEntries(directory) {
  // Chromium 新旧实现对 entries()/values() 暴露并不完全一致；统一成 [name, handle]。
  if (typeof directory?.entries === "function") {
    yield* directory.entries();
    return;
  }
  if (typeof directory?.values === "function") {
    for await (const handle of directory.values()) yield [String(handle?.name || ""), handle];
    return;
  }
  if (directory?.[Symbol.asyncIterator]) {
    for await (const entry of directory) {
      if (Array.isArray(entry)) yield entry;
      else yield [String(entry?.name || ""), entry];
    }
    return;
  }
  throw new Error("当前浏览器无法枚举 OPFS 目录，请升级浏览器后重试");
}

async function getAttemptDirectory(taskId, attemptId, create = true) {
  const root = await getRootDirectory();
  const taskDirectory = await root.getDirectoryHandle(safePathPart(taskId), { create });
  return taskDirectory.getDirectoryHandle(safePathPart(attemptId), { create });
}

async function removeTaskDirectory(taskId) {
  const root = await getRootDirectory();
  await root.removeEntry(safePathPart(taskId), { recursive: true }).catch((error) => {
    if (error?.name !== "NotFoundError") throw error;
  });
}

async function removeAttemptDirectory(taskId, attemptId) {
  const root = await getRootDirectory();
  const taskName = safePathPart(taskId);
  let taskDirectory;
  try {
    taskDirectory = await root.getDirectoryHandle(taskName, { create: false });
  } catch (error) {
    if (error?.name === "NotFoundError") return;
    throw error;
  }
  await taskDirectory.removeEntry(safePathPart(attemptId), { recursive: true }).catch((error) => {
    if (error?.name !== "NotFoundError") throw error;
  });
  let hasEntries = false;
  for await (const _entry of directoryEntries(taskDirectory)) {
    hasEntries = true;
    break;
  }
  if (!hasEntries) await root.removeEntry(taskName, { recursive: true }).catch(() => {});
}

async function writeFile(directory, name, bytes) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable({ keepExistingData: false });
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

async function readFile(directory, name) {
  const handle = await directory.getFileHandle(name);
  return handle.getFile();
}

async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

async function writeJson(directory, name, value) {
  await writeFile(directory, name, JSON.stringify(value));
}

async function readJson(directory, name) {
  try {
    const file = await readFile(directory, name);
    return JSON.parse(await file.text());
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

function createControl(message) {
  return {
    taskId: String(message.taskId || ""),
    attemptId: String(message.attemptId || crypto.randomUUID()),
    message,
    sequence: Math.max(0, Number(message.sequence || 0)),
    paused: false,
    cancelled: false,
    resumeWaiters: [],
    activeControllers: new Set(),
    checkpointQueue: Promise.resolve(),
    promise: null
  };
}

function reportProgress(control, stage, current, total, extra = {}) {
  control.sequence += 1;
  chrome.runtime.sendMessage({
    type: "downloadProgress",
    taskId: control.taskId,
    attemptId: control.attemptId,
    sequence: control.sequence,
    movieId: control.message.movieId,
    mode: control.message.mode || "hls-opfs",
    stage,
    current,
    total,
    filename: control.message.filename,
    url: control.message.url,
    lineKey: control.message.lineKey || "",
    ...extra
  }).catch(() => {});
}

function cancellationError() {
  return new DOMException("下载已取消", "AbortError");
}

function assertActive(control) {
  if (control.cancelled) throw cancellationError();
}

async function waitIfPaused(control) {
  assertActive(control);
  while (control.paused) {
    await new Promise((resolve) => control.resumeWaiters.push(resolve));
    assertActive(control);
  }
}

function wakeControl(control) {
  const waiters = control.resumeWaiters.splice(0);
  waiters.forEach((resolve) => resolve());
}

function abortActiveRequests(control) {
  for (const controller of control.activeControllers) controller.abort();
  control.activeControllers.clear();
}

async function sleep(delayMs, control) {
  const until = Date.now() + delayMs;
  while (Date.now() < until) {
    assertActive(control);
    await new Promise((resolve) => setTimeout(resolve, Math.min(200, until - Date.now())));
  }
}

async function fetchResponse(url, options, control) {
  await waitIfPaused(control);
  const controller = new AbortController();
  control.activeControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), core.LIMITS.requestTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}: ${url}`);
    return response;
  } finally {
    clearTimeout(timer);
    control.activeControllers.delete(controller);
  }
}

async function fetchBytesWithRetry(url, byteRange, control, sizeLimit = core.LIMITS.segmentBytes) {
  let lastError = null;
  for (let attempt = 1; attempt <= core.LIMITS.segmentRetries; attempt += 1) {
    let controller = null;
    let timer = null;
    try {
      await waitIfPaused(control);
      const headers = byteRange ? {
        Range: `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`
      } : {};
      controller = new AbortController();
      control.activeControllers.add(controller);
      timer = setTimeout(() => controller.abort(), core.LIMITS.requestTimeoutMs);
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}: ${url}`);
      const advertisedSize = Number(response.headers.get("content-length") || 0);
      if (advertisedSize > sizeLimit) throw new Error(`单分片超过 ${Math.round(sizeLimit / 1024 / 1024)} MiB 安全上限`);
      let bytes = new Uint8Array(await response.arrayBuffer());
      if (byteRange) {
        bytes = core.selectByteRangeBytes(
          byteRange,
          response.status,
          response.headers.get("content-range") || "",
          bytes
        );
      }
      if (bytes.length > sizeLimit) throw new Error(`单分片超过 ${Math.round(sizeLimit / 1024 / 1024)} MiB 安全上限`);
      return bytes;
    } catch (error) {
      lastError = error;
      if (control.cancelled) throw cancellationError();
      if (attempt < core.LIMITS.segmentRetries) await sleep(300 * (2 ** (attempt - 1)), control);
    } finally {
      if (timer) clearTimeout(timer);
      if (controller) control.activeControllers.delete(controller);
    }
  }
  throw lastError || new Error("下载分片失败");
}

function parseContentRange(value = "") {
  const match = String(value).match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? 0 : Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  if (total && (!Number.isSafeInteger(total) || total <= end)) return null;
  return { start, end, total };
}

function rangeMismatchError(message) {
  const error = new Error(message);
  error.code = "TXZZ_RANGE_MISMATCH";
  return error;
}

async function fetchManifest(url, control) {
  await waitIfPaused(control);
  const controller = new AbortController();
  control.activeControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), core.LIMITS.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain" }
    });
    if (!response.ok) throw new Error(`清单请求失败 HTTP ${response.status}`);
    const advertisedSize = Number(response.headers.get("content-length") || 0);
    if (advertisedSize > core.LIMITS.manifestBytes) throw new Error("HLS 清单超过 2 MiB 安全上限");
    const text = await response.text();
    if (new TextEncoder().encode(text).length > core.LIMITS.manifestBytes) throw new Error("HLS 清单超过 2 MiB 安全上限");
    return text;
  } finally {
    clearTimeout(timer);
    control.activeControllers.delete(controller);
  }
}

async function resolvePlan(message, control) {
  const playlistUrl = core.absoluteUrl(message.url, location.href);
  const masterText = await fetchManifest(playlistUrl, control);
  let plan = core.parsePlaylist(masterText, playlistUrl);
  let selectedVariant = null;
  if (!plan.segments.length && plan.variants.length) {
    selectedVariant = core.chooseVariant(plan.variants, {
      networkMode: message.networkMode,
      height: message.qualityHeight,
      viewportHeight: message.viewportHeight
    });
    if (!selectedVariant) throw new Error("主清单没有兼容的清晰度");
    if (selectedVariant.separateAudio) throw new Error("所选清晰度使用独立音轨，已阻止生成静音文件");
    const childText = await fetchManifest(selectedVariant.url, control);
    plan = core.parsePlaylist(childText, selectedVariant.url);
  }
  core.validatePlan(plan);
  return { plan, selectedVariant, playlistUrl };
}

async function storageEstimate() {
  try {
    const estimate = await navigator.storage.estimate();
    const quota = Number(estimate.quota || 0);
    const usage = Number(estimate.usage || 0);
    return { known: quota > 0, quota, usage, available: Math.max(0, quota - usage) };
  } catch (_) {
    return { known: false, quota: 0, usage: 0, available: 0 };
  }
}

function estimatePlanBytes(plan, selectedVariant) {
  const explicitRanges = plan.segments.reduce((sum, segment) => sum + Number(segment.byteRange?.length || 0), 0);
  if (explicitRanges > 0 && plan.segments.every((segment) => segment.byteRange?.length)) return explicitRanges;
  const bitrate = Number(selectedVariant?.averageBandwidth || selectedVariant?.bandwidth || 0);
  if (bitrate > 0 && plan.durationSeconds > 0) return Math.ceil((bitrate * plan.durationSeconds) / 8);
  return 0;
}

function storageBlockedReason(storage, requiredBytes) {
  if (!storage?.known) return "";
  if (requiredBytes > 0 && requiredBytes > storage.available) return "可用空间不足预计大小的 115%";
  if (storage.available < 1024 ** 3) return "可用空间低于 1 GiB 安全线";
  if (storage.available / Math.max(1, storage.quota) < 0.15) return "可用空间低于浏览器配额的 15% 安全线";
  return "";
}

async function planDownload(message = {}) {
  const control = createControl({ ...message, taskId: message.taskId || `plan-${crypto.randomUUID()}` });
  if (message.mode === "progressive-opfs") {
    const response = await fetchResponse(message.url, { headers: { Range: "bytes=0-0" } }, control);
    const contentRange = String(response.headers.get("content-range") || "");
    const rangeTotal = Number(contentRange.split("/").pop() || 0);
    const estimatedBytes = rangeTotal || Number(response.headers.get("content-length") || 0);
    await response.body?.cancel().catch(() => {});
    const storage = await storageEstimate();
    const requiredBytes = estimatedBytes > 0 ? Math.ceil(estimatedBytes * 1.15) : 0;
    const blockedReason = estimatedBytes > core.LIMITS.taskBytes
      ? "预计文件超过 8 GiB 任务上限"
      : storageBlockedReason(storage, requiredBytes);
    return {
      ok: true,
      plan: {
        playlistUrl: message.url,
        selectedVariant: null,
        variants: [],
        durationSeconds: Number(message.durationSeconds || 0),
        container: "mp4",
        audioMode: "muxed",
        segmentCount: 1,
        estimatedBytes,
        requiredBytes,
        storage,
        blockedReason,
        compatibleContainers: ["mp4"]
      }
    };
  }
  const { plan, selectedVariant, playlistUrl } = await resolvePlan(message, control);
  const estimatedBytes = estimatePlanBytes(plan, selectedVariant);
  const storage = await storageEstimate();
  const requiredBytes = estimatedBytes > 0 ? Math.ceil(estimatedBytes * 1.15) : 0;
  const blockedReason = estimatedBytes > core.LIMITS.taskBytes
    ? "预计文件超过 8 GiB 任务上限"
    : storageBlockedReason(storage, requiredBytes);
  return {
    ok: true,
    plan: {
      playlistUrl,
      selectedVariant,
      variants: plan.variants,
      durationSeconds: plan.durationSeconds,
      container: plan.container,
      audioMode: plan.audioMode,
      segmentCount: plan.segments.length,
      estimatedBytes,
      requiredBytes,
      storage,
      blockedReason,
      compatibleContainers: plan.container === "fmp4" ? ["mp4"] : ["mp4", "ts"]
    }
  };
}

function ivForKey(keyInfo, sequence) {
  return keyInfo?.iv || core.sequenceIv(sequence);
}

async function decryptBytes(bytes, keyInfo, sequence, control) {
  if (!keyInfo) return bytes;
  if (keyInfo.method !== "AES-128") throw new Error(`暂不支持的加密方式：${keyInfo.method}`);
  if (!keyInfo.uri) throw new Error("AES-128 密钥地址为空");
  if (!keyCache.has(keyInfo.uri)) {
    keyCache.set(keyInfo.uri, (async () => {
      const keyBytes = await fetchBytesWithRetry(keyInfo.uri, null, control, 64);
      if (keyBytes.length !== 16) throw new Error("AES-128 密钥长度不是 16 字节");
      return crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
    })());
  }
  const key = await keyCache.get(keyInfo.uri);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivForKey(keyInfo, sequence) }, key, bytes));
}

function segmentName(index) {
  return `segment-${String(index).padStart(8, "0")}.bin`;
}

function mapName(index) {
  return `map-${String(index).padStart(8, "0")}.bin`;
}

async function persistCheckpoint(control, directory, checkpoint) {
  control.checkpointQueue = control.checkpointQueue.then(() => writeJson(directory, "checkpoint.json", checkpoint));
  await control.checkpointQueue;
}

async function downloadSegments(control, directory, plan, checkpoint) {
  const completed = new Set(Array.isArray(checkpoint.completed) ? checkpoint.completed : []);
  let downloadedBytes = Number(checkpoint.downloadedBytes || 0);
  let completedCount = completed.size;
  let nextIndex = 0;
  const startedAt = Date.now();
  const concurrency = Math.max(1, Math.min(Number(control.message.concurrency || DEFAULT_SEGMENT_CONCURRENCY), plan.segments.length));

  async function worker() {
    while (nextIndex < plan.segments.length) {
      await waitIfPaused(control);
      const index = nextIndex;
      nextIndex += 1;
      const segment = plan.segments[index];
      if (completed.has(index) && await fileExists(directory, segmentName(index))) continue;
      if (completed.delete(index)) completedCount = Math.max(0, completedCount - 1);

      if (segment.map && !await fileExists(directory, mapName(index))) {
        const mapRaw = await fetchBytesWithRetry(segment.map.url, segment.map.byteRange, control);
        const mapBytes = await decryptBytes(mapRaw, segment.map.key, segment.sequence, control);
        await writeFile(directory, mapName(index), mapBytes);
      }
      const raw = await fetchBytesWithRetry(segment.url, segment.byteRange, control);
      const bytes = await decryptBytes(raw, segment.key, segment.sequence, control);
      await writeFile(directory, segmentName(index), bytes);
      downloadedBytes += bytes.length;
      if (downloadedBytes > core.LIMITS.taskBytes) throw new Error("任务累计数据超过 8 GiB 安全上限");
      completed.add(index);
      completedCount += 1;
      checkpoint.completed = [...completed].sort((left, right) => left - right);
      checkpoint.downloadedBytes = downloadedBytes;
      checkpoint.updatedAt = new Date().toISOString();
      await persistCheckpoint(control, directory, checkpoint);

      const elapsedSeconds = Math.max(0.05, (Date.now() - startedAt) / 1000);
      const averageBytes = downloadedBytes / Math.max(1, completedCount);
      const estimatedTotal = Math.max(downloadedBytes, Math.round(averageBytes * plan.segments.length));
      reportProgress(control, "downloading", completedCount, plan.segments.length, {
        bytes: downloadedBytes,
        totalBytes: estimatedTotal,
        speedBps: Math.round(downloadedBytes / elapsedSeconds),
        percent: Math.max(3, Math.min(94, Math.round((completedCount / plan.segments.length) * 92)))
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return downloadedBytes;
}

function sniffContainer(bytes) {
  if (bytes[0] === 0x47 && (bytes.length < 189 || bytes[188] === 0x47)) return "mpeg-ts";
  const box = new TextDecoder().decode(bytes.slice(4, 8));
  if (["ftyp", "moof", "styp"].includes(box)) return "fmp4";
  return "unknown";
}

async function appendFileToWritable(file, writable) {
  const reader = file.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writable.write(value);
  }
}

async function assembleConcatenated(control, directory, plan, outputHandle) {
  const writable = await outputHandle.createWritable({ keepExistingData: false });
  let previousMapSignature = "";
  try {
    for (let index = 0; index < plan.segments.length; index += 1) {
      await waitIfPaused(control);
      const segment = plan.segments[index];
      const mapSignature = segment.map ? JSON.stringify([segment.map.url, segment.map.byteRange, segment.map.key?.uri, segment.map.key?.iv]) : "";
      if (segment.map && (segment.discontinuity || mapSignature !== previousMapSignature)) {
        await appendFileToWritable(await readFile(directory, mapName(index)), writable);
        previousMapSignature = mapSignature;
      }
      await appendFileToWritable(await readFile(directory, segmentName(index)), writable);
      reportProgress(control, "assembling", index + 1, plan.segments.length, {
        percent: 95 + Math.round(((index + 1) / plan.segments.length) * 4)
      });
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

async function assembleTsAsMp4(control, directory, plan, outputHandle) {
  if (!globalThis.muxjs?.mp4?.Transmuxer) throw new Error("mux.js 7.0.0 未加载，无法转封装 MP4");
  const writable = await outputHandle.createWritable({ keepExistingData: false });
  const transmuxer = new globalThis.muxjs.mp4.Transmuxer({ keepOriginalTimestamps: false });
  let initWritten = false;
  let writeQueue = Promise.resolve();
  let emittedBytes = 0;
  transmuxer.on("data", (result) => {
    writeQueue = writeQueue.then(async () => {
      if (!initWritten && result.initSegment) {
        const init = new Uint8Array(result.initSegment);
        await writable.write(init);
        emittedBytes += init.length;
        initWritten = true;
      }
      if (result.data) {
        const data = new Uint8Array(result.data);
        await writable.write(data);
        emittedBytes += data.length;
      }
    });
  });
  try {
    for (let index = 0; index < plan.segments.length; index += 1) {
      await waitIfPaused(control);
      const bytes = new Uint8Array(await (await readFile(directory, segmentName(index))).arrayBuffer());
      transmuxer.push(bytes);
      transmuxer.flush();
      await writeQueue;
      reportProgress(control, "assembling", index + 1, plan.segments.length, {
        percent: 95 + Math.round(((index + 1) / plan.segments.length) * 4)
      });
    }
    await writeQueue;
    if (!emittedBytes) throw new Error("转封装没有输出 MP4 数据，可能是不支持的视频编码");
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

async function assembleHls(control, directory, plan) {
  let sourceContainer = plan.container;
  if (sourceContainer === "unknown") {
    const first = new Uint8Array(await (await readFile(directory, segmentName(0))).slice(0, 512).arrayBuffer());
    sourceContainer = sniffContainer(first);
  }
  if (sourceContainer === "unknown") throw new Error("无法确认分片容器，已阻止生成可能损坏的文件");
  const requestedContainer = String(control.message.container || "mp4").toLowerCase() === "ts" ? "ts" : "mp4";
  if (sourceContainer === "fmp4" && requestedContainer !== "mp4") {
    throw new Error("fMP4 清单只能安全保存为 MP4");
  }
  const filename = outputFileName(control.message.filename, requestedContainer);
  const outputHandle = await directory.getFileHandle(filename, { create: true });
  if (sourceContainer === "mpeg-ts" && requestedContainer === "mp4") {
    await assembleTsAsMp4(control, directory, plan, outputHandle);
  } else {
    await assembleConcatenated(control, directory, plan, outputHandle);
  }
  const file = await outputHandle.getFile();
  return { filename, bytes: file.size, format: requestedContainer };
}

async function downloadHls(control) {
  reportProgress(control, "probing", 0, 0, { percent: 1, bytes: 0, totalBytes: 0 });
  const directory = await getAttemptDirectory(control.taskId, control.attemptId, true);
  const existingCheckpoint = await readJson(directory, "checkpoint.json");
  const { plan, selectedVariant, playlistUrl } = await resolvePlan(control.message, control);
  const estimate = estimatePlanBytes(plan, selectedVariant);
  const storage = await storageEstimate();
  if (estimate > core.LIMITS.taskBytes) throw new Error("预计文件超过 8 GiB 任务上限");
  if (storage.known && estimate > 0 && storage.available < estimate * 1.15) {
    throw new Error("可用空间不足预计大小的 115%，已阻止启动");
  }
  const checkpoint = existingCheckpoint?.attemptId === control.attemptId ? existingCheckpoint : {
    version: 1,
    taskId: control.taskId,
    attemptId: control.attemptId,
    movieId: control.message.movieId,
    sourceUrl: control.message.url,
    playlistUrl,
    completed: [],
    downloadedBytes: 0,
    createdAt: new Date().toISOString()
  };
  await persistCheckpoint(control, directory, checkpoint);
  if (checkpoint.completed.length) reportProgress(control, "recovering", checkpoint.completed.length, plan.segments.length, { percent: 3 });
  await downloadSegments(control, directory, plan, checkpoint);
  reportProgress(control, "assembling", 0, plan.segments.length, { percent: 95 });
  const output = await assembleHls(control, directory, plan);
  const artifact = {
    version: 1,
    taskId: control.taskId,
    attemptId: control.attemptId,
    movieId: control.message.movieId,
    movieTitle: control.message.movieTitle || "",
    titleSnippet: control.message.titleSnippet || "",
    filename: output.filename,
    bytes: output.bytes,
    format: output.format,
    segments: plan.segments.length,
    directory: [ROOT_DIRECTORY, safePathPart(control.taskId), safePathPart(control.attemptId)],
    createdAt: new Date().toISOString()
  };
  await writeJson(directory, "artifact.json", artifact);
  reportProgress(control, "ready", plan.segments.length, plan.segments.length, {
    bytes: output.bytes,
    totalBytes: output.bytes,
    speedBps: 0,
    percent: 100,
    objectReady: true,
    filename: output.filename,
    format: output.format
  });
  return artifact;
}

async function streamProgressiveAttempt(control, directory, filename, startOffset) {
  await waitIfPaused(control);
  const controller = new AbortController();
  control.activeControllers.add(controller);
  const connectTimer = setTimeout(() => controller.abort(), core.LIMITS.requestTimeoutMs);
  let response;
  try {
    response = await fetch(control.message.url, {
      signal: controller.signal,
      headers: startOffset > 0 ? { Range: `bytes=${startOffset}-` } : {}
    });
    clearTimeout(connectTimer);
    if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}`);
    const append = startOffset > 0 && response.status === 206;
    const contentRange = parseContentRange(response.headers.get("content-range"));
    if (append && (!contentRange || contentRange.start !== startOffset)) {
      throw rangeMismatchError(`续传响应起点不一致：收到 ${contentRange?.start ?? "缺失"}，预期 ${startOffset}`);
    }
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable({ keepExistingData: append });
    if (append) await writable.seek(startOffset);
    let downloaded = append ? startOffset : 0;
    const reader = response.body.getReader();
    const startedAt = Date.now();
    const contentLength = Number(response.headers.get("content-length") || 0);
    const advertised = contentRange?.total || (contentLength > 0 ? contentLength + (append ? startOffset : 0) : 0);
    try {
      while (true) {
        await waitIfPaused(control);
        // 20 秒限制按“连接或连续无数据”计算，而不是限制整个大视频只能下载 20 秒。
        const idleTimer = setTimeout(() => controller.abort(), core.LIMITS.requestTimeoutMs);
        let chunk;
        try {
          chunk = await reader.read();
        } finally {
          clearTimeout(idleTimer);
        }
        const { done, value } = chunk;
        if (done) break;
        assertActive(control);
        downloaded += value.byteLength;
        if (downloaded > core.LIMITS.taskBytes) throw new Error("任务累计数据超过 8 GiB 安全上限");
        await writable.write(value);
        reportProgress(control, "downloading", downloaded, advertised, {
          bytes: downloaded,
          totalBytes: advertised,
          speedBps: Math.round(downloaded / Math.max(0.1, (Date.now() - startedAt) / 1000)),
          percent: advertised > 0 ? Math.min(99, Math.round((downloaded / advertised) * 100)) : 0
        });
      }
      const receivedThisAttempt = downloaded - (append ? startOffset : 0);
      if (contentLength > 0 && receivedThisAttempt !== contentLength) {
        throw new Error(`媒体响应提前结束：收到 ${receivedThisAttempt} 字节，预期 ${contentLength} 字节`);
      }
      if (contentRange?.total && downloaded < contentRange.total) {
        throw new Error(`媒体续传尚未完成：当前 ${downloaded} 字节，总计 ${contentRange.total} 字节`);
      }
      await writable.close();
    } catch (error) {
      await writable.close().catch(() => {});
      throw error;
    }
    return downloaded;
  } finally {
    clearTimeout(connectTimer);
    control.activeControllers.delete(controller);
  }
}

async function downloadProgressive(control) {
  const directory = await getAttemptDirectory(control.taskId, control.attemptId, true);
  const filename = outputFileName(control.message.filename, "mp4");
  const estimatedBytes = Number(control.message.estimatedBytes || 0);
  const storage = await storageEstimate();
  if (estimatedBytes > core.LIMITS.taskBytes) throw new Error("预计文件超过 8 GiB 任务上限");
  if (storage.known && estimatedBytes > 0 && storage.available < estimatedBytes * 1.15) {
    throw new Error("可用空间不足预计大小的 115%，已阻止启动");
  }
  let startOffset = 0;
  if (await fileExists(directory, filename)) startOffset = (await readFile(directory, filename)).size;
  reportProgress(control, startOffset ? "recovering" : "probing", 0, 1, { bytes: startOffset, percent: startOffset ? 1 : 0 });
  let bytes = startOffset;
  let lastError = null;
  for (let attempt = 1; attempt <= core.LIMITS.segmentRetries; attempt += 1) {
    try {
      bytes = await streamProgressiveAttempt(control, directory, filename, bytes);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (control.cancelled) throw cancellationError();
      if (error?.code === "TXZZ_RANGE_MISMATCH") {
        // 服务端错误的 206 起点会拼坏文件；从零重下比保留不可信前缀更安全。
        await directory.removeEntry(filename).catch((removeError) => {
          if (removeError?.name !== "NotFoundError") throw removeError;
        });
        bytes = 0;
      } else {
        bytes = await fileExists(directory, filename) ? (await readFile(directory, filename)).size : 0;
      }
      if (attempt < core.LIMITS.segmentRetries) {
        reportProgress(control, "recovering", attempt, core.LIMITS.segmentRetries, { bytes, error: error?.message || String(error) });
        await sleep(500 * attempt, control);
      }
    }
  }
  if (lastError) throw lastError;
  const artifact = {
    version: 1,
    taskId: control.taskId,
    attemptId: control.attemptId,
    movieId: control.message.movieId,
    movieTitle: control.message.movieTitle || "",
    titleSnippet: control.message.titleSnippet || "",
    filename,
    bytes,
    format: "mp4",
    segments: 1,
    directory: [ROOT_DIRECTORY, safePathPart(control.taskId), safePathPart(control.attemptId)],
    createdAt: new Date().toISOString()
  };
  await writeJson(directory, "artifact.json", artifact);
  reportProgress(control, "ready", 1, 1, { bytes, totalBytes: bytes, percent: 100, objectReady: true, filename, format: "mp4" });
  return artifact;
}

async function getArtifact(message = {}) {
  const directory = await getAttemptDirectory(message.taskId, message.attemptId, false);
  const artifact = await readJson(directory, "artifact.json");
  if (!artifact || artifact.attemptId !== message.attemptId) throw new Error("下载成品不存在或已经过期");
  const file = await readFile(directory, artifact.filename);
  if (file.size !== Number(artifact.bytes || 0)) throw new Error("下载成品大小校验失败");
  return { ok: true, artifact };
}

async function directoryUsage(directory) {
  let bytes = 0;
  let updatedAt = "";
  const files = [];
  for await (const [name, handle] of directoryEntries(directory)) {
    if (handle.kind === "file") {
      const file = await handle.getFile();
      bytes += Number(file.size || 0);
      const modified = Number(file.lastModified || 0);
      if (modified > (Date.parse(updatedAt) || 0)) updatedAt = new Date(modified).toISOString();
      files.push(name);
      continue;
    }
    const nested = await directoryUsage(handle);
    bytes += nested.bytes;
    if ((Date.parse(nested.updatedAt) || 0) > (Date.parse(updatedAt) || 0)) updatedAt = nested.updatedAt;
  }
  return { bytes, updatedAt, files };
}

function classifyStorageEntry({ known = null, artifact = null, checkpoint = null, liveControl = null, attemptName = "", now = Date.now() } = {}) {
  const activeStages = new Set(["probing", "downloading", "recovering", "assembling", "saving"]);
  const protectedStages = new Set([...activeStages, "ready"]);
  const protectedEntry = Boolean(
    // ready 表示成品仍等待用户保存，和正在组装/保存一样必须始终受保护。
    (known && protectedStages.has(String(known.stage || "")))
    || (liveControl && safePathPart(liveControl.attemptId) === attemptName)
    || (artifact?.kind === "crx" && now - (Date.parse(artifact.createdAt || "") || 0) < 24 * 60 * 60 * 1000)
  );
  let category = "orphan";
  if (known && activeStages.has(String(known.stage || ""))) category = "active";
  else if (known && artifact) category = "artifact";
  else if (known && ["cancelled", "stale", "error"].includes(String(known.stage || ""))) category = "residue";
  else if (known && checkpoint) category = "resumable";
  else if (known) category = "residue";
  else if (artifact) category = "artifact";
  return { category, protected: protectedEntry };
}

async function auditStorage(message = {}) {
  const storage = await storageEstimate();
  const knownTasks = new Map((Array.isArray(message.knownTasks) ? message.knownTasks : []).map((task) => [
    `${safePathPart(task.taskId)}:${safePathPart(task.attemptId)}`,
    task
  ]));
  const entries = [];
  const root = await getRootDirectory();
  for await (const [taskName, taskHandle] of directoryEntries(root)) {
    if (taskHandle.kind !== "directory") continue;
    for await (const [attemptName, attemptHandle] of directoryEntries(taskHandle)) {
      if (attemptHandle.kind !== "directory") continue;
      const usage = await directoryUsage(attemptHandle);
      const artifact = await readJson(attemptHandle, "artifact.json").catch(() => null);
      const checkpoint = await readJson(attemptHandle, "checkpoint.json").catch(() => null);
      const known = knownTasks.get(`${taskName}:${attemptName}`) || null;
      const liveControl = tasks.get(String(known?.taskId || artifact?.taskId || checkpoint?.taskId || taskName));
      const classification = classifyStorageEntry({ known, artifact, checkpoint, liveControl, attemptName });
      entries.push({
        taskId: String(known?.taskId || artifact?.taskId || checkpoint?.taskId || taskName),
        attemptId: String(known?.attemptId || artifact?.attemptId || checkpoint?.attemptId || attemptName),
        movieId: String(known?.movieId || artifact?.movieId || checkpoint?.movieId || ""),
        filename: String(artifact?.filename || known?.filename || ""),
        format: String(artifact?.format || known?.container || ""),
        qualityHeight: Number(known?.qualityHeight || 0),
        category: classification.category,
        bytes: usage.bytes,
        protected: classification.protected,
        duplicateGroup: "",
        updatedAt: usage.updatedAt || artifact?.createdAt || checkpoint?.updatedAt || checkpoint?.createdAt || ""
      });
    }
  }
  const duplicateGroups = new Map();
  for (const entry of entries.filter((item) => item.category === "artifact" && item.movieId && item.bytes > 0)) {
    const key = `${entry.movieId}|${entry.format}|${entry.qualityHeight}|${entry.bytes}`;
    const group = duplicateGroups.get(key) || [];
    group.push(entry);
    duplicateGroups.set(key, group);
  }
  for (const [key, group] of duplicateGroups) {
    if (group.length < 2) continue;
    group.sort((left, right) => (Date.parse(right.updatedAt || "") || 0) - (Date.parse(left.updatedAt || "") || 0));
    group.forEach((entry, index) => {
      entry.duplicateGroup = key;
      if (index > 0 && !entry.protected) entry.category = "duplicate";
    });
  }
  const managedBytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  const lowSpace = storage.known && (storage.available < 1024 ** 3 || storage.available / Math.max(1, storage.quota) < 0.15);
  return {
    ok: true,
    audit: {
      checkedAt: new Date().toISOString(),
      storage,
      managedBytes,
      lowSpace,
      // 清理操作必须看到完整枚举；只返回前 200 项会让排序靠后的孤儿文件永久无法清理。
      entries: entries.sort((left, right) => right.bytes - left.bytes)
    }
  };
}

async function cleanupStorage(message = {}) {
  const targets = new Set((Array.isArray(message.targets) ? message.targets : []).map(String));
  if (!targets.size) return { ok: true, deleted: 0, audit: (await auditStorage(message)).audit };
  const before = await auditStorage(message);
  const allowed = new Set(["orphan", "residue", "duplicate"]);
  let deleted = 0;
  const deletedKeys = [];
  for (const entry of before.audit.entries) {
    const key = `${entry.taskId}:${entry.attemptId}`;
    if (!targets.has(key) || entry.protected || !allowed.has(entry.category)) continue;
    cancelTask(entry.taskId, entry.attemptId);
    const running = tasks.get(entry.taskId)?.promise;
    if (running) await running.catch(() => {});
    await removeAttemptDirectory(entry.taskId, entry.attemptId);
    deleted += 1;
    deletedKeys.push(key);
  }
  return { ok: true, deleted, deletedKeys, audit: (await auditStorage(message)).audit };
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function validateCrx3Bytes(bytes) {
  if (bytes.length < 16 || new TextDecoder().decode(bytes.slice(0, 4)) !== "Cr24") throw new Error("CRX3 魔数校验失败");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 3) throw new Error("安装包不是 CRX3 格式");
  const headerSize = view.getUint32(8, true);
  if (headerSize <= 0 || headerSize + 12 >= bytes.length) throw new Error("CRX3 头长度异常");
}

async function storeVerifiedCrx(message = {}) {
  const control = createControl({
    ...message,
    taskId: String(message.taskId || `txzz-crx-${crypto.randomUUID()}`),
    attemptId: String(message.attemptId || crypto.randomUUID()),
    mode: "crx-opfs"
  });
  const expectedSize = Number(message.expectedSize || 0);
  const bytes = await fetchBytesWithRetry(message.url, null, control, 32 * 1024 * 1024);
  if (expectedSize > 0 && bytes.length !== expectedSize) throw new Error("CRX3 大小与签名清单不一致");
  validateCrx3Bytes(bytes);
  const digest = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  if (message.expectedSha256 && digest !== String(message.expectedSha256).toLowerCase()) {
    throw new Error("CRX3 SHA-256 与已验证结果不一致");
  }
  const directory = await getAttemptDirectory(control.taskId, control.attemptId, true);
  const filename = outputFileName(message.filename || "糖心志者最新版.crx", "crx");
  await writeFile(directory, filename, bytes);
  const artifact = {
    version: 1,
    kind: "crx",
    taskId: control.taskId,
    attemptId: control.attemptId,
    filename,
    bytes: bytes.length,
    sha256: digest,
    format: "crx",
    directory: [ROOT_DIRECTORY, safePathPart(control.taskId), safePathPart(control.attemptId)],
    createdAt: new Date().toISOString()
  };
  await writeJson(directory, "artifact.json", artifact);
  return { ok: true, artifact };
}

function pauseTask(taskId, attemptId) {
  const control = tasks.get(taskId);
  if (!control || control.attemptId !== attemptId) return { ok: false, error: "任务实例已结束" };
  control.paused = true;
  reportProgress(control, "paused", 0, 0, {});
  return { ok: true };
}

function resumeTask(taskId, attemptId) {
  const control = tasks.get(taskId);
  if (!control || control.attemptId !== attemptId) return { ok: false, error: "任务实例已结束，需要从检查点恢复" };
  control.paused = false;
  wakeControl(control);
  reportProgress(control, "recovering", 0, 0, {});
  return { ok: true };
}

function cancelTask(taskId, attemptId) {
  const control = tasks.get(taskId);
  if (!control || (attemptId && control.attemptId !== attemptId)) return { ok: true, alreadyStopped: true };
  control.cancelled = true;
  control.paused = false;
  abortActiveRequests(control);
  wakeControl(control);
  reportProgress(control, "cancelled", 0, 0, {});
  return { ok: true };
}

function startTask(message) {
  const taskId = String(message.taskId || "");
  const attemptId = String(message.attemptId || "");
  if (!taskId || !attemptId) throw new Error("下载任务缺少 taskId 或 attemptId");
  const existing = tasks.get(taskId);
  if (existing && existing.attemptId === attemptId) return { ok: true, started: false, reused: true, taskId, attemptId };
  if (existing) cancelTask(taskId, existing.attemptId);
  const control = createControl(message);
  tasks.set(taskId, control);
  control.promise = (message.mode === "progressive-opfs" ? downloadProgressive(control) : downloadHls(control))
    .catch((error) => {
      if (!control.cancelled) {
        reportProgress(control, "error", 0, 0, { error: error?.message || String(error) });
      }
    })
    .finally(() => {
      if (tasks.get(taskId) === control) tasks.delete(taskId);
    });
  return { ok: true, started: true, taskId, attemptId };
}

if (globalThis.__TXZZ_TEST__ === true) {
  // 仅在测试沙箱显式开启时暴露控制器，生产环境不会增加可调用入口。
  globalThis.TxzzOffscreenDownloaderTestHooks = Object.freeze({
    cancelTask,
    classifyStorageEntry,
    clearTasks() {
      for (const control of tasks.values()) cancelTask(control.taskId, control.attemptId);
      tasks.clear();
    },
    createControl,
    pauseTask,
    registerControl(control) {
      tasks.set(control.taskId, control);
      return control;
    },
    resumeTask,
    waitIfPaused
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "offscreenPlanDownload") {
      sendResponse(await planDownload(message));
      return;
    }
    if (message?.type === "offscreenGetDownloadArtifact") {
      sendResponse(await getArtifact(message));
      return;
    }
    if (message?.type === "offscreenAuditStorage") {
      sendResponse(await auditStorage(message));
      return;
    }
    if (message?.type === "offscreenCleanupStorage") {
      sendResponse(await cleanupStorage(message));
      return;
    }
    if (message?.type === "offscreenStoreVerifiedCrx") {
      sendResponse(await storeVerifiedCrx(message));
      return;
    }
    if (message?.type === "offscreenPauseDownload") {
      sendResponse(pauseTask(String(message.taskId || ""), String(message.attemptId || "")));
      return;
    }
    if (message?.type === "offscreenResumeDownload") {
      sendResponse(resumeTask(String(message.taskId || ""), String(message.attemptId || "")));
      return;
    }
    if (message?.type === "offscreenCancelDownload") {
      sendResponse(cancelTask(String(message.taskId || ""), String(message.attemptId || "")));
      return;
    }
    if (message?.type === "offscreenDeleteDownloadTask") {
      cancelTask(String(message.taskId || ""), String(message.attemptId || ""));
      const running = tasks.get(String(message.taskId || ""))?.promise;
      if (running) await running.catch(() => {});
      await removeTaskDirectory(String(message.taskId || ""));
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "offscreenDownloadM3u8" || message?.type === "offscreenDownloadProgressive") {
      sendResponse(startTask(message));
    }
  })().catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
