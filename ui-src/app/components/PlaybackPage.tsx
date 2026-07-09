import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import { Activity, AlertCircle, CheckCircle, Clock, Copy, Download, ExternalLink, Film, Gauge, Layers, Link, RefreshCw, Route, Save, Search, ShieldCheck, Signal, SortDesc, Timer, Wifi } from "lucide-react";
import type { BridgeState, DownloadTask, FullDetail, Page } from "../types";
import { absoluteUrl, canSaveDownload, downloadFormat, downloadLineLabel, downloadProgress, downloadSpeedText, downloadStageLabel, downloadTaskForMovie, downloadTitle, formatBytes, formatDuration, isRunningDownloadTask, latestFullDetail, localizeFlowText, maskUrl, shortTime } from "../helpers";
import { PlayerControlBar, PlayerOverlays, PlayerTopBar, type PlayerMorePanelKey } from "./player/PlayerChrome";
import { PlayerGestureHudOverlay, PlayerGestureSurface, type GestureHudState } from "./player/PlayerGestureSystem";
import {
  ActionToolbar,
  EmptyState,
  Pill,
  SectionCard,
  SoftButton,
  SoftInput
} from "./ui/primitives";
import {
  applyAdaptiveVideoLayout,
  clearForcedFullscreenStyles,
  enterPlayerBrowserFullscreen,
  exitBrowserFullscreen,
  forceFullscreenVideoVisible,
  getFullscreenElement,
  getPluginHost,
  isBrowserFullscreen,
  prepareFullscreenChrome,
  restoreFullscreenChrome,
  PLAYER_FULLSCREEN_HOST_CLASS
} from "./player/browserFullscreen";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage?: (page: Page) => void;
};

type PlaybackLine = {
  key: "play" | "backup";
  label: string;
  url?: string;
  stat?: FullDetail["fullStat"];
  copyAction: string;
  openAction: string;
};

type PlaybackRecordFilter = "all" | "downloadable" | "saveable" | "failed" | "backup";
type PlaybackRecordSort = "recent" | "failed" | "saveable" | "backup";
type PlaybackPanelTab = "resource" | "download" | "records";
type PlaybackPreviewKey = "recommended" | "play" | "backup" | "record";
type PlayerFitMode = "auto" | "wide" | "vertical";
type PlayerFillMode = "contain" | "cover" | "fill";
type PlayerOrientationMode = "auto" | "landscape" | "portrait";
type PlaybackPreviewRecord = {
  url: string;
  title: string;
  movieId?: string;
};

type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  paused: boolean;
  rate: number;
};

type PlayerQualityOption = {
  level: number;
  label: string;
};

type PlayerFullscreenDiagnostic = {
  source: "未全屏" | "播放器壳层" | "插件宿主" | "沉浸兜底" | "未知";
  shellSize: string;
  viewportSize: string;
  shellOffset: string;
  videoSize: string;
  videoOffset: string;
  sideBars: string;
  coverage: number;
  ok: boolean;
  issue: string;
};

type PlayerFullscreenTune = {
  objectPositionX: number;
  shiftX: number;
  safeLeft: number;
  safeRight: number;
  label: string;
};



type ScreenOrientationController = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request?: (type: "screen") => Promise<{ release?: () => Promise<void>; addEventListener?: (type: string, listener: () => void) => void }>;
  };
};

const playerRateOptions = [0.75, 1, 1.25, 1.5, 2];
const playerSeekStepOptions = [5, 10, 30, 60];
const playerVolumeStorageKey = "txzz-player-volume";
const playerMutedStorageKey = "txzz-player-muted";
const playerFillStorageKey = "txzz-player-fill";
const playerBrightnessStorageKey = "txzz-player-brightness";
const playerOrientationStorageKey = "txzz-player-orientation";
const playerFullscreenHostClass = PLAYER_FULLSCREEN_HOST_CLASS;

const emptyFullscreenDiagnostic: PlayerFullscreenDiagnostic = {
  source: "未全屏",
  shellSize: "未测量",
  viewportSize: "未测量",
  shellOffset: "未测量",
  videoSize: "未测量",
  videoOffset: "未测量",
  sideBars: "未测量",
  coverage: 0,
  ok: true,
  issue: "普通播放模式"
};

const emptyFullscreenTune: PlayerFullscreenTune = {
  objectPositionX: 50,
  shiftX: 0,
  safeLeft: 0,
  safeRight: 0,
  label: "默认居中"
};

function lineState(line: PlaybackLine) {
  if (!line.url) return { label: "缺少链接", color: "text-rose-600", bg: "bg-rose-50", ready: false, score: -10000 };
  if (line.stat?.error) return { label: "探测异常", color: "text-amber-600", bg: "bg-amber-50", ready: false, score: lineScore(line) };
  if (line.stat?.pending) return { label: "探测中", color: "text-sky-600", bg: "bg-sky-50", ready: true, score: lineScore(line) };
  return { label: "可播放", color: "text-emerald-600", bg: "bg-emerald-50", ready: true, score: lineScore(line) };
}

/** 综合分片/时长/延迟/HTTP 状态打分，备用线更好时会优先推荐备用。 */
function lineScore(line?: PlaybackLine | null) {
  if (!line?.url) return -10000;
  const stat = line.stat;
  if (!stat) return 15;
  if (stat.error) return -800 + Math.min(50, Number(stat.segments || 0));
  if (stat.pending) return 25;
  let score = 100;
  const status = Number(stat.status || 0);
  if (status >= 200 && status < 400) score += 60;
  else if (status > 0) score -= 40;
  const segments = Number(stat.segments || 0);
  const duration = Number(stat.duration || 0);
  const latency = Number((stat as { latencyMs?: number }).latencyMs || 0);
  // 分片与时长越高通常越完整；延迟越低越好。
  score += Math.min(50, segments / 4);
  score += Math.min(40, duration / 20);
  if (latency > 0) score += Math.max(0, 50 - Math.min(50, latency / 80));
  if (segments <= 0 && duration <= 0) score -= 20;
  return score;
}

