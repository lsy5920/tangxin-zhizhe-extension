import type { DownloadTask } from "../types";
import {
  absoluteUrl,
  canSaveDownload,
  downloadFormat,
  downloadProgress,
  downloadStageLabel,
  downloadTitle,
  isRunningDownloadTask
} from "../helpers";

export type DownloadFilter = "all" | "running" | "ready" | "failed";
export type DownloadSort = "updated" | "failed" | "progress" | "size";

function matchesFilter(task: DownloadTask, filter: DownloadFilter) {
  if (filter === "running") return isRunningDownloadTask(task);
  if (filter === "ready") return canSaveDownload(task);
  if (filter === "failed") return task.stage === "error";
  return true;
}

function searchableDownloadText(task: DownloadTask) {
  return [
    downloadTitle(task),
    task.movieId,
    task.taskId,
    task.filename,
    task.url,
    absoluteUrl(task.url),
    downloadFormat(task),
    downloadStageLabel(task.stage),
    task.error,
    task.transmuxError
  ].filter(Boolean).join(" ").toLowerCase();
}

/** 筛选、搜索和排序顺序固定，避免 UI 组件内多组派生数组产生不同结果。 */
export function selectDownloadTasks(
  tasks: DownloadTask[],
  filter: DownloadFilter,
  searchText: string,
  sort: DownloadSort
) {
  const keyword = searchText.trim().toLowerCase();
  const selected = tasks.filter((task) => matchesFilter(task, filter) && (!keyword || searchableDownloadText(task).includes(keyword)));

  return [...selected].sort((a, b) => {
    if (sort === "failed") {
      const failedDiff = Number(b.stage === "error") - Number(a.stage === "error");
      if (failedDiff) return failedDiff;
    }
    if (sort === "progress") {
      const progressDiff = downloadProgress(b) - downloadProgress(a);
      if (progressDiff) return progressDiff;
    }
    if (sort === "size") {
      const sizeDiff = Number(b.bytes || 0) - Number(a.bytes || 0);
      if (sizeDiff) return sizeDiff;
    }
    return (Date.parse(String(b.updatedAt || "")) || 0) - (Date.parse(String(a.updatedAt || "")) || 0);
  });
}

export function groupDownloadFailures(tasks: DownloadTask[]) {
  return Array.from(tasks.filter((task) => task.stage === "error").reduce((groups, task) => {
    const reason = String(task.error || task.transmuxError || "未记录失败原因").trim();
    const current = groups.get(reason) || [];
    current.push(task);
    groups.set(reason, current);
    return groups;
  }, new Map<string, DownloadTask[]>()).entries()).sort((a, b) => b[1].length - a[1].length);
}

export function uniqueRetryMovieIds(tasks: DownloadTask[]) {
  return Array.from(new Set(tasks
    .filter((task) => task.stage === "error" && task.movieId)
    .map((task) => String(task.movieId))));
}
