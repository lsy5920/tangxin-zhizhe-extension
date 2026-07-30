import type { BridgeState, DownloadTask } from "../types";
import { normalizeCinemaPrimaryRoute, type CinemaPrimaryRoute, type CinemaRoute } from "./appModel";
import type { CinemaCatalogFilters, CinemaCatalogMode } from "./types";

export const STANDALONE_RUNTIME_ACTIONS: Readonly<Record<string, string>> = Object.freeze({
  "update-library-entry": "updateLibraryEntry",
  "mark-library-playback": "markLibraryPlayback",
  "save-playback-bookmark": "savePlaybackBookmark",
  "delete-playback-bookmark": "deletePlaybackBookmark",
  "save-experience-settings": "saveExperienceSettings",
  "configure-download-task": "configureDownloadTask",
  "pause-download-queue": "pauseDownloadQueue",
  "resume-download-queue": "resumeDownloadQueue",
  "pause-download-task": "pauseDownloadTask",
  "resume-download-task": "resumeDownloadTask",
  "cancel-download-task": "cancelDownloadTask",
  "remove-download-task": "removeDownloadTask",
  "clear-downloads": "clearDownloadTasks",
  "run-storage-audit": "runStorageAudit",
  "cleanup-opfs-storage": "cleanupOpfsStorage",
  "open-download-folder": "openDownloadFolder",
  "save-download-device": "saveDownloadToDevice"
});

/**
 * 后台公开状态不包含页面本地的合集和下载规划弹层。合并刷新结果时保留这两项，
 * 避免下载进度写盘或 Service Worker 唤醒把用户正在查看的弹层瞬间关闭。
 */
export function mergeStandaloneBridgeState(current: BridgeState, incoming?: BridgeState | null): BridgeState {
  if (!incoming) return current;
  return {
    ...current,
    ...incoming,
    cinemaCollection: incoming.cinemaCollection ?? current.cinemaCollection,
    downloadPlanner: incoming.downloadPlanner ?? current.downloadPlanner,
    expanded: true,
    publishedAt: incoming.publishedAt || new Date().toISOString()
  };
}

export function cinemaRouteFromHash(hash = ""): CinemaPrimaryRoute {
  const route = cinemaRouteEntryFromHash(hash);
  return "movieId" in route ? "home" : route.name;
}

export function cinemaRouteEntryFromHash(hash = ""): CinemaRoute {
  const [rawName = "", rawMovieId = ""] = String(hash || "")
    .replace(/^#\/?/, "")
    .split("?", 1)[0]
    .split("/");
  const name = String(rawName || "").trim();
  if (["detail", "playback"].includes(name) && rawMovieId) {
    let movieId = String(rawMovieId).trim();
    try {
      movieId = decodeURIComponent(movieId).trim();
    } catch {
      // 损坏的百分号编码不能阻断影院启动；保留原始编号并交给后续白名单校验。
    }
    if (movieId) return { name: name as "detail" | "playback", movieId };
  }
  return { name: normalizeCinemaPrimaryRoute(name) };
}

export function cinemaHashForRoute(route: CinemaPrimaryRoute): string {
  return `#/${normalizeCinemaPrimaryRoute(route)}`;
}

export function cinemaCatalogIntentKey(input: {
  mode?: CinemaCatalogMode;
  query?: string;
  filters?: CinemaCatalogFilters;
}): string {
  const filters = Object.fromEntries(
    Object.entries(input.filters || {})
      .filter(([, value]) => value !== "" && value !== undefined && value !== null)
      .sort(([left], [right]) => left.localeCompare(right))
  );
  return JSON.stringify({
    mode: input.mode || "discover",
    query: String(input.query || "").trim(),
    filters
  });
}

export function selectDownloadTasksByIds(state: BridgeState, taskIds: unknown): DownloadTask[] {
  const tasks = state.downloadTasks || {};
  const ids = Array.isArray(taskIds) ? taskIds.map((item) => String(item || "")).filter(Boolean) : [];
  if (!ids.length) return Object.values(tasks);
  const idSet = new Set(ids);
  return Object.values(tasks).filter((task) => idSet.has(String(task.taskId || task.movieId || task.url || "")));
}

export function buildDownloadReport(tasks: DownloadTask[], label = "当前筛选", failedOnly = false): string {
  const rows = failedOnly ? tasks.filter((task) => task.stage === "error") : tasks;
  const title = failedOnly ? "糖心影院下载失败摘要" : "糖心影院下载任务报告";
  const lines = [
    title,
    `筛选范围：${label || "当前筛选"}`,
    `任务数量：${rows.length}`,
    `生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    ""
  ];
  rows.forEach((task, index) => {
    const total = Math.max(0, Number(task.total) || 0);
    const current = Math.max(0, Number(task.current) || 0);
    const percent = Number.isFinite(Number(task.percent))
      ? Math.max(0, Math.min(100, Math.round(Number(task.percent))))
      : total ? Math.round((current / total) * 100) : 0;
    lines.push(
      `${index + 1}. ${task.movieTitle || task.titleSnippet || task.filename || `视频 ${task.movieId || "未知"}`}`,
      `视频编号：${task.movieId || "未记录"}`,
      `任务编号：${task.taskId || "未记录"}`,
      `任务状态：${task.stage || "未知"}`,
      `下载进度：${total ? `${current}/${total}，` : ""}${percent}%`,
      `完整源链接：${task.url || "未记录"}`
    );
    if (task.error || task.transmuxError) lines.push(`失败原因：${task.error || task.transmuxError}`);
    lines.push("");
  });
  return lines.join("\n");
}