function bestLine(lines: PlaybackLine[]) {
  let best: PlaybackLine | undefined;
  let bestScore = -Infinity;
  for (const line of lines) {
    const score = lineScore(line);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best || lines.find((line) => line.url) || lines[0];
}

function isPlaylistUrl(url?: string) {
  return /\.m3u8(?:[?#]|$)/i.test(String(url || "")) || /m3u8/i.test(String(url || ""));
}

function previewLineLabel(key: PlaybackPreviewKey) {
  if (key === "play") return "主线路";
  if (key === "backup") return "备用线路";
  if (key === "record") return "播放记录";
  return "推荐线路";
}

function playerResumeStorageKey(movieId?: string, url?: string) {
  // 断点续播优先按视频编号记忆，避免播放链接签名轮换后丢失续播进度；无编号时退回完整链接。
  if (movieId) return `txzz-player-progress:movie:${movieId}`;
  const value = absoluteUrl(url || "");
  if (!value) return "";
  return `txzz-player-progress:${value}`;
}

function playerSnapshot(video?: HTMLVideoElement | null): PlayerSnapshot {
  if (!video) return { currentTime: 0, duration: 0, bufferedEnd: 0, paused: true, rate: 1 };
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
  return {
    currentTime,
    duration,
    bufferedEnd: Number.isFinite(bufferedEnd) ? bufferedEnd : 0,
    paused: video.paused,
    rate: video.playbackRate || 1
  };
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function detectVideoFit(video?: HTMLVideoElement | null): Exclude<PlayerFitMode, "auto"> {
  const width = Number(video?.videoWidth || 0);
  const height = Number(video?.videoHeight || 0);
  return height > width ? "vertical" : "wide";
}

function fitModeLabel(mode: PlayerFitMode, detected: Exclude<PlayerFitMode, "auto">) {
  const value = mode === "auto" ? detected : mode;
  if (mode === "auto") return value === "vertical" ? "自动竖屏" : "自动横屏";
  return value === "vertical" ? "竖屏" : "横屏";
}

function fitModeAspect(mode: PlayerFitMode, detected: Exclude<PlayerFitMode, "auto">) {
  return (mode === "auto" ? detected : mode) === "vertical" ? "9 / 16" : "16 / 9";
}

function fillModeLabel(mode: PlayerFillMode) {
  if (mode === "cover") return "裁满";
  if (mode === "fill") return "铺满";
  return "原比例";
}

function fullscreenSourceLabel(node: Element | null, shell: HTMLElement | null, host: HTMLElement | null, immersive: boolean): PlayerFullscreenDiagnostic["source"] {
  if (shell && node && (node === shell || shell.contains(node))) return "播放器壳层";
  if (host && node === host) return "插件宿主";
  if (immersive) return "沉浸兜底";
  if (!node) return "未全屏";
  return "未知";
}

function measureVideoCenterDiagnostic(video: HTMLVideoElement | null, viewportWidth: number, viewportHeight: number) {
  if (!video) {
    return {
      videoSize: "未检测到视频层",
      videoOffset: "未测量",
      sideBars: "未测量",
      ok: false,
      issue: "未检测到视频层"
    };
  }
  const rect = video.getBoundingClientRect();
  const intrinsicWidth = Number(video.videoWidth || 0);
  const intrinsicHeight = Number(video.videoHeight || 0);
  const objectFit = window.getComputedStyle(video).objectFit || "contain";
  let displayWidth = rect.width;
  let displayHeight = rect.height;
  if (intrinsicWidth > 0 && intrinsicHeight > 0 && rect.width > 0 && rect.height > 0 && objectFit !== "fill") {
    const widthRatio = rect.width / intrinsicWidth;
    const heightRatio = rect.height / intrinsicHeight;
    const scale = objectFit === "cover" ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
    displayWidth = intrinsicWidth * scale;
    displayHeight = intrinsicHeight * scale;
  }
  const videoCenterX = rect.left + rect.width / 2;
  const videoCenterY = rect.top + rect.height / 2;
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;
  const centerOffsetX = Math.round(videoCenterX - viewportCenterX);
  const centerOffsetY = Math.round(videoCenterY - viewportCenterY);
  const contentLeft = rect.left + (rect.width - displayWidth) / 2;
  const contentRight = contentLeft + displayWidth;
  const leftBar = Math.max(0, Math.round(contentLeft));
  const rightBar = Math.max(0, Math.round(viewportWidth - contentRight));
  const sideBarDiff = Math.abs(leftBar - rightBar);
  const videoSize = `${Math.round(rect.width)}x${Math.round(rect.height)} · 原片${intrinsicWidth || "?"}x${intrinsicHeight || "?"}`;
  return {
    videoSize,
    videoOffset: `X${centerOffsetX}px Y${centerOffsetY}px`,
    sideBars: `左${leftBar}px / 右${rightBar}px / 差${sideBarDiff}px`,
    ok: Math.abs(centerOffsetX) <= 2 && Math.abs(centerOffsetY) <= 2 && sideBarDiff <= 4,
    issue: sideBarDiff > 4 ? "左右黑边不均衡" : Math.abs(centerOffsetX) > 2 || Math.abs(centerOffsetY) > 2 ? "视频层未居中" : "视频层已居中"
  };
}

function measureFullscreenDiagnostic(shell: HTMLElement | null, host: HTMLElement | null, immersive: boolean, video: HTMLVideoElement | null = null): PlayerFullscreenDiagnostic {
  const fullscreenNode = fullscreenElement();
  const source = fullscreenSourceLabel(fullscreenNode, shell, host, immersive);
  if (!shell || source === "未全屏") return emptyFullscreenDiagnostic;
  const rect = shell.getBoundingClientRect();
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const videoCenter = measureVideoCenterDiagnostic(video, viewportWidth, viewportHeight);
  const widthRatio = viewportWidth ? rect.width / viewportWidth : 0;
  const heightRatio = viewportHeight ? rect.height / viewportHeight : 0;
  const coverage = Math.round(Math.max(0, Math.min(1, Math.min(widthRatio, heightRatio))) * 100);
  const rounded = Math.abs(rect.left) > 2 || Math.abs(rect.top) > 2 || Math.abs(rect.width - viewportWidth) > 4 || Math.abs(rect.height - viewportHeight) > 4;
  const hostModeMissing = source === "插件宿主" && !host?.classList.contains(playerFullscreenHostClass);
  const issue = hostModeMissing
    ? "宿主全屏模式未生效"
    : rounded
      ? "播放器容器未完全贴合视口"
      : videoCenter.ok
        ? "容器与视频层已居中"
        : videoCenter.issue;
  return {
    source,
    shellSize: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    viewportSize: `${viewportWidth}x${viewportHeight}`,
    shellOffset: `X${Math.round(rect.left)}px Y${Math.round(rect.top)}px`,
    videoSize: videoCenter.videoSize,
    videoOffset: videoCenter.videoOffset,
    sideBars: videoCenter.sideBars,
    coverage,
    ok: !hostModeMissing && !rounded && coverage >= 99 && videoCenter.ok,
    issue
  };
}

function measureViewportSize() {
  const visual = window.visualViewport;
  const width = Math.round(visual?.width || window.innerWidth || document.documentElement.clientWidth || 0);
  const height = Math.round(visual?.height || window.innerHeight || document.documentElement.clientHeight || 0);
  return { width, height };
}

function readSafeAreaInsets() {
  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:0",
    "height:0",
    "padding-left:env(safe-area-inset-left)",
    "padding-right:env(safe-area-inset-right)",
    "visibility:hidden",
    "pointer-events:none"
  ].join(";");
  document.documentElement.appendChild(probe);
  const style = window.getComputedStyle(probe);
  const left = Number.parseFloat(style.paddingLeft || "0") || 0;
  const right = Number.parseFloat(style.paddingRight || "0") || 0;
  probe.remove();
  return { left, right };
}

function calculateFullscreenTune(video: HTMLVideoElement | null, fullscreenActive: boolean, fillMode: PlayerFillMode): PlayerFullscreenTune {
  if (!fullscreenActive || fillMode !== "contain" || !video) return emptyFullscreenTune;
  const viewport = measureViewportSize();
  const visual = window.visualViewport;
  const rect = video.getBoundingClientRect();
  const intrinsicWidth = Number(video.videoWidth || 0);
  const intrinsicHeight = Number(video.videoHeight || 0);
  const landscapePhone = viewport.width > viewport.height && viewport.height <= 520;
  if (!landscapePhone || intrinsicWidth <= 0 || intrinsicHeight <= 0 || rect.width <= 0 || rect.height <= 0) return emptyFullscreenTune;

  const widthRatio = rect.width / intrinsicWidth;
  const heightRatio = rect.height / intrinsicHeight;
  const displayWidth = intrinsicWidth * Math.min(widthRatio, heightRatio);
  const availableSideSpace = Math.max(0, rect.width - displayWidth);
  const safeArea = readSafeAreaInsets();
  const screenLongSide = Math.max(window.screen?.width || 0, window.screen?.height || 0);
  const missingViewportSpace = Math.max(0, screenLongSide - viewport.width);
  const viewportOffsetLeft = Math.max(0, Math.round(visual?.offsetLeft || 0));
  const viewportOffsetRight = Math.max(0, Math.round(missingViewportSpace - viewportOffsetLeft));
  const safeLeft = Math.max(0, Math.round(rect.left + safeArea.left + viewportOffsetLeft));
  const safeRight = Math.max(0, Math.round(viewport.width - rect.right + safeArea.right + viewportOffsetRight));
  const safeDiff = safeLeft - safeRight;
  if (availableSideSpace < 2 || Math.abs(safeDiff) <= 2) {
    return {
      ...emptyFullscreenTune,
      safeLeft,
      safeRight,
      label: `安全区 左${safeLeft}px 右${safeRight}px`
    };
  }

  const shiftX = Math.max(-availableSideSpace / 2, Math.min(availableSideSpace / 2, safeDiff / 2));
  const objectPositionX = Math.max(0, Math.min(100, 50 - (shiftX / availableSideSpace) * 100));
  return {
    objectPositionX,
    shiftX: Math.round(shiftX),
    safeLeft,
    safeRight,
    label: `视觉居中 ${Math.round(objectPositionX)}% · 安全区左${safeLeft}px右${safeRight}px`
  };
}

function hlsQualityLabel(level: { name?: string; height?: number; bitrate?: number } | undefined, index: number) {
  if (level?.name) return String(level.name);
  if (level?.height) return `${level.height}P`;
  if (level?.bitrate) return `${Math.round(level.bitrate / 1000)}K`;
  return `档位 ${index + 1}`;
}

function fullscreenElement() {
  return getFullscreenElement();
}

function fullscreenHostElement() {
  return getPluginHost();
}

function isPlayerFullscreenElement(node: Element | null, shell: HTMLElement | null, host: HTMLElement | null) {
  return Boolean(
    node && (
      (shell && (node === shell || shell.contains(node)))
      || Boolean(host && node === host)
      || node === document.documentElement
      || node === document.body
      || (node instanceof HTMLVideoElement)
    )
  );
}

function isRealBrowserFullscreen() {
  return isBrowserFullscreen();
}

async function exitFullscreen() {
  await exitBrowserFullscreen();
}

function prepareHostForBrowserFullscreen(host: HTMLElement | null) {
  prepareFullscreenChrome(host);
}

function restoreHostAfterBrowserFullscreen(host: HTMLElement | null) {
  restoreFullscreenChrome(host);
}

function wantedScreenOrientation(
  mode: PlayerOrientationMode,
  videoLandscape: boolean,
  preferLandscapeFallback = false
) {
  if (mode === "landscape") return "landscape";
  if (mode === "portrait") return "portrait";
  // 自动：横屏片源必须横屏；片源尺寸未知时（悬浮秒开全屏）也优先横屏，避免竖屏壳看横屏片
  if (videoLandscape || preferLandscapeFallback) return "landscape";
  return "";
}

async function requestScreenOrientation(
  mode: PlayerOrientationMode,
  videoLandscape: boolean,
  options: { preferLandscapeFallback?: boolean } = {}
) {
  const wanted = wantedScreenOrientation(mode, videoLandscape, options.preferLandscapeFallback);
  const controller = window.screen?.orientation as ScreenOrientationController | undefined;
  if (!wanted) {
    controller?.unlock?.();
    return "自动方向";
  }
  if (!controller?.lock) return "浏览器不支持方向锁定";
  // 多候选：Android/Kiwi 对 landscape / landscape-primary 支持不一致
  const candidates = wanted === "landscape"
    ? ["landscape", "landscape-primary", "landscape-secondary"]
    : ["portrait", "portrait-primary", "portrait-secondary"];
  let lastError: unknown = null;
  for (const orientation of candidates) {
    try {
      await controller.lock(orientation as "landscape" | "portrait" | "landscape-primary" | "landscape-secondary" | "portrait-primary" | "portrait-secondary");
      return wanted === "landscape" ? "已请求系统横屏" : "已请求系统竖屏";
    } catch (err) {
      lastError = err;
    }
  }
  void lastError;
  return wanted === "landscape" ? "横屏锁定被浏览器限制，请横握手机" : "竖屏锁定被浏览器限制";
}

/** 当前视口是否更接近竖屏（高>宽）。 */
function isPortraitViewport(width: number, height: number) {
  return height > 0 && width > 0 && height > width * 1.05;
}

function releaseScreenOrientation() {
  try {
    (window.screen?.orientation as ScreenOrientationController | undefined)?.unlock?.();
  } catch {
    // 不同浏览器对方向解锁权限处理不一致，失败时保持静默，不影响退出全屏。
  }
}

function playbackTip(latest?: FullDetail) {
  if (!latest) return "打开视频详情页后会自动记录播放资源。";
  if (latest.fullStat?.error && latest.backupStat?.error) return "主备线路探测都异常，建议刷新播放资源或检查账号池。";
  if (!latest.playLink && latest.backupLink) return "主线路缺失，已检测到备用线路，可先复制备用线路或重新刷新资源。";
  if (latest.playLink && latest.backupLink) return "主备线路都已记录，播放卡顿时可切换备用线路。";
  if (latest.playLink) return "主线路已就绪，播放不稳时可刷新资源获取最新链接。";
  return "播放详情缺少可用链接，建议刷新资源或处理账号池。";
}

function playbackHealth(latest: FullDetail | undefined, lines: PlaybackLine[], preferredLine?: PlaybackLine) {
  // 播放体检只使用当前已捕获的探测数据，不额外发请求，避免影响用户正在播放的视频。
  const usableLines = lines.filter((line) => line.url && !line.stat?.error);
  const readyLines = lines.filter((line) => lineState(line).ready && line.url);
  const errorLines = lines.filter((line) => line.stat?.error);
  const pendingLines = lines.filter((line) => line.stat?.pending);
  const segmentTotal = preferredLine?.stat?.segments || latest?.fullStat?.segments || latest?.backupStat?.segments || 0;
  const duration = preferredLine?.stat?.duration || latest?.fullStat?.duration || latest?.backupStat?.duration || 0;
  const risks: string[] = [];
  let score = 0;

  if (latest) score += 15;
  if (usableLines.length) score += 30;
  if (readyLines.length > 1) score += 15;
  else if (readyLines.length === 1) score += 10;
  if (segmentTotal) score += 20;
  if (duration) score += 10;
  if (!errorLines.length && usableLines.length) score += 10;
  else if (errorLines.length < lines.length) score += 4;
  score = Math.max(0, Math.min(100, score));

  if (!latest) {
    risks.push("等待打开视频详情页后捕获播放资源。");
  } else {
    if (!usableLines.length) risks.push("暂未检测到可用线路，建议刷新播放资源或检查账号池。");
    if (errorLines.length === lines.length) risks.push("主备线路都出现探测异常，需要优先刷新资源。");
    else errorLines.forEach((line) => risks.push(`${line.label}探测异常，可先使用另一条线路。`));
    if (pendingLines.length) risks.push("仍有线路在探测中，稍等片刻后可再次查看体检结果。");
    if (!segmentTotal) risks.push("分片数量未知，播放卡顿时建议先刷新资源。");
    if (usableLines.length === 1) risks.push("仅检测到一条线路，建议保留备用线路用于卡顿时切换。");
    if (!risks.length) risks.push("线路信息完整，可以优先使用推荐线路播放或下载。");
  }

  const label = score >= 85 ? "优秀" : score >= 65 ? "可用" : score >= 35 ? "需观察" : latest ? "待刷新" : "待捕获";
  const tone = score >= 85 ? "text-emerald-600" : score >= 65 ? "text-sky-600" : score >= 35 ? "text-amber-600" : "text-rose-600";
  const bg = score >= 85 ? "bg-emerald-50" : score >= 65 ? "bg-sky-50" : score >= 35 ? "bg-amber-50" : "bg-rose-50";
  const preferredScore = preferredLine ? lineScore(preferredLine) : -Infinity;
  const summary = preferredLine?.url
    ? `推荐优先使用${preferredLine.label}（线路分 ${Math.round(preferredScore)}），总体检 ${score}。`
    : "暂未找到可推荐线路。";

  return {
    score,
    label,
    tone,
    bg,
    summary,
    recommendedLabel: preferredLine?.url ? preferredLine.label : "暂无推荐",
    recommendedScore: Number.isFinite(preferredScore) ? Math.round(preferredScore) : 0,
    riskCount: latest ? Math.max(0, risks.filter((item) => !item.includes("信息完整")).length) : risks.length,
    risks
  };
}

function lineReport(line: PlaybackLine) {
  const stateInfo = lineState(line);
  const lineUrl = absoluteUrl(line.url || "");
  return [
    `${line.label}：${stateInfo.label}`,
    `完整链接：${lineUrl || "暂无"}`,
    `分片数量：${line.stat?.segments || "未知"}`,
    `视频时长：${line.stat?.duration ? formatDuration(line.stat.duration) : "未知"}`,
    `HTTP 状态：${line.stat?.status || "未知"}`,
    line.stat?.error ? `异常信息：${line.stat.error}` : ""
  ].filter(Boolean).join("\n");
}

function playbackHealthReport(
  latest: FullDetail | undefined,
  lines: PlaybackLine[],
  health: ReturnType<typeof playbackHealth>,
  currentTask?: DownloadTask | null
) {
  // 报告面向排障复制，保留完整链接和关键状态，避免用户手动拼截图信息。
  const fetchedAt = latest?.fetchedAt || String((latest as { ts?: string } | undefined)?.ts || "");
  const taskUrl = absoluteUrl(currentTask?.url || "");
  const taskLines = currentTask ? [
    `任务名称：${downloadTitle(currentTask)}`,
    `任务状态：${downloadStageLabel(currentTask.stage)}`,
    `输出格式：${downloadFormat(currentTask)}`,
    `文件大小：${formatBytes(currentTask.bytes)}`,
    `更新时间：${currentTask.updatedAt || "未记录"}`,
    `完整源链接：${taskUrl || "暂无"}`,
    currentTask.error ? `失败原因：${currentTask.error}` : "",
    currentTask.transmuxError ? `转封装异常：${currentTask.transmuxError}` : ""
  ].filter(Boolean) : ["当前视频还没有下载任务。"];

  return [
    "糖心志者播放资源体检报告",
    `视频标题：${latest?.movieTitle || latest?.title || "未记录"}`,
    `视频编号：${latest?.movieId || "未记录"}`,
    `账号：${latest?.accountLabel || latest?.accountUser || "未记录"}`,
    `获取时间：${fetchedAt || "未记录"}`,
    `体检分：${health.score}`,
    `体检状态：${health.label}`,
    `推荐线路：${health.recommendedLabel}`,
    "",
    "风险提示：",
    ...health.risks.map((item) => `- ${item}`),
    "",
    "线路详情：",
    ...lines.map(lineReport),
    "",
    "下载任务：",
    ...taskLines
  ].join("\n");
}

function playbackRecordReport(item: FullDetail, recordTask?: DownloadTask | null) {
  // 单条播放记录报告面向历史视频排查，保留主备线路和关联下载任务状态。
  const playUrl = absoluteUrl(item.playLink || "");
  const backupUrl = absoluteUrl(item.backupLink || "");
  const taskUrl = absoluteUrl(recordTask?.url || "");
  const taskLines = recordTask ? [
    `任务名称：${downloadTitle(recordTask)}`,
    `任务状态：${downloadStageLabel(recordTask.stage)}`,
    `输出格式：${downloadFormat(recordTask)}`,
    `下载进度：${recordTask.total ? `${recordTask.current || 0}/${recordTask.total}` : `${downloadProgress(recordTask)}%`}`,
    `文件大小：${formatBytes(recordTask.bytes)}`,
    `更新时间：${recordTask.updatedAt || "未记录"}`,
    `完整源链接：${taskUrl || "暂无"}`,
    recordTask.error ? `失败原因：${recordTask.error}` : "",
    recordTask.transmuxError ? `转封装异常：${recordTask.transmuxError}` : ""
  ].filter(Boolean) : ["当前播放记录还没有下载任务。"];

  return [
    "糖心志者播放记录报告",
    `视频标题：${item.movieTitle || item.title || "未记录"}`,
    `视频编号：${item.movieId || "未记录"}`,
    `账号：${item.accountLabel || item.accountUser || "未记录"}`,
    `获取时间：${String((item as { ts?: string }).ts || item.fetchedAt || "") || "未记录"}`,
    `主线路：${playUrl || "暂无"}`,
    `备用线路：${backupUrl || "暂无"}`,
    `主线路分片：${item.fullStat?.segments || "未知"}`,
    `主线路时长：${item.fullStat?.duration ? formatDuration(item.fullStat.duration) : "未知"}`,
    `主线路状态：${item.fullStat?.status || "未知"}`,
    item.fullStat?.error ? `主线路异常：${item.fullStat.error}` : "",
    `备用线路分片：${item.backupStat?.segments || "未知"}`,
    `备用线路时长：${item.backupStat?.duration ? formatDuration(item.backupStat.duration) : "未知"}`,
    `备用线路状态：${item.backupStat?.status || "未知"}`,
    item.backupStat?.error ? `备用线路异常：${item.backupStat.error}` : "",
    "",
    "下载任务：",
    ...taskLines
  ].filter((line) => line !== "").join("\n");
}

function playbackRecordsReport(rows: { item: FullDetail; recordTask?: DownloadTask | null; recordFailed?: boolean }[], filterLabel = "当前筛选") {
  // 批量报告用于一次性排查多个历史视频，保留当前筛选结果和完整链接。
  const readyCount = rows.filter((row) => absoluteUrl(row.item.playLink || row.item.backupLink || "")).length;
  const failedCount = rows.filter((row) => row.recordFailed).length;
  const backupCount = rows.filter((row) => row.item.backupLink).length;
  const lines = [
    "糖心志者播放记录批量报告",
    `筛选范围：${filterLabel}`,
    `记录数量：${rows.length}`,
    `可播放记录：${readyCount}`,
    `异常记录：${failedCount}`,
    `含备用线路：${backupCount}`,
    `生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    ""
  ];
  rows.forEach((row, index) => {
    const item = row.item;
    const recordTask = row.recordTask || null;
    const playUrl = absoluteUrl(item.playLink || "");
    const backupUrl = absoluteUrl(item.backupLink || "");
    const taskUrl = absoluteUrl(recordTask?.url || "");
    lines.push(
      `${index + 1}. ${item.movieTitle || item.title || item.movieId || "播放详情"}`,
      `视频编号：${item.movieId || "未记录"}`,
      `账号：${item.accountLabel || item.accountUser || "未记录"}`,
      `获取时间：${String((item as { ts?: string }).ts || item.fetchedAt || "") || "未记录"}`,
      `主线路：${playUrl || "暂无"}`,
      `备用线路：${backupUrl || "暂无"}`,
      `主线路分片：${item.fullStat?.segments || "未知"}`,
      `主线路时长：${item.fullStat?.duration ? formatDuration(item.fullStat.duration) : "未知"}`,
      item.fullStat?.error ? `主线路异常：${item.fullStat.error}` : "",
      item.backupStat?.error ? `备用线路异常：${item.backupStat.error}` : "",
      recordTask ? `下载任务：${downloadStageLabel(recordTask.stage)} / ${downloadFormat(recordTask)} / ${recordTask.total ? `${recordTask.current || 0}/${recordTask.total}` : `${downloadProgress(recordTask)}%`}` : "下载任务：未创建",
      recordTask ? `下载源链接：${taskUrl || "暂无"}` : "",
      recordTask?.error ? `下载失败：${recordTask.error}` : "",
      recordTask?.transmuxError ? `转封装异常：${recordTask.transmuxError}` : "",
      ""
    );
  });
  return lines.filter((line) => line !== "").join("\n");
}

function taskTone(task?: DownloadTask | null) {
  if (!task) return { label: "未创建", color: "bg-purple-50 text-purple-500" };
  if (task.stage === "error") return { label: "下载失败", color: "bg-rose-50 text-rose-600" };
  if (task.stage === "complete") return { label: "已保存", color: "bg-emerald-50 text-emerald-600" };
  if (task.stage === "ready") return { label: "可保存", color: "bg-emerald-50 text-emerald-600" };
  return { label: downloadStageLabel(task.stage), color: "bg-amber-50 text-amber-600" };
}

function initialPlayerVolume() {
  const saved = Number(window.localStorage.getItem(playerVolumeStorageKey) || "");
  return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.8;
}

function initialPlayerMuted() {
  return window.localStorage.getItem(playerMutedStorageKey) === "1";
}

function initialPlayerFillMode(): PlayerFillMode {
  // 默认使用原比例完整显示，避免全屏观看时裁剪或强行拉伸视频画面。
  const saved = window.localStorage.getItem(playerFillStorageKey);
  return saved === "cover" || saved === "fill" ? saved : "contain";
}

function initialPlayerBrightness() {
  // 亮度偏好本地记忆，范围保持克制，避免误操作后画面过暗或过曝。
  const saved = Number(window.localStorage.getItem(playerBrightnessStorageKey) || "");
  return Number.isFinite(saved) ? Math.max(60, Math.min(140, saved)) : 100;
}

function initialPlayerOrientationMode(): PlayerOrientationMode {
  const saved = window.localStorage.getItem(playerOrientationStorageKey);
  return saved === "landscape" || saved === "portrait" ? saved : "auto";
}

function orientationModeLabel(mode: PlayerOrientationMode, rotated: boolean) {
  if (mode === "landscape") return "横屏";
  if (mode === "portrait") return "竖屏";
  return rotated ? "自动横屏" : "自动方向";
}

export function PlaybackPage({ state, onAction, onPage }: Props) {
  const [recordFilter, setRecordFilter] = useState<PlaybackRecordFilter>("all");
  const [recordSearch, setRecordSearch] = useState("");
  const [recordSort, setRecordSort] = useState<PlaybackRecordSort>("recent");
  // 播放页次级信息分段：资源体检 / 下载 / 记录，减少一屏堆叠。
  const [panelTab, setPanelTab] = useState<PlaybackPanelTab>("resource");
  // 下载线路：auto / play / backup
  const [downloadLineKey, setDownloadLineKey] = useState<"auto" | "play" | "backup">("auto");
  const [previewKey, setPreviewKey] = useState<PlaybackPreviewKey>("recommended");
  const [previewRecord, setPreviewRecord] = useState<PlaybackPreviewRecord | null>(null);
  const [playerReloadKey, setPlayerReloadKey] = useState(0);
  const [playerStatus, setPlayerStatus] = useState("等待播放链接");
  const [playerError, setPlayerError] = useState("");
  const [playerAutoBackupUsed, setPlayerAutoBackupUsed] = useState(false);
  const [playerResumeTip, setPlayerResumeTip] = useState("");
  const [playerImmersive, setPlayerImmersive] = useState(false);
  const [browserFullscreenActive, setBrowserFullscreenActive] = useState(false);
  const [playerFitMode, setPlayerFitMode] = useState<PlayerFitMode>("auto");
  const [detectedFitMode, setDetectedFitMode] = useState<Exclude<PlayerFitMode, "auto">>("wide");
  const [playerStats, setPlayerStats] = useState<PlayerSnapshot>({ currentTime: 0, duration: 0, bufferedEnd: 0, paused: true, rate: 1 });
  const [playerQualities, setPlayerQualities] = useState<PlayerQualityOption[]>([]);
  const [playerQualityLevel, setPlayerQualityLevel] = useState(-1);
  const [playerMoreOpen, setPlayerMoreOpen] = useState(false);
  const [playerMorePanel, setPlayerMorePanel] = useState<PlayerMorePanelKey>("line");
  const [playerVolumeOpen, setPlayerVolumeOpen] = useState(false);
  const [playerRateOpen, setPlayerRateOpen] = useState(false);
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true);
  const [playerVolume, setPlayerVolume] = useState(initialPlayerVolume);
  const [playerMuted, setPlayerMuted] = useState(initialPlayerMuted);
  const [playerSeekStep, setPlayerSeekStep] = useState(10);
  const [playerFillMode, setPlayerFillMode] = useState<PlayerFillMode>(initialPlayerFillMode);
  const [playerBrightness, setPlayerBrightness] = useState(initialPlayerBrightness);
  const [playerOrientationMode, setPlayerOrientationMode] = useState<PlayerOrientationMode>(initialPlayerOrientationMode);
  const [playerVideoSize, setPlayerVideoSize] = useState({ width: 0, height: 0 });
  const [playerViewportSize, setPlayerViewportSize] = useState({ width: window.innerWidth || 0, height: window.innerHeight || 0 });
  const [playerCursorHidden, setPlayerCursorHidden] = useState(false);
  const [playerFullscreenDiagnostic, setPlayerFullscreenDiagnostic] = useState<PlayerFullscreenDiagnostic>(emptyFullscreenDiagnostic);
  const [playerFullscreenTune, setPlayerFullscreenTune] = useState<PlayerFullscreenTune>(emptyFullscreenTune);
  const [playerBuffering, setPlayerBuffering] = useState(false);
  // 全屏锁屏：锁住后只保留解锁按钮，避免横屏躺着看时误触控制层。
  const [playerUiLocked, setPlayerUiLocked] = useState(false);
  // 全屏顶部诊断徽标默认短时显示，随后收起，减少观影干扰。
  const [playerFullscreenMetaVisible, setPlayerFullscreenMetaVisible] = useState(true);
  const [playerGestureHud, setPlayerGestureHud] = useState<GestureHudState>({ kind: "", text: "" });
  const [holdSeekHint, setHoldSeekHint] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<Artplayer | null>(null);
  const holdRateRef = useRef<{ active: boolean; prevRate: number }>({ active: false, prevRate: 1 });
  const controlsPinnedByClickRef = useRef(false);
  const controlsRevealSuppressedUntilRef = useRef(0);
  const controlsTimerRef = useRef<number | undefined>();
  const cursorTimerRef = useRef<number | undefined>();
  const gestureHudTimerRef = useRef<number | undefined>();
  const fullscreenMetaTimerRef = useRef<number | undefined>();
  const playerDiagnosticReportRef = useRef("");
  // 仅在用户明确点全屏时为 true；防止 ArtPlayer 内置全屏失败/误触发把面板打成沉浸黑屏。
  const wantFullscreenRef = useRef(false);
  // 主控按钮刚操作后的短窗口，忽略外壳 surface 点击，避免“点播放却被当成点画面”。
  const controlActionStampRef = useRef(0);
  // 播放器运行时快照：给 ArtPlayer 事件回调和右键菜单读取最新界面状态，避免闭包里的旧值。
  const playerRuntimeRef = useRef({ previewKey: "recommended" as PlaybackPreviewKey, title: "", backupUrl: "", autoBackupUsed: false, resumeId: "" });
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [progressPreviewTime, setProgressPreviewTime] = useState<number | null>(null);
  const progressDragRef = useRef<{ active: boolean; startX: number; startTime: number }>({ active: false, startX: 0, startTime: 0 });
  const latest = latestFullDetail(state);
  // 同一 movieId 只保留最新一条展示，避免刷新/下载/主备链路重复写入造成「一视频两条记录」。
  const records = (() => {
    const raw = Array.isArray(state.fullDetails) ? state.fullDetails : [];
    const seen = new Set<string>();
    const deduped: FullDetail[] = [];
    for (let i = raw.length - 1; i >= 0; i -= 1) {
      const item = raw[i];
      if (!item) continue;
      const movieId = String(item.movieId || "").trim();
      const key = movieId
        || `${String(item.playLink || "").trim()}|${String(item.backupLink || "").trim()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 24) break;
    }
    return deduped;
  })();
  const lines: PlaybackLine[] = [
    { key: "play", label: "主线路", url: latest?.playLink, stat: latest?.fullStat, copyAction: "copy-play-link", openAction: "open-playback-url" },
    { key: "backup", label: "备用线路", url: latest?.backupLink, stat: latest?.backupStat, copyAction: "copy-backup-link", openAction: "open-playback-url" }
  ];
  const preferredLine = bestLine(lines);
  const segmentTotal = preferredLine?.stat?.segments || latest?.fullStat?.segments || latest?.backupStat?.segments || 0;
  const duration = preferredLine?.stat?.duration || latest?.fullStat?.duration || latest?.backupStat?.duration;
  const readyCount = lines.filter((line) => lineState(line).ready && line.url).length;
  const fetchedAt = latest?.fetchedAt || String((latest as { ts?: string } | undefined)?.ts || "");
  const currentTask = downloadTaskForMovie(state, latest?.movieId);
  const taskProgress = currentTask ? downloadProgress(currentTask) : 0;
  const currentTaskTone = taskTone(currentTask);
  const currentTaskUrl = absoluteUrl(currentTask?.url || "");
  const preferredLineUrl = absoluteUrl(preferredLine?.url || "");
  const backupLineUrl = absoluteUrl(lines[1]?.url || "");
  const previewOptions = [
    { key: "recommended" as const, label: "推荐", url: preferredLineUrl, hint: preferredLine?.label || "自动选择" },
    { key: "play" as const, label: "主线", url: absoluteUrl(lines[0]?.url || ""), hint: lineState(lines[0]).label },
    { key: "backup" as const, label: "备用", url: absoluteUrl(lines[1]?.url || ""), hint: lineState(lines[1]).label }
  ];
  const activePreviewKey = previewKey === "record" && previewRecord?.url ? "record" : previewKey === "record" ? "recommended" : previewKey;
  const selectedPreviewOption = previewOptions.find((item) => item.key === activePreviewKey) || previewOptions[0];
  const previewUrl = activePreviewKey === "record" ? absoluteUrl(previewRecord?.url || "") : selectedPreviewOption.url;
  const previewTitle = activePreviewKey === "record"
    ? (previewRecord?.title || "播放记录")
    : `${latest?.movieTitle || latest?.title || latest?.movieId || "当前视频"} · ${previewLineLabel(activePreviewKey)}`;
  const previewSourceLabel = isPlaylistUrl(previewUrl) ? "HLS播放列表" : previewUrl ? "视频源" : "等待链接";
  const previewProgress = percent(playerStats.currentTime, playerStats.duration);
  const previewBuffered = percent(playerStats.bufferedEnd, playerStats.duration);
  const playerFullscreenActive = playerImmersive || browserFullscreenActive;
  const playerVideoLandscape = playerVideoSize.width > 0 && playerVideoSize.height > 0 && playerVideoSize.width >= playerVideoSize.height * 1.08;
  const playerVideoPortrait = playerVideoSize.width > 0 && playerVideoSize.height > 0 && playerVideoSize.height > playerVideoSize.width * 1.08;
  // 全屏自动方向：横屏片 / 尺寸未知（悬浮秒开）优先横屏；明确竖屏片才不锁横屏
  const preferLandscapeInFullscreen = playerFullscreenActive
    && playerOrientationMode !== "portrait"
    && (playerOrientationMode === "landscape" || playerVideoLandscape || !playerVideoPortrait);
  // 手机横屏矮屏：Kiwi 等浏览器横屏高度常 < 420，控制栏必须紧凑，否则会占掉半个画面。
  const isCompactLandscape = playerViewportSize.height > 0
    && playerViewportSize.width > playerViewportSize.height
    && playerViewportSize.height <= 520;
  const playerOrientationRequested = playerFullscreenActive && Boolean(
    wantedScreenOrientation(playerOrientationMode, playerVideoLandscape, preferLandscapeInFullscreen && !playerVideoPortrait)
  );
  const playerOrientationLabel = orientationModeLabel(playerOrientationMode, playerOrientationRequested);
  // 系统横屏锁失败且仍是竖屏视口时：用 CSS 把全屏舞台旋成横屏布局（悬浮入口看横屏片）
  const cssForceLandscape = Boolean(
    playerFullscreenActive
    && preferLandscapeInFullscreen
    && !playerVideoPortrait
    && isPortraitViewport(playerViewportSize.width, playerViewportSize.height)
  );
  const playerFitLabel = fitModeLabel(playerFitMode, detectedFitMode);
  const playerShellAspect = playerFullscreenActive ? undefined : fitModeAspect(playerFitMode, detectedFitMode);
  const fullscreenDiagnosticLabel = playerFullscreenDiagnostic.ok
    ? `${playerFullscreenDiagnostic.source} · 覆盖 ${playerFullscreenDiagnostic.coverage}%`
    : `全屏体检：${playerFullscreenDiagnostic.issue}`;
  const currentQualityLabel = playerQualityLevel < 0
    ? (playerQualities.length ? "自动清晰度" : "清晰度自动")
    : playerQualities.find((item) => item.level === playerQualityLevel)?.label || `档位 ${playerQualityLevel + 1}`;
  const controlsShouldStayVisible = !previewUrl || playerStats.paused || playerMoreOpen || playerVolumeOpen || playerRateOpen || Boolean(playerError) || Boolean(holdSeekHint) || playerUiLocked;
  // 全屏 / 横屏矮屏：贴底渐变沉浸控制层；普通竖屏面板才用悬浮圆角卡片。
  const playerControlsTone = (playerFullscreenActive || isCompactLandscape)
    ? "inset-x-0 bottom-0 rounded-none bg-gradient-to-t from-black/92 via-black/55 to-transparent px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-8 sm:px-5 sm:pb-4"
    : "inset-x-2 bottom-2 rounded-2xl bg-black/70 p-2.5 shadow-lg backdrop-blur-md ring-1 ring-white/10";
  // 横屏矮屏用更小按钮，避免控制条过高；桌面全屏才放大。
  // 全屏/面板统一用紧凑图标，避免多级菜单与主控按钮图标过大遮挡画面。
  const playerControlIconSize = isCompactLandscape ? 13 : playerFullscreenActive ? 14 : 13;
  const playerControlButtonSize = "md" as const;
  const playerStageStyle = {
    "--txzz-player-viewport-width": `${playerViewportSize.width || 0}px`,
    "--txzz-player-viewport-height": `${playerViewportSize.height || 0}px`,
    "--txzz-player-video-position-x": `${playerFullscreenTune.objectPositionX}%`,
    "--txzz-player-safe-shift-x": `${playerFullscreenTune.shiftX}px`
  } as CSSProperties;
  const health = playbackHealth(latest, lines, preferredLine);
  const healthReport = playbackHealthReport(latest, lines, health, currentTask);
  const playerDiagnosticReport = [
    "糖心志者网页播放器诊断报告",
    `视频标题：${previewTitle}`,
    `当前线路：${previewLineLabel(activePreviewKey)}`,
    `播放内核：ArtPlayer + hls.js`,
    `播放源类型：${previewSourceLabel}`,
    `完整链接：${previewUrl || "暂无"}`,
    `播放器状态：${playerStatus}`,
    `播放异常：${playerError || "暂无"}`,
    `播放进度：${formatDuration(playerStats.currentTime)} / ${playerStats.duration ? formatDuration(playerStats.duration) : "未知"}`,
    `缓冲进度：${playerStats.duration ? `${previewBuffered}%` : "未知"}`,
    `播放速度：${playerStats.rate}x`,
    `播放音量：${playerMuted ? "静音" : `${Math.round(playerVolume * 100)}%`}`,
    `快进步长：${playerSeekStep}秒`,
    `画面填充：${fillModeLabel(playerFillMode)}`,
    `横竖屏方向：${playerOrientationLabel}`,
    `视频原始尺寸：${playerVideoSize.width || "?"}x${playerVideoSize.height || "?"}`,
    `画面亮度：${playerBrightness}%`,
    `当前清晰度：${currentQualityLabel}`,
    `全屏来源：${playerFullscreenDiagnostic.source}`,
    `全屏容器：${playerFullscreenDiagnostic.shellSize}`,
    `当前视口：${playerFullscreenDiagnostic.viewportSize}`,
    `容器偏移：${playerFullscreenDiagnostic.shellOffset}`,
    `视频层尺寸：${playerFullscreenDiagnostic.videoSize}`,
    `视频层偏移：${playerFullscreenDiagnostic.videoOffset}`,
    `左右黑边：${playerFullscreenDiagnostic.sideBars}`,
    `手机视觉居中：${playerFullscreenTune.label}`,
    `视口覆盖：${playerFullscreenDiagnostic.coverage}%`,
    `全屏体检：${playerFullscreenDiagnostic.ok ? "正常" : playerFullscreenDiagnostic.issue}`,
    `自动切换备用：${playerAutoBackupUsed ? "已触发" : "未触发"}`,
    `推荐线路：${health.recommendedLabel}`,
    `体检分：${health.score}`,
    "",
    "风险提示：",
    ...health.risks.map((item) => `- ${item}`)
  ].join("\n");
  playerDiagnosticReportRef.current = playerDiagnosticReport;
  // 每次渲染同步运行时快照，播放器内部回调统一读取这里的最新值。
  playerRuntimeRef.current = {
    previewKey: activePreviewKey,
    title: previewTitle,
    backupUrl: backupLineUrl,
    autoBackupUsed: playerAutoBackupUsed,
    resumeId: (activePreviewKey === "record" ? previewRecord?.movieId : latest?.movieId) || ""
  };

  const clearControlsTimer = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = undefined;
    }
  };

  const showPlayerGestureHud = (next: GestureHudState, duration = 900) => {
    if (gestureHudTimerRef.current) window.clearTimeout(gestureHudTimerRef.current);
    setPlayerGestureHud(next);
    if (!next.kind) return;
    gestureHudTimerRef.current = window.setTimeout(() => {
      setPlayerGestureHud({ kind: "", text: "" });
      gestureHudTimerRef.current = undefined;
    }, duration);
  };

  const scheduleFullscreenMetaHide = () => {
    if (fullscreenMetaTimerRef.current) window.clearTimeout(fullscreenMetaTimerRef.current);
    setPlayerFullscreenMetaVisible(true);
    fullscreenMetaTimerRef.current = window.setTimeout(() => {
      setPlayerFullscreenMetaVisible(false);
      fullscreenMetaTimerRef.current = undefined;
    }, 2800);
  };

  const refreshFullscreenDiagnostic = () => {
    setPlayerFullscreenDiagnostic(
      measureFullscreenDiagnostic(playerShellRef.current, fullscreenHostElement(), playerImmersive || browserFullscreenActive, videoRef.current)
    );
  };

  const refreshFullscreenTune = () => {
    setPlayerFullscreenTune(calculateFullscreenTune(videoRef.current, playerFullscreenActive, playerFillMode));
  };

  const scheduleFullscreenDiagnosticRefresh = () => {
    // 浏览器进入全屏和 CSS 接管尺寸都有短暂延迟，延后一拍测量能拿到更接近真实显示的容器数据。
    window.setTimeout(() => {
      setPlayerFullscreenDiagnostic(measureFullscreenDiagnostic(playerShellRef.current, fullscreenHostElement(), true, videoRef.current));
      setPlayerFullscreenTune(calculateFullscreenTune(videoRef.current, true, playerFillMode));
    }, 120);
  };

  const applyPlayerVolume = (nextVolume: number, nextMuted = false) => {
    const volume = Math.max(0, Math.min(1, nextVolume));
    const art = artRef.current;
    setPlayerVolume(volume);
    setPlayerMuted(nextMuted);
    window.localStorage.setItem(playerVolumeStorageKey, String(volume));
    window.localStorage.setItem(playerMutedStorageKey, nextMuted ? "1" : "0");
    if (art) {
      art.volume = volume;
      art.muted = nextMuted;
      art.notice.show = nextMuted ? "已静音" : `音量：${Math.round(volume * 100)}%`;
      setPlayerStats(playerSnapshot(art.video));
    }
    showPlayerGestureHud({
      kind: "volume",
      text: nextMuted || volume <= 0.001 ? "已静音" : `音量 ${Math.round(volume * 100)}%`,
      percent: nextMuted ? 0 : Math.round(volume * 100)
    });
    if (!playerUiLocked) revealPlayerControls(true);
  };

  const applyPlayerBrightness = (nextBrightness: number) => {
    const brightness = Math.max(60, Math.min(140, Math.round(nextBrightness)));
    setPlayerBrightness(brightness);
    window.localStorage.setItem(playerBrightnessStorageKey, String(brightness));
    if (artRef.current) artRef.current.notice.show = `亮度：${brightness}%`;
    showPlayerGestureHud({
      kind: "brightness",
      text: `亮度 ${brightness}%`,
      percent: Math.round(((brightness - 60) / 80) * 100)
    });
    if (!playerUiLocked) revealPlayerControls(true);
  };

  const revealPlayerControls = (keepVisible = false) => {
    // 锁屏时不展开完整控制层，只允许解锁入口出现。
    if (playerUiLocked) {
      setPlayerControlsVisible(false);
      setPlayerCursorHidden(playerFullscreenActive);
      clearControlsTimer();
      return;
    }
    // 播放时控制层短暂停留，暂停、报错或菜单展开时保持显示，避免按钮长期遮挡画面。
    setPlayerControlsVisible(true);
    setPlayerCursorHidden(false);
    clearControlsTimer();
    if (cursorTimerRef.current) window.clearTimeout(cursorTimerRef.current);
    if (playerFullscreenActive) scheduleFullscreenMetaHide();
    if (keepVisible || controlsPinnedByClickRef.current || controlsShouldStayVisible || !previewUrl) return;
    controlsTimerRef.current = window.setTimeout(() => setPlayerControlsVisible(false), playerFullscreenActive ? 2200 : 3000);
    if (playerFullscreenActive) cursorTimerRef.current = window.setTimeout(() => setPlayerCursorHidden(true), 2400);
  };

  const closePlayerPopovers = () => {
    setPlayerMoreOpen(false);
    setPlayerVolumeOpen(false);
    setPlayerRateOpen(false);
  };

  const hidePlayerControlsBySurfaceClick = () => {
    // 用户主动点画面隐藏时，短时间内忽略鼠标移动唤醒，避免 click 后紧跟的 pointer/mouse 事件把悬浮 UI 又弹回来。
    controlsPinnedByClickRef.current = false;
    controlsRevealSuppressedUntilRef.current = Date.now() + 900;
    clearControlsTimer();
    if (cursorTimerRef.current) window.clearTimeout(cursorTimerRef.current);
    closePlayerPopovers();
    if (!previewUrl || playerError || holdSeekHint || playerUiLocked) {
      setPlayerControlsVisible(playerUiLocked ? false : true);
      setPlayerCursorHidden(playerFullscreenActive && (playerUiLocked || Boolean(previewUrl)));
      return;
    }
    setPlayerControlsVisible(false);
    setPlayerCursorHidden(playerFullscreenActive);
    setPlayerFullscreenMetaVisible(false);
  };

  const revealPlayerControlsBySurfaceClick = () => {
    // 单击唤醒采用固定显示，下一次点击画面再隐藏，避免刚点开菜单就被自动隐藏打断。
    if (playerUiLocked) return;
    controlsPinnedByClickRef.current = true;
    controlsRevealSuppressedUntilRef.current = 0;
    revealPlayerControls(true);
  };

  const maybeRevealPlayerControls = () => {
    if (playerUiLocked) return;
    if (Date.now() < controlsRevealSuppressedUntilRef.current) return;
    if (!playerControlsVisible && previewUrl && !playerError && !holdSeekHint) return;
    revealPlayerControls();
  };

  const setPlayerControlsLock = (locked: boolean) => {
    setPlayerUiLocked(locked);
    closePlayerPopovers();
    controlsPinnedByClickRef.current = false;
    if (locked) {
      clearControlsTimer();
      if (cursorTimerRef.current) window.clearTimeout(cursorTimerRef.current);
      setPlayerControlsVisible(false);
      setPlayerCursorHidden(true);
      setPlayerFullscreenMetaVisible(false);
      showPlayerGestureHud({ kind: "lock", text: "已锁定控制层", percent: 100 }, 1200);
      setPlayerStatus("控制层已锁定，点击右下角解锁");
    } else {
      showPlayerGestureHud({ kind: "unlock", text: "已解锁控制层", percent: 100 }, 1000);
      revealPlayerControls(true);
      setPlayerStatus("控制层已解锁");
    }
  };

  useEffect(() => {
    const host = fullscreenHostElement();
    if (!host) return;
    const realOurs = isRealBrowserFullscreen()
      && isPlayerFullscreenElement(fullscreenElement(), playerShellRef.current, host);

    // 用户明确全屏 / 系统已是我们的全屏：保持宿主沉浸样式，禁止误清。
    if ((playerFullscreenActive && wantFullscreenRef.current) || wantFullscreenRef.current || realOurs) {
      prepareHostForBrowserFullscreen(host);
      return () => {
        if (!wantFullscreenRef.current && !isRealBrowserFullscreen()) {
          restoreHostAfterBrowserFullscreen(host);
        }
      };
    }
    restoreHostAfterBrowserFullscreen(host);
    return undefined;
  }, [playerFullscreenActive]);

  useEffect(() => {
    const syncFullscreen = () => {
      const fullscreenNode = fullscreenElement();
      const shell = playerShellRef.current;
      const host = fullscreenHostElement();
      const container = playerContainerRef.current;
      const stage = shell?.querySelector(".txzz-player-orientation-stage") as HTMLElement | null;
      const active = Boolean(fullscreenNode);
      const ours = isPlayerFullscreenElement(fullscreenNode, shell, host);
      if (active && ours && wantFullscreenRef.current) {
        prepareHostForBrowserFullscreen(host);
        setBrowserFullscreenActive(true);
        setPlayerImmersive(true);
      } else if (!active) {
        // 系统全屏结束（点缩小 / Esc / 手势）：必须完整回到插件面板，禁止卡在「竖排假全屏」。
        setBrowserFullscreenActive(false);
        wantFullscreenRef.current = false;
        setPlayerImmersive(false);
        restoreHostAfterBrowserFullscreen(host);
        clearForcedFullscreenStyles({
          shell,
          container,
          stage,
          video: videoRef.current,
          fill: playerFillMode === "cover" || playerFillMode === "fill" ? playerFillMode : "contain"
        });
        releaseScreenOrientation();
      }
      setPlayerFullscreenDiagnostic(
        measureFullscreenDiagnostic(shell, host, false, videoRef.current)
      );
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    document.addEventListener("webkitbeginfullscreen", syncFullscreen as EventListener);
    document.addEventListener("webkitendfullscreen", syncFullscreen as EventListener);
    syncFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
      document.removeEventListener("webkitbeginfullscreen", syncFullscreen as EventListener);
      document.removeEventListener("webkitendfullscreen", syncFullscreen as EventListener);
    };
  }, [playerFillMode]);

  useEffect(() => {
    refreshFullscreenDiagnostic();
    refreshFullscreenTune();
    if (!playerFullscreenActive) return undefined;
    const update = () => {
      refreshFullscreenDiagnostic();
      refreshFullscreenTune();
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    const timer = window.setTimeout(update, 180);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.clearTimeout(timer);
    };
  }, [browserFullscreenActive, playerFullscreenActive, playerImmersive, playerFillMode, playerVideoSize.width, playerVideoSize.height]);

  useEffect(() => {
    const syncViewport = () => {
      const viewport = measureViewportSize();
      const host = fullscreenHostElement();
      host?.style.setProperty("--txzz-player-viewport-width", `${viewport.width || 0}px`);
      host?.style.setProperty("--txzz-player-viewport-height", `${viewport.height || 0}px`);
      setPlayerViewportSize(viewport);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const syncVideoSize = () => {
      setPlayerVideoSize({
        width: Number(video.videoWidth || 0),
        height: Number(video.videoHeight || 0)
      });
    };
    syncVideoSize();
    video.addEventListener("loadedmetadata", syncVideoSize);
    video.addEventListener("resize", syncVideoSize);
    return () => {
      video.removeEventListener("loadedmetadata", syncVideoSize);
      video.removeEventListener("resize", syncVideoSize);
    };
  }, [previewUrl, playerReloadKey, videoRef.current]);

  useEffect(() => {
    clearControlsTimer();
    if (playerUiLocked) {
      setPlayerControlsVisible(false);
      setPlayerCursorHidden(true);
      return () => {
        clearControlsTimer();
        if (cursorTimerRef.current) window.clearTimeout(cursorTimerRef.current);
      };
    }
    setPlayerControlsVisible(true);
    if (playerFullscreenActive) scheduleFullscreenMetaHide();
    if (!controlsShouldStayVisible && previewUrl) {
      controlsTimerRef.current = window.setTimeout(() => setPlayerControlsVisible(false), playerFullscreenActive ? 2200 : 3000);
      if (playerFullscreenActive) cursorTimerRef.current = window.setTimeout(() => setPlayerCursorHidden(true), 2400);
    }
    return () => {
      clearControlsTimer();
      if (cursorTimerRef.current) window.clearTimeout(cursorTimerRef.current);
    };
  }, [controlsShouldStayVisible, previewUrl, playerFullscreenActive, playerUiLocked]);

  useEffect(() => {
    // 退出全屏时自动解除锁屏，避免普通面板模式下控制层被锁死。
    if (!playerFullscreenActive && playerUiLocked) setPlayerUiLocked(false);
    if (playerFullscreenActive) scheduleFullscreenMetaHide();
    return () => {
      if (fullscreenMetaTimerRef.current) window.clearTimeout(fullscreenMetaTimerRef.current);
    };
  }, [playerFullscreenActive]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "escape" && playerFullscreenActive) {
        event.preventDefault();
        // 锁屏时先解锁，再按一次 Esc 才退出全屏，避免躺着看片误触立刻退出。
        if (playerUiLocked) {
          setPlayerControlsLock(false);
          return;
        }
        exitPlayerFullscreen().catch(() => setPlayerImmersive(false));
        return;
      }
      if (!previewUrl || !artRef.current) return;
      if (playerUiLocked && key !== "l") return;
      if (key === " " || key === "k") {
        event.preventDefault();
        togglePlayerPlay();
        revealPlayerControls();
      } else if (key === "arrowleft") {
        event.preventDefault();
        seekPlayer(-playerSeekStep);
        revealPlayerControls();
      } else if (key === "arrowright") {
        event.preventDefault();
        seekPlayer(playerSeekStep);
        revealPlayerControls();
      } else if (key === "arrowup") {
        event.preventDefault();
        applyPlayerVolume(playerVolume + 0.05, false);
      } else if (key === "arrowdown") {
        event.preventDefault();
        applyPlayerVolume(playerVolume - 0.05, playerVolume <= 0.05);
      } else if (key === "m") {
        event.preventDefault();
        applyPlayerVolume(playerVolume || 0.8, !playerMuted);
      } else if (key === "l" && playerFullscreenActive) {
        event.preventDefault();
        setPlayerControlsLock(!playerUiLocked);
      } else if (key === "f") {
        event.preventDefault();
        togglePlayerFullscreen().catch((err) => setPlayerError(err instanceof Error ? err.message : String(err)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playerFullscreenActive, playerMuted, playerSeekStep, playerVolume, playerUiLocked, previewUrl]);

  useEffect(() => {
    // 全屏播放时申请屏幕常亮（Wake Lock），避免手机看片途中自动息屏打断观影；退出全屏或暂停后立即释放。
    if (!playerFullscreenActive || playerStats.paused) return undefined;
    let released = false;
    let lock: { release?: () => Promise<void> } | null = null;
    const requestLock = async () => {
      try {
        lock = (await (navigator as NavigatorWithWakeLock).wakeLock?.request?.("screen")) || null;
      } catch {
        // 浏览器拒绝或不支持 Wake Lock 时静默降级，不影响播放。
      }
    };
    const handleVisibility = () => {
      // 切回前台时浏览器会自动释放旧锁，需要重新申请一次。
      if (document.visibilityState === "visible" && !released) requestLock();
    };
    requestLock();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      try {
        lock?.release?.();
      } catch {
        // 释放失败不影响后续播放。
      }
    };
  }, [playerFullscreenActive, playerStats.paused]);

  useEffect(() => {
    // 全屏时支持鼠标滚轮调节音量：向上滚增大、向下滚减小，对齐桌面播放器软件的使用习惯。
    const shell = playerShellRef.current;
    if (!shell || !playerFullscreenActive) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextVolume = Math.max(0, Math.min(1, playerVolume + (event.deltaY < 0 ? 0.05 : -0.05)));
      applyPlayerVolume(nextVolume, nextVolume <= 0.001);
    };
    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => shell.removeEventListener("wheel", handleWheel);
  }, [playerFullscreenActive, playerVolume, playerMuted]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = previewUrl
      ? new MediaMetadata({
          title: previewTitle,
          artist: latest?.accountLabel || latest?.accountUser || "糖心志者",
          album: previewLineLabel(activePreviewKey)
        })
      : null;
    const setHandler = (name: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {
        // 不同浏览器支持的媒体键动作不同，忽略不支持的动作即可。
      }
    };
    setHandler("play", () => artRef.current?.play());
    setHandler("pause", () => artRef.current?.pause());
    setHandler("previoustrack", () => seekPlayer(-playerSeekStep));
    setHandler("nexttrack", () => seekPlayer(playerSeekStep));
    setHandler("seekbackward", (details) => seekPlayer(-Number(details.seekOffset || playerSeekStep)));
    setHandler("seekforward", (details) => seekPlayer(Number(details.seekOffset || playerSeekStep)));
    setHandler("seekto", (details) => {
      const art = artRef.current;
      const value = Number(details.seekTime || 0);
      if (!art || !Number.isFinite(value)) return;
      art.currentTime = value;
      setPlayerStats(playerSnapshot(art.video));
    });
    return () => {
      (["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[])
        .forEach((name) => setHandler(name, null));
    };
  }, [activePreviewKey, latest?.accountLabel, latest?.accountUser, playerSeekStep, previewTitle, previewUrl]);

  const endHoldRateBoost = () => {
    // 长按倍速结束后恢复原倍速，保证松手即回到用户原来的播放速度。
    if (!holdRateRef.current.active) return;
    const art = artRef.current;
    if (art) {
      art.playbackRate = holdRateRef.current.prevRate || 1;
      art.notice.show = `已恢复 ${holdRateRef.current.prevRate || 1}x 倍速`;
      setPlayerStats(playerSnapshot(art.video));
    }
    holdRateRef.current = { active: false, prevRate: 1 };
    setHoldSeekHint("");
  };

  useEffect(() => () => endHoldRateBoost(), []);

  useEffect(() => {
    // 完整播放器体验交给 ArtPlayer，HLS/m3u8 内核由 hls.js 接管，避免回退到功能过少的原生控件。
    const container = playerContainerRef.current;
    if (!container) return;
    const source = previewUrl;
    const storageKey = playerResumeStorageKey(playerRuntimeRef.current.resumeId, source);
    let disposed = false;

    artRef.current?.destroy(true);
    artRef.current = null;
    videoRef.current = null;
    container.innerHTML = "";
    setPlayerMoreOpen(false);
    setPlayerMorePanel("line");
    controlsPinnedByClickRef.current = false;
    controlsRevealSuppressedUntilRef.current = 0;
    setPlayerControlsVisible(true);
    setPlayerError("");
    setPlayerResumeTip("");
    setPlayerBuffering(false);
    setProgressPreviewTime(null);
    setPlayerStats({ currentTime: 0, duration: 0, bufferedEnd: 0, paused: true, rate: 1 });
    setPlayerQualities([]);
    setPlayerQualityLevel(-1);

    const setSafeStatus = (message: string) => {
      if (!disposed) setPlayerStatus(message);
    };
    const setSafeError = (message: string) => {
      if (!disposed) setPlayerError(message);
    };
    const rememberSnapshot = () => {
      const next = playerSnapshot(videoRef.current);
      if (!disposed) setPlayerStats(next);
      if (storageKey && next.duration && next.currentTime > 5 && next.currentTime < next.duration - 8) {
        window.localStorage.setItem(storageKey, JSON.stringify({ currentTime: Math.floor(next.currentTime), updatedAt: new Date().toISOString() }));
      }
    };
    const restoreProgress = () => {
      const video = videoRef.current;
      if (!video || !storageKey) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          setPlayerResumeTip("");
          return;
        }
        const saved = JSON.parse(raw) as { currentTime?: number };
        const savedTime = Number(saved.currentTime || 0);
        if (savedTime > 5 && Number.isFinite(savedTime) && (!video.duration || savedTime < video.duration - 8)) {
          video.currentTime = savedTime;
          setPlayerResumeTip(`已恢复到 ${formatDuration(savedTime)}`);
        } else {
          setPlayerResumeTip("");
        }
      } catch {
        window.localStorage.removeItem(storageKey);
        setPlayerResumeTip("");
      }
    };
    const switchBackupOnError = () => {
      // 通过运行时快照读取最新界面状态，避免事件回调闭包里的旧值导致重复切换或漏切换。
      const runtime = playerRuntimeRef.current;
      if (!runtime.autoBackupUsed && runtime.previewKey !== "backup" && runtime.backupUrl) {
        setPlayerAutoBackupUsed(true);
        setPreviewRecord(null);
        setPreviewKey("backup");
        setPlayerReloadKey((value) => value + 1);
        setSafeStatus("播放异常，已自动切换备用线路");
      }
    };

    if (!source) {
      setSafeStatus("等待可播放链接");
      return () => { disposed = true; };
    }

    // ——— ArtPlayer 单内核方案：界面交互由插件控制层负责，HLS 解码由 hls.js 负责 ———
    const art = new Artplayer({
      container,
      url: source,
      type: isPlaylistUrl(source) ? "m3u8" : "mp4",
      title: playerRuntimeRef.current.title,
      theme: "#38bdf8",
      volume: playerVolume,
      muted: playerMuted,
      autoplay: false,
      autoSize: false,
      autoMini: false,
      loop: false,
      flip: false,
      playbackRate: false,
      aspectRatio: false,
      screenshot: false,
      setting: false,
      // 关闭 ArtPlayer 内置热键，统一由插件全局键盘处理，避免同一按键触发两次快进快退。
      hotkey: false,
      pip: false,
      mutex: true,
      backdrop: false,
      fullscreen: false,
      fullscreenWeb: false,
      miniProgressBar: false,
      playsInline: true,
      // 关闭 ArtPlayer 内置锁屏/手势/自动横竖屏，统一由插件自定义控制层处理，避免和我们的点击手势抢事件。
      lock: false,
      gesture: false,
      fastForward: false,
      autoPlayback: true,
      autoOrientation: false,
      airplay: false,
      moreVideoAttr: {
        crossOrigin: "anonymous",
        preload: "metadata"
      },
      customType: {
        m3u8(video, url, artInstance) {
          if (Hls.isSupported()) {
            const hls = new Hls({
              // 优先尝试启用 worker 提升解码性能；浏览器扩展沙箱拒绝时 hls.js 会自动降级为同线程模式。
              enableWorker: true,
              // 缓冲策略：主缓冲 60s，向后保留 30s，最大允许 600s 缓冲区，减少频繁起播卡顿。
              maxBufferLength: 60,
              maxMaxBufferLength: 600,
              backBufferLength: 30,
              // ABR 自适应码率：初始自动选档（startLevel=-1），带宽估算起点 500Kbps，
              // 升档保守（0.7）避免过早上调后因带宽不足而降级，降档更敏感（0.9）保证流畅。
              startLevel: -1,
              abrEwmaDefaultEstimate: 500000,
              abrBandWidthFactor: 0.9,
              abrBandWidthUpFactor: 0.7,
              // 重试策略：分片和清单各增加重试次数，配合渐进延迟提升弱网播放成功率。
              levelLoadingMaxRetry: 6,
              levelLoadingRetryDelay: 1000,
              levelLoadingMaxRetryTimeout: 8000,
              fragLoadingMaxRetry: 6,
              fragLoadingRetryDelay: 1000,
              fragLoadingMaxRetryTimeout: 8000,
              manifestLoadingMaxRetry: 4,
              manifestLoadingRetryDelay: 500,
              // 关闭低延迟模式（直播用），启用软件 AES 解密兼容性更好。
              lowLatencyMode: false,
              enableSoftwareAES: true
            });
            hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
              const levels = (data.levels || []).map((level, index) => ({ level: index, label: hlsQualityLabel(level, index) }));
              setPlayerQualities(levels);
              setPlayerQualityLevel(-1);
              setSafeStatus(`HLS内核就绪${levels.length ? ` · ${levels.length}档清晰度可选` : ""}`);
            });
            hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
              setPlayerQualityLevel(Number(data.level ?? hls.currentLevel ?? -1));
            });
            // 细粒度错误分类处理：网络错误、媒体解码错误和其他错误采用不同恢复策略
            let fatalErrorCount = 0;
            let mediaRecoveryAttempted = false;
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (!data.fatal) {
                // 非致命错误（分片加载抖动等），静默记录，不打扰用户
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details !== "fragLoadError") {
                  setSafeStatus("网络波动，正在自动恢复");
                }
                return;
              }
              fatalErrorCount += 1;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                setSafeStatus("网络请求失败，正在重新加载");
                setSafeError("网络连接异常，已自动重试；反复失败时建议切换备用线路。");
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                if (!mediaRecoveryAttempted) {
                  mediaRecoveryAttempted = true;
                  setSafeStatus("视频解码异常，正在恢复");
                  setSafeError("视频解码出错，已尝试媒体恢复；若画面仍不正常请重载播放器。");
                  hls.recoverMediaError();
                } else {
                  // 二次解码失败，尝试交换编解码器后再恢复
                  setSafeStatus("解码恢复失败，重置播放器");
                  setSafeError("视频解码持续出错，已重置内核；仍不稳定时可切换备用线路。");
                  hls.swapAudioCodec?.();
                  hls.recoverMediaError();
                }
              } else {
                setSafeStatus("播放内核错误");
                setSafeError(`播放内核遇到未知错误（${String(data.details || data.type || "unknown")}），建议切换备用线路或重载。`);
              }
              // 连续3次致命错误才触发自动备用线路切换，避免误触
              if (fatalErrorCount >= 3) {
                switchBackupOnError();
              }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            artInstance.hls = hls;
            artInstance.on("destroy", () => hls.destroy());
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
            setSafeStatus("浏览器原生HLS播放");
          } else {
            setSafeStatus("需要外部打开");
            setSafeError("当前浏览器不支持直接播放此播放列表，可点击打开完整链接。");
          }
        }
      },
      controls: [],
      contextmenu: [
        {
          html: "复制完整链接",
          click: () => onAction("copy-play-link", { url: source, label: `${previewLineLabel(playerRuntimeRef.current.previewKey)}完整链接` })
        },
        {
          html: "打开完整链接",
          click: () => onAction("open-playback-url", { url: source, label: `${previewLineLabel(playerRuntimeRef.current.previewKey)}完整链接` })
        },
        {
          html: "复制播放器诊断",
          click: () => onAction("copy-playback-health-report", { report: playerDiagnosticReportRef.current })
        }
      ]
    }, (instance) => {
      artRef.current = instance;
      videoRef.current = instance.video;
      instance.volume = playerVolume;
      instance.muted = playerMuted;
      applyAdaptiveVideoLayout(instance.video, playerFillMode);
      setSafeStatus("完整播放器已就绪");
      restoreProgress();
      rememberSnapshot();
    });

    artRef.current = art;
    videoRef.current = art.video;
    art.volume = playerVolume;
    art.muted = playerMuted;
    applyAdaptiveVideoLayout(art.video, playerFillMode);
    art.on("ready", () => {
      applyAdaptiveVideoLayout(art.video, playerFillMode);
      setSafeStatus("完整播放器已就绪");
      restoreProgress();
      rememberSnapshot();
    });
    art.on("video:loadedmetadata", () => {
      const nextFit = detectVideoFit(art.video);
      setDetectedFitMode(nextFit);
      // 元数据就绪后按原比例自适应容器，并清掉可能残留的 filter
      applyAdaptiveVideoLayout(art.video, playerFillMode);
      setSafeStatus(`完整播放器就绪${art.duration ? ` · ${formatDuration(art.duration)}` : ""}`);
      art.notice.show = nextFit === "vertical" ? "已自动适配竖屏比例" : "已自动适配横屏比例";
      revealPlayerControls(true);
      restoreProgress();
      rememberSnapshot();
    });
    art.on("video:loadeddata", () => {
      applyAdaptiveVideoLayout(art.video, playerFillMode);
    });
    art.on("video:playing", () => {
      // 起播后再校正一次，修复部分机型「有声音无画面」
      applyAdaptiveVideoLayout(art.video, playerFillMode);
    });
    art.on("resize", () => {
      applyAdaptiveVideoLayout(art.video, playerFillMode);
    });
    art.on("video:timeupdate", rememberSnapshot);
    art.on("video:progress", rememberSnapshot);
    art.on("video:play", () => {
      rememberSnapshot();
      revealPlayerControls();
    });
    art.on("video:pause", () => {
      rememberSnapshot();
      revealPlayerControls(true);
    });
    art.on("video:ratechange", rememberSnapshot);
    // 缓冲状态跟踪：卡顿时在画面中央显示缓冲圈，恢复播放后自动隐藏。
    art.on("video:waiting", () => {
      if (!disposed) setPlayerBuffering(true);
    });
    art.on("video:playing", () => {
      if (!disposed) setPlayerBuffering(false);
    });
    art.on("video:canplay", () => {
      if (!disposed) setPlayerBuffering(false);
    });
    art.on("video:volumechange", () => {
      setPlayerVolume(art.volume);
      setPlayerMuted(art.muted);
      window.localStorage.setItem(playerVolumeStorageKey, String(art.volume));
      window.localStorage.setItem(playerMutedStorageKey, art.muted ? "1" : "0");
      rememberSnapshot();
    });
    art.on("video:ended", () => {
      if (storageKey) window.localStorage.removeItem(storageKey);
      rememberSnapshot();
      setPlayerResumeTip("");
    });
    art.on("video:error", () => {
      setSafeStatus("播放异常");
      setSafeError("视频加载失败，可切换备用线路、重载播放器或打开完整链接。");
      if (!disposed) setPlayerBuffering(false);
      revealPlayerControls(true);
      switchBackupOnError();
    });
    art.on("screenshot", () => {
      setSafeStatus("截图已生成");
    });
    art.on("fullscreen", (state) => {
      // 忽略 ArtPlayer 内置误触发的全屏状态，只同步用户主动全屏。
      if (!wantFullscreenRef.current) {
        if (state && art.fullscreen) {
          try {
            art.fullscreen = false;
          } catch {
            // 忽略强制退出失败。
          }
        }
        return;
      }
      setBrowserFullscreenActive(Boolean(state));
      setSafeStatus(state ? "已进入浏览器全屏" : "已退出浏览器全屏");
      if (!state) {
        wantFullscreenRef.current = false;
        setPlayerImmersive(false);
        fullscreenHostElement()?.classList.remove(playerFullscreenHostClass);
      }
    });
    art.on("fullscreenWeb", (state) => {
      if (!wantFullscreenRef.current) {
        if (state && art.fullscreenWeb) {
          try {
            art.fullscreenWeb = false;
          } catch {
            // 忽略。
          }
        }
        return;
      }
      setPlayerImmersive(Boolean(state));
      setSafeStatus(state ? "已进入网页全屏" : "已退出网页全屏");
    });
    art.on("fullscreenError", () => {
      // 只有用户点了全屏才允许沉浸兜底；普通播放时的内置全屏失败绝不能把面板藏掉。
      if (!wantFullscreenRef.current) return;
      setPlayerImmersive(true);
      setSafeStatus("浏览器全屏受限，已切换沉浸全屏");
      setSafeError("当前页面限制了浏览器全屏，已自动使用插件内沉浸全屏兜底。");
    });

    return () => {
      disposed = true;
      art.destroy(true);
      if (artRef.current === art) artRef.current = null;
      if (videoRef.current === art.video) videoRef.current = null;
    };
    // 依赖只保留播放地址和重载序号：标题、线路标签等展示信息通过运行时快照读取，
    // 避免仅标题变化就销毁重建播放器，减少不必要的黑屏和进度抖动。
  }, [previewUrl, playerReloadKey]);

  const exitPlayerFullscreen = async () => {
    // 完整退出：系统全屏 + CSS 沉浸态 + 内联强制样式，必须全部清掉才能回到插件面板。
    const art = artRef.current;
    const shell = playerShellRef.current;
    const container = playerContainerRef.current;
    const stage = shell?.querySelector(".txzz-player-orientation-stage") as HTMLElement | null;
    const host = fullscreenHostElement();
    const video = videoRef.current || art?.video || null;
    const fill = playerFillMode === "cover" || playerFillMode === "fill" ? playerFillMode : "contain";

    wantFullscreenRef.current = false;
    setPlayerUiLocked(false);
    setPlayerImmersive(false);
    setBrowserFullscreenActive(false);

    if (art?.fullscreenWeb) art.fullscreenWeb = false;
    try {
      if (art?.fullscreen) art.fullscreen = false;
    } catch {
      // 忽略
    }

    // 无论当前是否判定为系统全屏，都尝试 exit，避免状态不同步
    try {
      await exitFullscreen();
    } catch {
      // 忽略
    }
    // 再试一次：部分机型第一次 exit 无效
    window.setTimeout(() => {
      if (isRealBrowserFullscreen()) {
        exitFullscreen().catch(() => {});
      }
    }, 50);

    restoreHostAfterBrowserFullscreen(host);
    clearForcedFullscreenStyles({ shell, container, stage, video, fill });
    releaseScreenOrientation();

    setPlayerFullscreenDiagnostic(emptyFullscreenDiagnostic);
    setPlayerFullscreenTune(emptyFullscreenTune);
    revealPlayerControls(true);
    setPlayerStatus("已退出全屏，回到面板播放");
    setPlayerError("");

    // 下一帧再清一次，覆盖 fullscreenchange 竞态又写回的样式
    window.requestAnimationFrame(() => {
      clearForcedFullscreenStyles({
        shell: playerShellRef.current,
        container: playerContainerRef.current,
        stage: playerShellRef.current?.querySelector(".txzz-player-orientation-stage") as HTMLElement | null,
        video: videoRef.current,
        fill
      });
      restoreHostAfterBrowserFullscreen(fullscreenHostElement());
    });
    window.setTimeout(() => {
      clearForcedFullscreenStyles({
        shell: playerShellRef.current,
        container: playerContainerRef.current,
        stage: playerShellRef.current?.querySelector(".txzz-player-orientation-stage") as HTMLElement | null,
        video: videoRef.current,
        fill
      });
      restoreHostAfterBrowserFullscreen(fullscreenHostElement());
      applyAdaptiveVideoLayout(videoRef.current, fill);
    }, 120);
  };

  const fixFullscreenVideoPaint = () => {
    const shell = playerShellRef.current;
    const container = playerContainerRef.current;
    const video = videoRef.current || artRef.current?.video || null;
    // 全屏后连续多帧校正 + 强制重绘，覆盖 Kiwi/Chrome「进度在走画面全黑」
    const run = () => forceFullscreenVideoVisible({
      shell,
      container,
      video: videoRef.current || artRef.current?.video || video,
      fill: playerFillMode === "cover" || playerFillMode === "fill" ? playerFillMode : "contain"
    });
    run();
    window.requestAnimationFrame(run);
    window.setTimeout(run, 32);
    window.setTimeout(run, 80);
    window.setTimeout(run, 160);
    window.setTimeout(run, 320);
    window.setTimeout(run, 600);
    window.setTimeout(run, 1000);
  };

  const enterPlayerFullscreen = async () => {
    const art = artRef.current;
    const shell = playerShellRef.current;
    if (!art || !shell) return false;
    closePlayerPopovers();
    wantFullscreenRef.current = true;
    const host = fullscreenHostElement();
    const video = (art.video || videoRef.current) as HTMLVideoElement | null;

    // 全屏前：画面按 contain 铺满；不要用错误像素变量
    applyAdaptiveVideoLayout(video, playerFillMode === "cover" || playerFillMode === "fill" ? playerFillMode : "contain");
    prepareHostForBrowserFullscreen(host);
    setPlayerImmersive(true);
    setPlayerError("");

    // 已在系统全屏中：只校正画面
    if (isRealBrowserFullscreen() && isPlayerFullscreenElement(fullscreenElement(), shell, host)) {
      setBrowserFullscreenActive(true);
      setPlayerImmersive(true);
      fixFullscreenVideoPaint();
      revealPlayerControls(true);
      const status = "已进入浏览器全屏";
      setPlayerStatus(status);
      art.notice.show = status;
      requestScreenOrientation(playerOrientationMode, playerVideoLandscape, {
        preferLandscapeFallback: !playerVideoPortrait
      }).then((message) => {
        if (artRef.current && message) artRef.current.notice.show = message;
      });
      scheduleFullscreenDiagnosticRefresh();
      return true;
    }

    // 网站同款：优先宿主/播放器容器 requestFullscreen（不要优先 video 单独全屏）
    const result = await enterPlayerBrowserFullscreen({
      playerRoot: shell,
      video,
      pluginHost: host
    });

    const orientationMessage = await requestScreenOrientation(playerOrientationMode, playerVideoLandscape, {
      preferLandscapeFallback: !playerVideoPortrait
    });
    setBrowserFullscreenActive(result.real);
    setPlayerImmersive(true);
    prepareHostForBrowserFullscreen(host);
    // 关键：全屏状态落地后强制把 video 画出来
    fixFullscreenVideoPaint();
    revealPlayerControls(true);

    if (result.ok && result.real) {
      const status = `已进入浏览器全屏 · ${result.message}`;
      setPlayerStatus(status);
      setPlayerError("");
      art.notice.show = orientationMessage ? `${status} · ${orientationMessage}` : status;
    } else if (result.ok) {
      setPlayerStatus(result.message);
      art.notice.show = result.message;
    } else {
      setPlayerStatus("浏览器全屏受限，已页面内铺满");
      setPlayerError(result.message);
      art.notice.show = orientationMessage ? `铺满兜底 · ${orientationMessage}` : "铺满兜底";
    }
    scheduleFullscreenDiagnosticRefresh();
    return true;
  };

  const togglePlayerFullscreen = async () => {
    markControlAction();
    // 只要处于全屏/沉浸态，点缩小一律完整退出回面板，不要半退出卡在假全屏
    if (playerFullscreenActive || wantFullscreenRef.current || isRealBrowserFullscreen()) {
      await exitPlayerFullscreen();
      return;
    }
    await enterPlayerFullscreen();
  };

  const recenterFullscreenPlayer = async () => {
    const host = fullscreenHostElement();
    const shell = playerShellRef.current;
    if (!shell) return;
    host?.classList.add(playerFullscreenHostClass);
    shell.style.left = "0";
    shell.style.top = "0";
    shell.style.right = "0";
    shell.style.bottom = "0";
    shell.style.margin = "0";
    shell.style.transform = "none";
    const video = videoRef.current;
    if (video) {
      // 手动重接管视频层定位，处理部分内核在全屏后追加内联样式造成的偏移。
      video.style.position = "absolute";
      video.style.left = "0";
      video.style.top = "0";
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.margin = "0";
      video.style.transform = "none";
      video.style.objectPosition = "var(--txzz-player-video-position-x, 50%) 50%";
    }
    if (!playerFullscreenActive) {
      await enterPlayerFullscreen();
    } else {
      const nextTune = calculateFullscreenTune(videoRef.current, true, playerFillMode);
      setPlayerFullscreenTune(nextTune);
      revealPlayerControls(true);
      artRef.current?.notice && (artRef.current.notice.show = `已重新测量全屏居中 · ${nextTune.label}`);
      scheduleFullscreenDiagnosticRefresh();
    }
  };

  // 全屏后根据片源尺寸反复请求横屏（元数据晚到时补锁）
  useEffect(() => {
    if (!playerFullscreenActive || !wantFullscreenRef.current) return undefined;
    if (playerOrientationMode === "portrait") return undefined;
    if (playerVideoPortrait) return undefined;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      const message = await requestScreenOrientation(playerOrientationMode, playerVideoLandscape, {
        preferLandscapeFallback: true
      });
      if (!cancelled && artRef.current && message.includes("已请求")) {
        artRef.current.notice.show = message;
      }
    };
    run();
    const t1 = window.setTimeout(run, 280);
    const t2 = window.setTimeout(run, 900);
    const t3 = window.setTimeout(run, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [
    playerFullscreenActive,
    playerVideoLandscape,
    playerVideoPortrait,
    playerVideoSize.width,
    playerVideoSize.height,
    playerOrientationMode,
    browserFullscreenActive
  ]);

  const seekPlayer = (seconds: number) => {
    const art = artRef.current;
    if (!art) return;
    if (seconds < 0) art.backward = Math.abs(seconds);
    else art.forward = seconds;
    const label = seconds < 0 ? `后退 ${Math.abs(seconds)} 秒` : `前进 ${seconds} 秒`;
    art.notice.show = label;
    showPlayerGestureHud({
      kind: seconds < 0 ? "seek-back" : "seek-forward",
      text: label,
      percent: percent(art.currentTime || 0, art.duration || 0),
      zone: seconds < 0 ? "left" : "right"
    }, 780);
    setPlayerStats(playerSnapshot(art.video));
  };

  const seekPlayerTo = (time: number) => {
    const art = artRef.current;
    if (!art) return;
    const total = Number.isFinite(art.duration) ? art.duration : 0;
    const next = Math.max(0, total ? Math.min(total, time) : time);
    art.currentTime = next;
    art.notice.show = `跳转到 ${formatDuration(next)}`;
    setPlayerStats(playerSnapshot(art.video));
    setProgressPreviewTime(null);
  };

  const markControlAction = () => {
    controlActionStampRef.current = Date.now();
  };

  const togglePlayerPlay = async () => {
    const art = artRef.current;
    markControlAction();
    // 普通播放绝不进入全屏；顺手清掉误挂的宿主全屏模式，恢复面板可见。
    if (!wantFullscreenRef.current) {
      setPlayerImmersive(false);
      setBrowserFullscreenActive(false);
      fullscreenHostElement()?.classList.remove(playerFullscreenHostClass);
    }
    if (!art) {
      setPlayerError("播放器尚未就绪，请等待链接加载完成后再点播放");
      setPlayerStatus("播放器未就绪");
      return;
    }
    try {
      if (art.playing) await art.pause();
      else await art.play();
      setPlayerStats(playerSnapshot(art.video));
      setPlayerError("");
      setPlayerStatus(art.playing ? "播放中" : "已暂停");
      revealPlayerControls(true);
    } catch (err) {
      setPlayerError(err instanceof Error ? err.message : String(err));
      setPlayerStatus("播放失败");
      revealPlayerControls(true);
    }
  };

  const cyclePlayerQuality = () => {
    const art = artRef.current as (Artplayer & { hls?: Hls }) | null;
    const hls = art?.hls;
    if (!hls || !playerQualities.length) {
      artRef.current?.notice && (artRef.current.notice.show = "当前线路没有可切换清晰度");
      return;
    }
    const order = [-1, ...playerQualities.map((item) => item.level)];
    const index = order.indexOf(playerQualityLevel);
    const nextLevel = order[(index + 1 + order.length) % order.length];
    hls.currentLevel = nextLevel;
    setPlayerQualityLevel(nextLevel);
    const label = nextLevel < 0 ? "自动清晰度" : playerQualities.find((item) => item.level === nextLevel)?.label || `档位 ${nextLevel + 1}`;
    art.notice.show = `清晰度：${label}`;
  };

  const applyPlayerRate = (nextRate: number) => {
    const art = artRef.current;
    if (!art) return;
    art.playbackRate = nextRate;
    art.notice.show = `倍速：${nextRate}x`;
    setPlayerStats(playerSnapshot(art.video));
    showPlayerGestureHud({ kind: "rate", text: `${nextRate}x`, percent: Math.round((nextRate / 2) * 100) }, 800);
    setPlayerRateOpen(false);
    revealPlayerControls(true);
  };

  const applyPlayerQuality = (level: number) => {
    const art = artRef.current as (Artplayer & { hls?: Hls }) | null;
    const hls = art?.hls;
    if (!hls) {
      artRef.current?.notice && (artRef.current.notice.show = "当前线路没有可切换清晰度");
      return;
    }
    hls.currentLevel = level;
    setPlayerQualityLevel(level);
    const label = level < 0 ? "自动清晰度" : playerQualities.find((item) => item.level === level)?.label || `档位 ${level + 1}`;
    if (art) art.notice.show = `清晰度：${label}`;
    revealPlayerControls(true);
  };

  const cyclePlayerRate = () => {
    const art = artRef.current;
    if (!art) return;
    const index = playerRateOptions.findIndex((rate) => rate === art.playbackRate);
    const nextRate = playerRateOptions[(index + 1 + playerRateOptions.length) % playerRateOptions.length];
    applyPlayerRate(nextRate);
  };

  const cyclePlayerFit = () => {
    const order: PlayerFitMode[] = ["auto", "wide", "vertical"];
    const next = order[(order.indexOf(playerFitMode) + 1) % order.length];
    setPlayerFitMode(next);
    const label = fitModeLabel(next, detectedFitMode);
    const art = artRef.current;
    if (art) {
      art.aspectRatio = "default";
      art.notice.show = `画面比例：${label}`;
    }
    revealPlayerControls(true);
  };

  const cyclePlayerFill = () => {
    const order: PlayerFillMode[] = ["contain", "cover", "fill"];
    const next = order[(order.indexOf(playerFillMode) + 1) % order.length];
    setPlayerFillMode(next);
    applyAdaptiveVideoLayout(videoRef.current, next);
    window.localStorage.setItem(playerFillStorageKey, next);
    const art = artRef.current;
    if (art) art.notice.show = `填充：${fillModeLabel(next)}`;
    revealPlayerControls(true);
  };

  const cyclePlayerOrientation = () => {
    const order: PlayerOrientationMode[] = ["auto", "landscape", "portrait"];
    const next = order[(order.indexOf(playerOrientationMode) + 1) % order.length];
    setPlayerOrientationMode(next);
    window.localStorage.setItem(playerOrientationStorageKey, next);
    const label = orientationModeLabel(next, Boolean(wantedScreenOrientation(next, playerVideoLandscape)));
    const art = artRef.current;
    if (playerFullscreenActive) {
      requestScreenOrientation(next, playerVideoLandscape).then((message) => {
        if (artRef.current) artRef.current.notice.show = `方向：${label} · ${message}`;
      });
    } else if (art) {
      art.notice.show = `方向：${label}`;
    }
    revealPlayerControls(true);
  };

  const togglePlayerPip = () => {
    const art = artRef.current;
    if (!art) return;
    try {
      art.pip = !art.pip;
      revealPlayerControls(true);
    } catch {
      setPlayerError("当前页面暂不支持画中画，可继续使用完整播放器或打开完整链接。");
      revealPlayerControls(true);
    }
  };

  const capturePlayerScreenshot = async () => {
    const art = artRef.current;
    if (!art) return;
    try {
      await art.screenshot(`${previewTitle || "糖心志者截图"}.png`);
      art.notice.show = "截图已生成";
    } catch (err) {
      setPlayerError(`截图失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      revealPlayerControls(true);
    }
  };

  const switchPlayerBackup = () => {
    const backupUrl = absoluteUrl(lines[1]?.url || "");
    if (!backupUrl || activePreviewKey === "backup") return;
    setPreviewRecord(null);
    setPreviewKey("backup");
    setPlayerMoreOpen(false);
    revealPlayerControls(true);
  };

  const recordRows = records.map((item, index) => {
    // 播放记录筛选全部使用本地已有状态，避免为了筛选再次请求播放接口。
    const recordUrl = absoluteUrl(item.playLink || item.backupLink || "");
    const recordTask = downloadTaskForMovie(state, item.movieId);
    const recordCanSave = recordTask ? canSaveDownload(recordTask) : false;
    const recordRunning = recordTask ? isRunningDownloadTask(recordTask) : false;
    const recordFailed = recordTask?.stage === "error" || Boolean(item.fullStat?.error || item.backupStat?.error);
    const recordCanDownload = Boolean(item.movieId) && !recordTask;
    const searchText = [
      item.movieTitle,
      item.title,
      item.movieId,
      item.accountLabel,
      item.accountUser,
      item.playLink,
      item.backupLink,
      recordTask ? downloadTitle(recordTask) : ""
    ].filter(Boolean).join(" ").toLowerCase();
    return {
      item,
      index,
      recordUrl,
      recordTask,
      recordCanSave,
      recordRunning,
      recordFailed,
      recordCanDownload,
      searchText
    };
  });
  const recordStats = {
    total: recordRows.length,
    downloadable: recordRows.filter((row) => row.recordCanDownload).length,
    saveable: recordRows.filter((row) => row.recordCanSave).length,
    failed: recordRows.filter((row) => row.recordFailed).length,
    backup: recordRows.filter((row) => Boolean(row.item.backupLink)).length
  };
  const recordFilterItems: { key: PlaybackRecordFilter; label: string; value: number; color: string }[] = [
    { key: "all", label: "全部", value: recordStats.total, color: "text-purple-600" },
    { key: "downloadable", label: "可下载", value: recordStats.downloadable, color: "text-pink-600" },
    { key: "saveable", label: "可保存", value: recordStats.saveable, color: "text-emerald-600" },
    { key: "failed", label: "失败", value: recordStats.failed, color: "text-rose-600" },
    { key: "backup", label: "有备用", value: recordStats.backup, color: "text-sky-600" }
  ];
  const recordSortItems: { key: PlaybackRecordSort; label: string; tip: string }[] = [
    { key: "recent", label: "最近", tip: "按获取时间倒序" },
    { key: "failed", label: "异常", tip: "异常或下载失败记录优先" },
    { key: "saveable", label: "可保存", tip: "可保存到设备的记录优先" },
    { key: "backup", label: "备用", tip: "含备用线路的记录优先" }
  ];
  const recordKeyword = recordSearch.trim().toLowerCase();
  const searchedRecordRows = recordRows.filter((row) => {
    if (recordFilter === "downloadable" && !row.recordCanDownload) return false;
    if (recordFilter === "saveable" && !row.recordCanSave) return false;
    if (recordFilter === "failed" && !row.recordFailed) return false;
    if (recordFilter === "backup" && !row.item.backupLink) return false;
    return !recordKeyword || row.searchText.includes(recordKeyword);
  });
  const recordTime = (item: FullDetail) => Date.parse(String((item as { ts?: string }).ts || item.fetchedAt || "")) || 0;
  const filteredRecordRows = [...searchedRecordRows].sort((a, b) => {
    // 排序只改变播放记录展示和批量报告顺序，不改变当前搜索、筛选集合。
    if (recordSort === "failed") {
      const diff = Number(b.recordFailed) - Number(a.recordFailed);
      if (diff) return diff;
    }
    if (recordSort === "saveable") {
      const diff = Number(b.recordCanSave) - Number(a.recordCanSave);
      if (diff) return diff;
    }
    if (recordSort === "backup") {
      const diff = Number(Boolean(b.item.backupLink)) - Number(Boolean(a.item.backupLink));
      if (diff) return diff;
    }
    return recordTime(b.item) - recordTime(a.item);
  });
  const recordFilterLabel = recordFilterItems.find((item) => item.key === recordFilter)?.label || "当前筛选";
  const batchRecordReport = playbackRecordsReport(filteredRecordRows, recordFilterLabel);

  const panelTabs: { key: PlaybackPanelTab; label: string; icon: typeof ShieldCheck; badge?: string }[] = [
    { key: "resource", label: "资源", icon: ShieldCheck, badge: readyCount ? `${readyCount}线` : undefined },
    { key: "download", label: "下载", icon: Download, badge: currentTask ? currentTaskTone.label : undefined },
    { key: "records", label: "记录", icon: Film, badge: recordStats.total ? `${recordStats.total}` : undefined }
  ];

  // 信息头按钮：内联底色，避免 Shadow DOM 下 Tailwind 半透明白底失效。
  const heroActionStyle = {
    background: "rgba(255,255,255,0.24)",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.28)",
    boxShadow: "0 4px 12px rgba(88, 28, 135, 0.18)"
  } as CSSProperties;
  const heroPrimaryStyle = {
    background: "#ffffff",
    color: "#7c3aed",
    border: "1px solid #ffffff",
    boxShadow: "0 4px 12px rgba(88, 28, 135, 0.18)"
  } as CSSProperties;

  return (
    <div className="txzz-playback-root txzz-page space-y-3 p-3 sm:p-3.5" style={playerStageStyle}>
      {/* 紧凑信息头：标题 + 关键状态 + 主操作，把视觉重心留给播放器 */}
      <div
        className="txzz-playback-hidden-during-fullscreen txzz-playback-hero relative overflow-hidden rounded-2xl p-3.5 text-white"
        style={{
          background: "linear-gradient(145deg, #7c3aed 0%, #c026d3 46%, #ec4899 100%)",
          boxShadow: "0 12px 32px rgba(168, 85, 247, 0.28)",
          color: "#ffffff"
        }}
      >
        <div className="pointer-events-none absolute -right-3 -top-4 select-none text-5xl opacity-[0.12]">🎬</div>
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.72)" }}>当前视频</p>
            <h3 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug" style={{ color: "#ffffff" }}>
              {latest?.movieTitle || latest?.title || latest?.movieId || "等待播放详情"}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: "rgba(255,255,255,0.88)" }}>
              {latest ? <CheckCircle size={11} className="shrink-0" color="#a7f3d0" /> : <AlertCircle size={11} className="shrink-0" color="#fde68a" />}
              <span className="truncate">
                {latest
                  ? `${readyCount} 条线路 · ${segmentTotal || "?"} 分片${duration ? ` · ${formatDuration(duration)}` : ""} · 体检 ${health.score}`
                  : "打开网站视频详情页后自动获取播放资源"}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.22)", color: "#ffffff" }}
            >
              {health.label}
            </span>
            {fetchedAt && <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.68)" }}>{shortTime(fetchedAt)}</span>}
          </div>
        </div>
        <div className="relative mt-2.5 flex flex-wrap gap-1">
          {["M3U8", latest?.accountLabel || latest?.accountUser || "自动账号", localizeFlowText(latest?.action || "full_detail")].map((text) => (
            <span
              key={text}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(0,0,0,0.18)", color: "#ffffff" }}
            >
              {text}
            </span>
          ))}
          {preferredLineUrl && (
            <span
              className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium"
              style={{ background: "rgba(0,0,0,0.18)", color: "#ffffff" }}
            >
              <Link size={9} color="#ffffff" />
              <span className="truncate">{preferredLine?.label} · {maskUrl(preferredLineUrl)}</span>
            </span>
          )}
        </div>
        <div className="relative mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => onAction("refresh-full-detail", { movieId: latest?.movieId || "" })}
            className="txzz-playback-hero-btn flex min-h-8 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition active:scale-95"
            style={heroActionStyle}
          >
            <RefreshCw size={12} color="#ffffff" /> 刷新
          </button>
          <button
            type="button"
            onClick={() => {
              setPanelTab("download");
            }}
            className="txzz-playback-hero-btn flex min-h-8 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition active:scale-95"
            style={heroActionStyle}
          >
            <Download size={12} color="#ffffff" /> 下载
          </button>
          <button
            type="button"
            disabled={!preferredLine?.url}
            onClick={() => preferredLine && onAction(preferredLine.copyAction, { url: preferredLineUrl, label: `${preferredLine.label}完整链接` })}
            className="txzz-playback-hero-btn flex min-h-8 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition active:scale-95 disabled:opacity-40"
            style={heroActionStyle}
          >
            <Copy size={12} color="#ffffff" /> 复制
          </button>
          <button
            type="button"
            disabled={!preferredLine?.url}
            onClick={() => preferredLine && onAction(preferredLine.openAction, { url: preferredLineUrl, label: `${preferredLine.label}完整链接` })}
            className="txzz-playback-hero-btn flex min-h-8 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold transition active:scale-95 disabled:opacity-40"
            style={heroPrimaryStyle}
          >
            <ExternalLink size={12} color="#7c3aed" /> 打开
          </button>
        </div>
      </div>

      {/* 播放器主卡片：保留内核/手势/控制栏，仅优化外壳 */}
      <div className="txzz-player-card space-y-2.5 overflow-hidden rounded-2xl border border-sky-100/90 bg-white/95 p-2.5 shadow-[0_8px_28px_rgba(14,165,233,0.08)] sm:p-3">
        <div className="txzz-player-card-title flex items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-purple-800">
              <Film size={14} className="text-sky-400" /> 完整播放器
            </h3>
            <p className="mt-0.5 truncate text-[10px] text-purple-400">{previewTitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Pill className={previewUrl ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}>
              {previewUrl ? playerStatus : "无链接"}
            </Pill>
          </div>
        </div>
        <div
          ref={playerShellRef}
          className={`txzz-player-shell txzz-candy-interactive select-none ${playerCursorHidden ? "cursor-none" : ""} ${playerFullscreenActive ? "txzz-player-fullscreen-shell txzz-fullscreen-active fixed inset-0 z-[2147483647] overflow-hidden rounded-none bg-black" : "relative overflow-hidden rounded-2xl bg-black shadow-inner ring-1 ring-black/20"} ${cssForceLandscape ? "txzz-player-css-landscape" : ""}`}
          style={
            playerFullscreenActive
              // 全屏时不要注入可能为 0 的 viewport 像素变量，避免 video 被压成 0×0
              ? ({ background: "#000" } as CSSProperties)
              : playerShellAspect
                ? { ...playerStageStyle, aspectRatio: playerShellAspect }
                : playerStageStyle
          }
          data-css-landscape={cssForceLandscape ? "1" : "0"}
        >
          <div
            className="txzz-player-orientation-stage"
            data-orientation-mode={playerOrientationMode}
            data-video-orientation={playerVideoLandscape ? "landscape" : playerVideoPortrait ? "portrait" : "unknown"}
            style={playerFullscreenActive ? ({ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent" } as CSSProperties) : playerStageStyle}
          >
          <div
            key={`${activePreviewKey}-${playerReloadKey}`}
            ref={playerContainerRef}
            className={`txzz-player-clean txzz-player-fill-${playerFillMode === "cover" || playerFillMode === "fill" ? playerFillMode : "contain"} ${playerFullscreenActive ? "txzz-player-fullscreen-clean" : "h-full"} txzz-player-card-body w-full ${playerFullscreenActive ? "" : "bg-black"} [&_.art-fullscreen-web]:z-[1] [&_.art-video-player]:h-full [&_.art-video-player]:w-full`}
            style={
              playerFullscreenActive
                ? ({ position: "absolute", inset: 0, width: "100%", height: "100%", minHeight: 0, background: "transparent" } as CSSProperties)
                : ({ background: "#000" } as CSSProperties)
            }
          />
          {/* 亮度遮罩：替代 video 上的 CSS filter，避免 Android 黑屏只剩声音；100% 时 display:none 少造合成层 */}
          <div
            className="txzz-player-brightness-mask"
            data-mode={playerBrightness > 100 ? "boost" : "dim"}
            style={{
              display: playerBrightness === 100 ? "none" : "block",
              opacity: playerBrightness === 100
                ? 0
                : playerBrightness < 100
                  ? Math.min(0.75, (100 - playerBrightness) / 100)
                  : Math.min(0.55, (playerBrightness - 100) / 80)
            }}
            aria-hidden
          />
          {/* 专业手势层：单击显隐、三区双击、长按倍速/快退、横滑进度、左右竖滑音量亮度、滚轮音量。 */}
          <PlayerGestureSurface
            enabled={Boolean(previewUrl)}
            locked={playerUiLocked}
            controlsVisible={playerControlsVisible}
            seekStep={playerSeekStep}
            volume={playerVolume}
            muted={playerMuted}
            brightness={playerBrightness}
            currentTime={playerStats.currentTime}
            duration={playerStats.duration}
            playing={!playerStats.paused}
            holdRate={3}
            onShowHud={(hud, durationMs) => {
              // 主控按钮刚点完的短窗口，忽略手势 HUD 误触发（由 surface 内部 click 仍可能竞争）。
              if (Date.now() - controlActionStampRef.current < 280 && (hud.kind === "play" || hud.kind === "pause")) return;
              showPlayerGestureHud(hud, durationMs);
            }}
            onToggleControls={(show) => {
              if (Date.now() - controlActionStampRef.current < 280) return;
              if (show) revealPlayerControlsBySurfaceClick();
              else hidePlayerControlsBySurfaceClick();
            }}
            onTogglePlay={() => {
              togglePlayerPlay();
            }}
            onSeekBy={seekPlayer}
            onSeekTo={seekPlayerTo}
            onVolume={(volume, muted) => applyPlayerVolume(volume, muted ?? volume <= 0.001)}
            onBrightness={applyPlayerBrightness}
            onHoldRateStart={(rate) => {
              const art = artRef.current;
              if (!art) return;
              holdRateRef.current = { active: true, prevRate: art.playbackRate || 1 };
              art.playbackRate = rate;
              setPlayerStats(playerSnapshot(art.video));
              setHoldSeekHint(`${rate}x 倍速快进中 · 松开恢复`);
            }}
            onHoldRateEnd={endHoldRateBoost}
            onLockHint={() => setPlayerStatus("控制层已锁定，点击右下角解锁")}
          />
          <PlayerGestureHudOverlay hud={playerGestureHud} holdHint={holdSeekHint} />
          <PlayerOverlays
            holdSeekHint=""
            gestureHud={{ kind: "", text: "" }}
            buffering={playerBuffering}
            hasUrl={Boolean(previewUrl)}
            error={playerError}
            paused={playerStats.paused}
            locked={playerUiLocked}
            fullscreen={playerFullscreenActive}
            onPlay={() => {
              togglePlayerPlay();
              revealPlayerControls();
            }}
            onReload={() => {
              setPlayerReloadKey((value) => value + 1);
              revealPlayerControls(true);
            }}
            onSwitchBackup={switchPlayerBackup}
            canSwitchBackup={Boolean(backupLineUrl) && activePreviewKey !== "backup"}
            onUnlock={() => setPlayerControlsLock(false)}
          />
          <PlayerTopBar
            visible={playerControlsVisible}
            locked={playerUiLocked}
            fullscreen={playerFullscreenActive}
            title={previewTitle}
            status={playerStatus}
            hasUrl={Boolean(previewUrl)}
            fillLabel={fillModeLabel(playerFillMode)}
            metaVisible={playerFullscreenMetaVisible}
            diagnosticLabel={fullscreenDiagnosticLabel}
            diagnosticOk={playerFullscreenDiagnostic.ok}
            resumeTip={playerResumeTip}
            error={playerError}
            onBack={() => togglePlayerFullscreen().catch((err) => setPlayerError(err instanceof Error ? err.message : String(err)))}
          />
          <PlayerControlBar
            visible={playerControlsVisible}
            locked={playerUiLocked}
            disabled={!previewUrl}
            fullscreen={playerFullscreenActive}
            compact={isCompactLandscape}
            controlsTone={playerControlsTone}
            iconSize={playerControlIconSize}
            buttonSize={playerControlButtonSize}
            paused={playerStats.paused}
            currentTime={playerStats.currentTime}
            duration={playerStats.duration}
            bufferedPercent={previewBuffered}
            progressPercent={previewProgress}
            progressPreviewTime={progressPreviewTime}
            isDraggingProgress={isDraggingProgress}
            volume={playerVolume}
            muted={playerMuted}
            rate={playerStats.rate}
            seekStep={playerSeekStep}
            qualityLabel={currentQualityLabel}
            fillLabel={fillModeLabel(playerFillMode)}
            fitLabel={playerFitLabel}
            orientationLabel={playerOrientationLabel}
            brightness={playerBrightness}
            moreOpen={playerMoreOpen}
            morePanel={playerMorePanel}
            volumeOpen={playerVolumeOpen}
            rateOpen={playerRateOpen}
            previewOptions={previewOptions}
            activePreviewKey={activePreviewKey}
            previewSourceLabel={previewSourceLabel}
            playerStatus={playerStatus}
            currentLineLabel={previewLineLabel(activePreviewKey)}
            fullscreenDiagnosticLabel={fullscreenDiagnosticLabel}
            rateOptions={playerRateOptions}
            seekStepOptions={playerSeekStepOptions}
            qualities={playerQualities}
            qualityLevel={playerQualityLevel}
            canBackup={Boolean(backupLineUrl)}
            isBackupActive={activePreviewKey === "backup"}
            hasMovieId={Boolean(latest?.movieId)}
            fitMode={playerFitMode}
            fillMode={playerFillMode}
            orientationMode={playerOrientationMode}
            orientationRequested={playerOrientationRequested}
            onSeekStart={(ratio, event) => {
              if (!artRef.current || !playerStats.duration) return;
              progressDragRef.current = { active: true, startX: event.clientX, startTime: playerStats.currentTime };
              setIsDraggingProgress(true);
              setProgressPreviewTime(ratio * playerStats.duration);
              revealPlayerControls(true);
            }}
            onSeekMove={(ratio) => {
              if (!progressDragRef.current.active || !playerStats.duration) return;
              setProgressPreviewTime(ratio * playerStats.duration);
            }}
            onSeekEnd={(ratio) => {
              if (!progressDragRef.current.active) return;
              progressDragRef.current.active = false;
              setIsDraggingProgress(false);
              if (artRef.current && playerStats.duration) {
                const nextTime = ratio * playerStats.duration;
                artRef.current.currentTime = nextTime;
                artRef.current.notice.show = `跳转到 ${formatDuration(nextTime)}`;
                setPlayerStats(playerSnapshot(artRef.current.video));
              }
              setProgressPreviewTime(null);
              revealPlayerControls();
            }}
            onSeekCancel={() => {
              progressDragRef.current.active = false;
              setIsDraggingProgress(false);
              setProgressPreviewTime(null);
            }}
            onTogglePlay={() => {
              togglePlayerPlay();
              revealPlayerControls();
            }}
            onSeekBack={() => {
              seekPlayer(-playerSeekStep);
              revealPlayerControls();
            }}
            onSeekForward={() => {
              seekPlayer(playerSeekStep);
              revealPlayerControls();
            }}
            onToggleMore={() => {
              setPlayerVolumeOpen(false);
              setPlayerRateOpen(false);
              setPlayerMoreOpen((value) => !value);
              revealPlayerControls(true);
            }}
            onToggleLock={() => setPlayerControlsLock(true)}
            onToggleFullscreen={() => togglePlayerFullscreen().catch((err) => setPlayerError(err instanceof Error ? err.message : String(err)))}
            onToggleMute={() => applyPlayerVolume(playerVolume || 0.8, !playerMuted)}
            onVolumeChange={(volume) => applyPlayerVolume(volume, volume <= 0.001)}
            onToggleVolumePanel={() => {
              setPlayerMoreOpen(false);
              setPlayerRateOpen(false);
              setPlayerVolumeOpen((value) => !value);
              revealPlayerControls(true);
            }}
            onToggleRatePanel={() => {
              setPlayerMoreOpen(false);
              setPlayerVolumeOpen(false);
              setPlayerRateOpen((value) => !value);
              revealPlayerControls(true);
            }}
            onSetRate={applyPlayerRate}
            onSetSeekStep={(step) => {
              setPlayerSeekStep(step);
              artRef.current?.notice && (artRef.current.notice.show = `快进步长：${step} 秒`);
              revealPlayerControls(true);
            }}
            onSetMorePanel={setPlayerMorePanel}
            onSelectPreview={(key) => {
              setPreviewRecord(null);
              setPreviewKey(key as PlaybackPreviewKey);
              setPlayerMoreOpen(false);
              revealPlayerControls(true);
            }}
            onCycleQuality={cyclePlayerQuality}
            onSetQuality={applyPlayerQuality}
            onCycleFit={cyclePlayerFit}
            onCycleFill={cyclePlayerFill}
            onCycleOrientation={cyclePlayerOrientation}
            onSwitchBackup={switchPlayerBackup}
            onScreenshot={() => { capturePlayerScreenshot(); }}
            onReload={() => {
              setPlayerReloadKey((value) => value + 1);
              setPlayerMoreOpen(false);
              revealPlayerControls(true);
            }}
            onPip={togglePlayerPip}
            onRecenter={() => recenterFullscreenPlayer().catch((err) => setPlayerError(err instanceof Error ? err.message : String(err)))}
            onCopyLink={() => onAction("copy-play-link", { url: previewUrl, label: `${previewLineLabel(activePreviewKey)}完整链接` })}
            onOpenLink={() => onAction("open-playback-url", { url: previewUrl, label: `${previewLineLabel(activePreviewKey)}完整链接` })}
            onDownload={() => onAction("download-full-video", { movieId: latest?.movieId || "" })}
            onCopyDiagnostic={() => onAction("copy-playback-health-report", { report: playerDiagnosticReportRef.current })}
            onBrightnessChange={applyPlayerBrightness}
          />
          </div>
        </div>
        <div className="txzz-player-card-actions grid grid-cols-3 gap-1.5">
          <SoftButton
            size="sm"
            variant="secondary"
            icon={Activity}
            disabled={!previewUrl}
            className="w-full"
            title="复制网页播放器诊断报告"
            onClick={() => onAction("copy-playback-health-report", { report: playerDiagnosticReportRef.current })}
          >
            诊断
          </SoftButton>
          <SoftButton
            size="sm"
            variant="secondary"
            icon={Copy}
            disabled={!previewUrl}
            className="w-full"
            title="复制当前预览完整链接"
            onClick={() => onAction("copy-play-link", { url: previewUrl, label: `${previewLineLabel(activePreviewKey)}完整链接` })}
          >
            复制
          </SoftButton>
          <SoftButton
            size="sm"
            variant="sky"
            icon={ExternalLink}
            disabled={!previewUrl}
            className="w-full"
            title="用完整链接在新窗口打开当前预览"
            onClick={() => onAction("open-playback-url", { url: previewUrl, label: `${previewLineLabel(activePreviewKey)}完整链接` })}
          >
            打开
          </SoftButton>
        </div>
      </div>

      {/* 次级信息分段：资源 / 下载 / 记录 */}
      <div className="txzz-playback-hidden-during-fullscreen space-y-2.5">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-pink-100 bg-white p-1 shadow-sm">
          {panelTabs.map((tab) => {
            const active = panelTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPanelTab(tab.key)}
                className={`relative flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm"
                    : "text-purple-400 hover:bg-purple-50"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Icon size={13} />
                  {tab.label}
                </span>
                {tab.badge && (
                  <span className={`text-[9px] ${active ? "text-white/85" : "text-purple-300"}`}>{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {panelTab === "resource" && (
          <SectionCard
            title="播放资源"
            icon={ShieldCheck}
            hint={playbackTip(latest)}
            action={
              <Pill className={readyCount ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}>
                {readyCount ? `${readyCount} 条可用` : "待获取"}
              </Pill>
            }
          >
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-xl px-2.5 py-2 ${health.bg}`}>
                  <p className={`flex items-center gap-1 text-[10px] font-semibold ${health.tone}`}><Gauge size={11} /> 体检</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${health.tone}`}>{health.score}</p>
                  <p className="text-[9px] text-purple-400">{health.label}</p>
                </div>
                <div className="rounded-xl bg-sky-50 px-2.5 py-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-sky-600"><Signal size={11} /> 推荐</p>
                  <p className="mt-1 truncate text-sm font-bold text-sky-600">{health.recommendedLabel}</p>
                  <p className="text-[9px] text-purple-400">{readyCount ? `${readyCount} 条线路` : "等待"}</p>
                </div>
                <div className="rounded-xl bg-purple-50 px-2.5 py-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-purple-600"><Layers size={11} /> 分片</p>
                  <p className="mt-1 text-lg font-bold text-purple-700 tabular-nums">{segmentTotal || "—"}</p>
                  <p className="text-[9px] text-purple-400">{duration ? formatDuration(duration) : "时长未知"}</p>
                </div>
              </div>

              {(health.risks || []).length > 0 && (
                <div className="space-y-1 rounded-xl bg-purple-50/80 px-2.5 py-2">
                  {health.risks.slice(0, 3).map((item) => (
                    <p key={item} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-purple-500">
                      <Activity size={10} className="mt-0.5 shrink-0 text-purple-300" />
                      <span>{item}</span>
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {lines.map((line) => {
                  const stateInfo = lineState(line);
                  const lineUrl = absoluteUrl(line.url || "");
                  return (
                    <div key={line.key} className={`rounded-2xl ${stateInfo.bg} p-2.5`}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className={`flex items-center gap-1 text-[11px] font-semibold ${stateInfo.color}`}>
                          <Route size={12} /> {line.label}
                        </p>
                        <span className={`text-[10px] font-medium ${stateInfo.color}`}>
                          {stateInfo.label}
                          {Number.isFinite(stateInfo.score) && stateInfo.score > -500 ? ` · ${Math.round(stateInfo.score)}分` : ""}
                        </span>
                      </div>
                      <p className="truncate font-mono text-[10px] text-purple-500">{lineUrl ? maskUrl(lineUrl) : "暂无链接"}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[9px]">
                        <Pill className="bg-white/80 text-purple-500">{line.stat?.segments ? `${line.stat.segments} 分片` : "分片?"}</Pill>
                        <Pill className="bg-white/80 text-purple-500">{line.stat?.duration ? formatDuration(line.stat.duration) : "时长?"}</Pill>
                        {line.stat?.latencyMs ? <Pill className="bg-white/80 text-sky-600">{line.stat.latencyMs}ms</Pill> : null}
                        {line.stat?.status ? <Pill className="bg-white/80 text-purple-500">HTTP {line.stat.status}</Pill> : null}
                        {preferredLine?.key === line.key ? <Pill className="bg-emerald-100 text-emerald-600">推荐</Pill> : null}
                      </div>
                      {line.stat?.error && <p className="mt-1.5 line-clamp-2 text-[10px] text-amber-600">{line.stat.error}</p>}
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <SoftButton size="xs" variant="secondary" icon={Copy} disabled={!line.url} className="w-full" onClick={() => onAction(line.copyAction, { url: lineUrl, label: `${line.label}完整链接` })}>
                          复制
                        </SoftButton>
                        <SoftButton size="xs" variant="sky" icon={ExternalLink} disabled={!line.url} className="w-full" onClick={() => onAction(line.openAction, { url: lineUrl, label: `${line.label}完整链接` })}>
                          打开
                        </SoftButton>
                      </div>
                    </div>
                  );
                })}
              </div>

              <SoftButton
                size="sm"
                variant="secondary"
                icon={Copy}
                className="w-full"
                onClick={() => onAction("copy-playback-health-report", { report: healthReport })}
              >
                复制体检报告
              </SoftButton>
            </div>
          </SectionCard>
        )}

        {panelTab === "download" && (
          <SectionCard
            title="当前视频下载"
            icon={Download}
            hint={currentTask ? downloadTitle(currentTask) : latest ? "选择线路后创建下载，可看体积进度与速度" : "等待播放详情后可下载"}
            action={<Pill className={currentTaskTone.color}>{currentTaskTone.label}</Pill>}
            tone="amber"
          >
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-purple-600">下载线路</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { key: "auto" as const, label: "自动优选", tip: preferredLine?.label ? `当前推荐 ${preferredLine.label}` : "按探测分选择" },
                    { key: "play" as const, label: "主线路", tip: lines[0]?.url ? `分 ${Math.round(lineScore(lines[0]))}` : "无链接" },
                    { key: "backup" as const, label: "备用线路", tip: lines[1]?.url ? `分 ${Math.round(lineScore(lines[1]))}` : "无链接" }
                  ]).map((item) => {
                    const active = downloadLineKey === item.key;
                    const disabled = item.key === "play" ? !lines[0]?.url : item.key === "backup" ? !lines[1]?.url : !latest?.movieId;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDownloadLineKey(item.key)}
                        className={`rounded-xl px-2 py-2 text-center transition disabled:opacity-40 ${
                          active
                            ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                        }`}
                      >
                        <p className="text-[11px] font-bold">{item.label}</p>
                        <p className={`mt-0.5 text-[9px] ${active ? "text-white/85" : "text-amber-500"}`}>{item.tip}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {currentTask ? (
                <div className="space-y-2 rounded-2xl bg-amber-50/70 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Pill className="bg-white text-purple-500">{downloadFormat(currentTask)}</Pill>
                    <Pill className="bg-white text-pink-500">{downloadLineLabel(currentTask.lineKey)}</Pill>
                    <Pill className="bg-white text-sky-500">
                      {currentTask.totalBytes
                        ? `${formatBytes(currentTask.bytes)} / ${formatBytes(currentTask.totalBytes)}`
                        : formatBytes(currentTask.bytes)}
                    </Pill>
                    {downloadSpeedText(currentTask) && (
                      <Pill className="bg-white text-emerald-600">{downloadSpeedText(currentTask)}</Pill>
                    )}
                    <Pill className="bg-white text-slate-400">{shortTime(currentTask.updatedAt)}</Pill>
                  </div>
                  {currentTaskUrl && (
                    <div className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5">
                      <Link size={11} className="shrink-0 text-purple-300" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-purple-500">{maskUrl(currentTaskUrl)}</span>
                    </div>
                  )}
                  {currentTask.stage !== "complete" && (
                    <div>
                      <div className="mb-1 flex justify-between text-[10px] text-purple-400">
                        <span>{downloadStageLabel(currentTask.stage)}</span>
                        <span className="tabular-nums font-semibold text-amber-600">
                          {taskProgress}%
                          {currentTask.total ? ` · ${currentTask.current || 0}/${currentTask.total} 片` : ""}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${taskProgress}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[9px] text-purple-300">
                        <span>
                          {currentTask.totalBytes
                            ? `已下载 ${formatBytes(currentTask.bytes || 0)} / 约 ${formatBytes(currentTask.totalBytes)}`
                            : currentTask.bytes
                              ? `已下载 ${formatBytes(currentTask.bytes)}`
                              : "等待体积统计"}
                        </span>
                        <span>{downloadSpeedText(currentTask) || "—"}</span>
                      </div>
                    </div>
                  )}
                  {(currentTask.error || currentTask.transmuxError) && (
                    <p className="rounded-xl bg-rose-50 p-2 text-[10px] leading-relaxed text-rose-600">
                      {currentTask.error || `MP4转封装失败，TS已保留：${currentTask.transmuxError}`}
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Download}
                  title="还没有下载任务"
                  desc="先选线路，再点创建下载；进度按已下载体积估算百分比并显示速度。"
                />
              )}
              <ActionToolbar>
                <SoftButton
                  size="sm"
                  className="flex-1"
                  icon={currentTask?.stage === "error" ? RefreshCw : currentTask && canSaveDownload(currentTask) ? Save : Download}
                  disabled={
                    currentTask
                      ? currentTask.stage !== "error" && !canSaveDownload(currentTask) && isRunningDownloadTask(currentTask)
                      : !latest?.movieId
                  }
                  onClick={() => {
                    if (currentTask?.stage === "error") {
                      onAction("download-full-video", {
                        movieId: currentTask.movieId || latest?.movieId || "",
                        lineKey: downloadLineKey
                      });
                    } else if (currentTask && canSaveDownload(currentTask)) {
                      onAction("save-download-device", { taskId: currentTask.taskId || "" });
                    } else if (!currentTask || !isRunningDownloadTask(currentTask)) {
                      onAction("download-full-video", {
                        movieId: latest?.movieId || "",
                        lineKey: downloadLineKey,
                        url: downloadLineKey === "play"
                          ? absoluteUrl(lines[0]?.url || "")
                          : downloadLineKey === "backup"
                            ? absoluteUrl(lines[1]?.url || "")
                            : ""
                      });
                    }
                  }}
                >
                  {currentTask?.stage === "error"
                    ? "重试下载"
                    : currentTask && canSaveDownload(currentTask)
                      ? "保存到设备"
                      : currentTask && isRunningDownloadTask(currentTask)
                        ? "下载中…"
                        : "创建下载"}
                </SoftButton>
                {currentTaskUrl && (
                  <SoftButton size="sm" variant="sky" icon={Copy} onClick={() => onAction("copy-download-url", { taskId: currentTask?.taskId || "" })}>
                    复制链接
                  </SoftButton>
                )}
                <SoftButton size="sm" variant="secondary" icon={Layers} onClick={() => onPage?.("downloads")}>
                  下载页
                </SoftButton>
              </ActionToolbar>
            </div>
          </SectionCard>
        )}

        {panelTab === "records" && (
          <SectionCard
            title="播放记录"
            icon={Film}
            hint={`显示 ${filteredRecordRows.length} / ${recordStats.total} 条`}
            action={
              <SoftButton
                size="xs"
                variant="secondary"
                icon={Copy}
                disabled={!filteredRecordRows.length}
                onClick={() => onAction("copy-playback-health-report", { report: batchRecordReport })}
              >
                批量报告
              </SoftButton>
            }
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-xl bg-purple-50/80 px-2.5 py-2 ring-1 ring-purple-100">
                <Search size={13} className="shrink-0 text-purple-300" />
                <SoftInput
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="搜索标题、编号、账号或链接"
                  className="border-0 bg-transparent px-0 py-0 shadow-none ring-0 focus:ring-0"
                />
                {recordSearch && (
                  <SoftButton size="xs" variant="ghost" onClick={() => setRecordSearch("")}>清除</SoftButton>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1">
                {recordFilterItems.map((filterItem) => {
                  const active = recordFilter === filterItem.key;
                  return (
                    <button
                      key={filterItem.key}
                      type="button"
                      onClick={() => setRecordFilter(filterItem.key)}
                      className={`rounded-xl px-0.5 py-1.5 text-center transition ${
                        active ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm" : "bg-purple-50/80 text-purple-400"
                      }`}
                    >
                      <p className={`text-sm font-bold tabular-nums ${active ? "text-white" : filterItem.color}`}>{filterItem.value}</p>
                      <p className="mt-0.5 text-[9px]">{filterItem.label}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {recordSortItems.map((item) => {
                  const active = recordSort === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setRecordSort(item.key)}
                      title={item.tip}
                      className={`flex min-h-8 items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition ${
                        active ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm" : "bg-white text-purple-400 ring-1 ring-purple-100"
                      }`}
                    >
                      <SortDesc size={11} /> {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {filteredRecordRows.length ? filteredRecordRows.map(({ item, index, recordUrl, recordTask, recordCanSave, recordRunning }) => {
                  const recordTaskProgress = recordTask ? downloadProgress(recordTask) : 0;
                  const recordTaskState = taskTone(recordTask);
                  const recordPrimaryAction = recordTask?.stage === "error" ? "重试" : recordCanSave ? "保存" : recordRunning ? "查看" : "下载";
                  const recordReport = playbackRecordReport(item, recordTask);
                  return (
                    <div key={`${item.movieId}-${index}`} className="overflow-hidden rounded-2xl border border-purple-50 bg-gradient-to-b from-white to-purple-50/30 p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-purple-800">{item.movieTitle || item.title || item.movieId || "播放详情"}</p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-purple-400">
                            {recordUrl ? <CheckCircle size={10} className="shrink-0 text-emerald-400" /> : <AlertCircle size={10} className="shrink-0 text-rose-400" />}
                            {recordUrl ? maskUrl(recordUrl) : "缺少播放链接"}
                          </p>
                        </div>
                        <Pill className={recordTaskState.color}>{recordTaskState.label}</Pill>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Pill className="bg-purple-50 text-purple-500"><Wifi size={9} /> M3U8</Pill>
                        <Pill className="bg-sky-50 text-sky-500"><Layers size={9} /> {item.fullStat?.segments || "?"} 分片</Pill>
                        {item.fullStat?.duration ? (
                          <Pill className="bg-violet-50 text-violet-500"><Timer size={9} /> {formatDuration(item.fullStat.duration)}</Pill>
                        ) : null}
                        <Pill className="bg-pink-50 text-pink-500">{item.accountLabel || item.accountUser || "自动账号"}</Pill>
                        <Pill className="bg-slate-50 text-slate-400"><Clock size={9} /> {shortTime(String((item as { ts?: string }).ts || item.fetchedAt || ""))}</Pill>
                      </div>
                      {recordTask && recordTask.stage !== "complete" && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-[10px] text-purple-400">
                            <span>{downloadStageLabel(recordTask.stage)}</span>
                            <span className="tabular-nums">{recordTask.total ? `${recordTask.current || 0}/${recordTask.total}` : `${recordTaskProgress}%`}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-pink-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${recordTaskProgress}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                        <SoftButton
                          size="xs"
                          variant="emerald"
                          icon={Film}
                          disabled={!recordUrl}
                          className="w-full"
                          onClick={() => {
                            setPreviewRecord({
                              url: recordUrl,
                              title: item.movieTitle || item.title || item.movieId || "播放记录",
                              movieId: item.movieId
                            });
                            setPreviewKey("record");
                            setPlayerReloadKey((value) => value + 1);
                          }}
                        >
                          预览
                        </SoftButton>
                        <SoftButton size="xs" variant="sky" icon={ExternalLink} disabled={!recordUrl} className="w-full" onClick={() => onAction("open-playback-url", { url: recordUrl, label: "播放记录完整链接" })}>
                          打开
                        </SoftButton>
                        <SoftButton size="xs" variant="secondary" icon={Copy} className="w-full" onClick={() => onAction("copy-playback-health-report", { report: recordReport })}>
                          报告
                        </SoftButton>
                        <SoftButton size="xs" variant="secondary" icon={RefreshCw} disabled={!item.movieId} className="w-full" onClick={() => onAction("refresh-full-detail", { movieId: item.movieId || "" })}>
                          刷新
                        </SoftButton>
                        <SoftButton
                          size="xs"
                          className="w-full sm:col-span-1 col-span-3"
                          icon={recordCanSave ? Save : recordTask?.stage === "error" ? RefreshCw : recordRunning ? Layers : Download}
                          disabled={recordCanSave ? !recordTask?.taskId : !item.movieId}
                          onClick={() => {
                            if (recordTask?.stage === "error") onAction("download-full-video", { movieId: recordTask.movieId || item.movieId || "" });
                            else if (recordCanSave) onAction("save-download-device", { taskId: recordTask?.taskId || "" });
                            else if (recordRunning) onPage?.("downloads");
                            else onAction("download-full-video", { movieId: item.movieId || "" });
                          }}
                        >
                          {recordPrimaryAction}
                        </SoftButton>
                      </div>
                    </div>
                  );
                }) : records.length ? (
                  <EmptyState icon={Search} title="没有匹配的播放记录" desc="切换到「全部」或清除搜索词后再看" />
                ) : (
                  <EmptyState icon={Film} title="还没有播放详情记录" desc="打开网站视频详情页后会自动记录到这里" />
                )}
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
