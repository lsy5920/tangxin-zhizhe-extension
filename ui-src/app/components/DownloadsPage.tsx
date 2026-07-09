import { useState } from "react";
import { AlertTriangle, CheckCircle, Copy, Download, FolderOpen, Link, Loader, RefreshCw, Save, Search, SortDesc, Trash2, XCircle } from "lucide-react";
import type { BridgeState, DownloadTask } from "../types";
import { absoluteUrl, canSaveDownload, downloadFormat, downloadProgress, downloadStageLabel, downloadStats, downloadTasks, downloadTitle, formatBytes, isRunningDownloadTask, maskUrl, shortTime } from "../helpers";
import {
  ActionToolbar,
  EmptyState,
  PageShell,
  Pill,
  SectionCard,
  SegmentedControl,
  SoftButton,
  SoftInput
} from "./ui/primitives";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

type DownloadFilter = "all" | "running" | "ready" | "failed";
type DownloadSort = "updated" | "failed" | "progress" | "size";

function taskTone(task: DownloadTask) {
  if (task.stage === "complete" || task.stage === "ready") return { label: downloadStageLabel(task.stage), color: "bg-emerald-100 text-emerald-600", icon: <CheckCircle size={11} /> };
  if (task.stage === "error") return { label: "失败", color: "bg-rose-100 text-rose-600", icon: <XCircle size={11} /> };
  if (["playlist", "segments", "segment"].includes(String(task.stage || ""))) return { label: downloadStageLabel(task.stage), color: "bg-amber-100 text-amber-600", icon: <Download size={11} /> };
  return { label: downloadStageLabel(task.stage), color: "bg-sky-100 text-sky-600", icon: <Loader size={11} className="animate-spin" /> };
}

export function DownloadsPage({ state, onAction }: Props) {
  const tasks = downloadTasks(state);
  const stats = downloadStats(tasks);
  const [filter, setFilter] = useState<DownloadFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<DownloadSort>("updated");
  const readyCount = tasks.filter(canSaveDownload).length;

  const statusFilteredTasks = tasks.filter((task) => {
    if (filter === "running") return isRunningDownloadTask(task);
    if (filter === "ready") return canSaveDownload(task);
    if (filter === "failed") return task.stage === "error";
    return true;
  });
  const searchKeyword = searchText.trim().toLowerCase();
  const searchedTasks = statusFilteredTasks.filter((task) => {
    if (!searchKeyword) return true;
    const sourceUrl = absoluteUrl(task.url);
    return [
      downloadTitle(task),
      task.movieId,
      task.taskId,
      task.filename,
      task.url,
      sourceUrl,
      downloadFormat(task),
      downloadStageLabel(task.stage),
      task.error,
      task.transmuxError
    ].filter(Boolean).join(" ").toLowerCase().includes(searchKeyword);
  });
  const updatedTime = (task: DownloadTask) => Date.parse(String(task.updatedAt || "")) || 0;
  const filteredTasks = [...searchedTasks].sort((a, b) => {
    if (sortMode === "failed") {
      const diff = Number(b.stage === "error") - Number(a.stage === "error");
      if (diff) return diff;
    }
    if (sortMode === "progress") {
      const diff = downloadProgress(b) - downloadProgress(a);
      if (diff) return diff;
    }
    if (sortMode === "size") {
      const diff = Number(b.bytes || 0) - Number(a.bytes || 0);
      if (diff) return diff;
    }
    return updatedTime(b) - updatedTime(a);
  });

  const filterItems = [
    { key: "all" as const, label: "全部", count: stats.total, tone: "text-purple-600" },
    { key: "running" as const, label: "进行中", count: stats.running, tone: "text-amber-600" },
    { key: "ready" as const, label: "可保存", count: readyCount, tone: "text-emerald-600" },
    { key: "failed" as const, label: "失败", count: stats.failed, tone: "text-rose-600" }
  ];
  const sortItems: { key: DownloadSort; label: string; tip: string }[] = [
    { key: "updated", label: "最近", tip: "按更新时间倒序" },
    { key: "failed", label: "失败优先", tip: "失败任务排在前面" },
    { key: "progress", label: "进度", tip: "进度高的排在前面" },
    { key: "size", label: "大小", tip: "文件大的排在前面" }
  ];
  const filteredTaskIds = filteredTasks.map((task) => task.taskId || task.movieId || task.url || "").filter(Boolean);
  const filteredLinkCount = filteredTasks.filter((task) => Boolean(task.url)).length;
  const failedFilteredTasks = filteredTasks.filter((task) => task.stage === "error");
  const failedReasonGroups = Array.from(failedFilteredTasks.reduce((map, task) => {
    const reason = String(task.error || task.transmuxError || "未记录失败原因").trim();
    const current = map.get(reason) || [];
    current.push(task);
    map.set(reason, current);
    return map;
  }, new Map<string, DownloadTask[]>()).entries()).sort((a, b) => b[1].length - a[1].length);
  const readyTaskIds = filteredTasks.filter(canSaveDownload).map((task) => task.taskId || "").filter(Boolean);
  const filterLabel = filterItems.find((item) => item.key === filter)?.label || "当前筛选";
  const retryMovieIds = Array.from(new Set(filteredTasks
    .filter((task) => task.stage === "error" && task.movieId)
    .map((task) => String(task.movieId))));

  function retryFilteredFailedTasks() {
    retryMovieIds.forEach((movieId) => onAction("download-full-video", { movieId }));
  }

  return (
    <PageShell>
      {/* 顶部只保留分段筛选（含数量），避免与统计瓷砖重复。 */}
      <SectionCard
        title="任务筛选"
        icon={Download}
        hint={`共 ${stats.total} 个任务 · 已完成 ${stats.completed} · 当前列表 ${filteredTasks.length}`}
      >
        <SegmentedControl items={filterItems} value={filter} onChange={setFilter} />
      </SectionCard>

      <SectionCard title="查找与排序" icon={Search} hint={`当前显示 ${filteredTasks.length} / ${statusFilteredTasks.length}`}>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 rounded-xl bg-purple-50/80 px-2.5 py-2 ring-1 ring-purple-100">
            <Search size={13} className="shrink-0 text-purple-300" />
            <SoftInput
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索标题、编号、任务或链接"
              className="border-0 bg-transparent px-0 py-0 shadow-none ring-0 focus:ring-0"
            />
            {searchText && (
              <SoftButton size="xs" variant="ghost" onClick={() => setSearchText("")}>清除</SoftButton>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {sortItems.map((item) => {
              const active = sortMode === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSortMode(item.key)}
                  title={item.tip}
                  className={`flex min-h-8 items-center justify-center gap-1 rounded-xl px-1.5 text-[10px] font-semibold transition ${
                    active ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm" : "bg-purple-50 text-purple-400 hover:bg-purple-100"
                  }`}
                >
                  <SortDesc size={11} /> {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="批量操作" icon={Download}>
        <ActionToolbar>
          <SoftButton size="sm" variant="sky" icon={FolderOpen} onClick={() => onAction("open-download-folder")}>目录</SoftButton>
          <SoftButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => onAction("refresh-downloads")}>刷新</SoftButton>
          <SoftButton size="sm" variant="emerald" icon={Save} onClick={() => onAction("save-downloads")}>保存记录</SoftButton>
          <SoftButton size="sm" variant="emerald" icon={Save} disabled={!readyTaskIds.length} onClick={() => onAction("save-ready-downloads", { taskIds: readyTaskIds })}>保存全部</SoftButton>
          <SoftButton size="sm" variant="secondary" icon={Copy} disabled={!filteredLinkCount} onClick={() => onAction("copy-filtered-download-urls", { taskIds: filteredTaskIds })}>复制链接</SoftButton>
          <SoftButton size="sm" variant="sky" icon={Copy} disabled={!filteredTasks.length} onClick={() => onAction("copy-filtered-download-report", { taskIds: filteredTaskIds, filterLabel })}>复制报告</SoftButton>
          <SoftButton size="sm" variant="danger" icon={AlertTriangle} disabled={!failedFilteredTasks.length} onClick={() => onAction("copy-failed-download-summary", { taskIds: filteredTaskIds, filterLabel })}>失败摘要</SoftButton>
          {filter === "failed" && (
            <SoftButton size="sm" variant="amber" icon={RefreshCw} disabled={!retryMovieIds.length} onClick={retryFilteredFailedTasks}>重试失败</SoftButton>
          )}
          <SoftButton size="sm" variant="danger" icon={Trash2} onClick={() => onAction("clear-downloads")}>清空</SoftButton>
        </ActionToolbar>
      </SectionCard>

      {failedReasonGroups.length > 0 && (
        <SectionCard title="失败原因概览" icon={AlertTriangle} tone="rose" action={
          <Pill className="bg-rose-100 text-rose-600">{failedFilteredTasks.length} 个 / {failedReasonGroups.length} 类</Pill>
        }>
          <div className="space-y-1.5">
            {failedReasonGroups.slice(0, 3).map(([reason, list]) => (
              <div key={reason} className="flex items-start justify-between gap-2 rounded-xl bg-rose-50/80 px-2.5 py-2">
                <p className="min-w-0 flex-1 break-all text-[10px] leading-relaxed text-rose-600">{reason}</p>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-rose-500">{list.length}</span>
              </div>
            ))}
            {failedReasonGroups.length > 3 && (
              <p className="text-[10px] text-rose-400">还有 {failedReasonGroups.length - 3} 类原因，可用「失败摘要」导出。</p>
            )}
          </div>
        </SectionCard>
      )}

      <div className="space-y-2.5">
        {filteredTasks.length ? filteredTasks.map((task) => {
          const tone = taskTone(task);
          const progress = downloadProgress(task);
          const sourceUrl = absoluteUrl(task.url);
          return (
            <div key={task.taskId || task.movieId || task.url} className="overflow-hidden rounded-2xl border border-pink-100/90 bg-white shadow-[0_6px_20px_rgba(147,51,234,0.05)]">
              <div className="flex items-start justify-between gap-2 border-b border-purple-50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-purple-800">{downloadTitle(task)}</p>
                  <p className="mt-0.5 text-[10px] text-purple-300">{task.movieId ? `视频 ${task.movieId}` : task.taskId || "视频任务"}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.color}`}>
                  {tone.icon} {tone.label}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap gap-1.5">
                  <Pill className="bg-purple-50 text-purple-500">{downloadFormat(task)}</Pill>
                  <Pill className="bg-sky-50 text-sky-500">{formatBytes(task.bytes)}</Pill>
                  <Pill className="bg-slate-50 text-slate-400">{shortTime(task.updatedAt)}</Pill>
                </div>
                {sourceUrl && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-purple-50/80 px-2.5 py-1.5">
                    <Link size={11} className="shrink-0 text-purple-300" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-purple-500">{maskUrl(sourceUrl)}</span>
                  </div>
                )}
                {task.stage !== "complete" && (
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-purple-400">
                      <span>{downloadStageLabel(task.stage)}</span>
                      <span className="tabular-nums">{task.total ? `${task.current || 0}/${task.total}` : `${progress}%`}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-pink-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                {(task.error || task.transmuxError) && (
                  <div className="flex items-start gap-1.5 rounded-xl bg-rose-50 p-2">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0 text-rose-400" />
                    <p className="break-all text-[10px] text-rose-600">{task.error || `MP4转封装失败，TS已保留：${task.transmuxError}`}</p>
                  </div>
                )}
                <div className="flex gap-1.5">
                  {task.stage === "error" && (
                    <SoftButton size="sm" variant="amber" icon={RefreshCw} disabled={!task.movieId} onClick={() => onAction("download-full-video", { movieId: task.movieId || "" })}>
                      重试
                    </SoftButton>
                  )}
                  <SoftButton
                    size="sm"
                    className="flex-1"
                    icon={Save}
                    disabled={!canSaveDownload(task)}
                    onClick={() => onAction("save-download-device", { taskId: task.taskId || "" })}
                  >
                    保存到设备
                  </SoftButton>
                  {task.url && (
                    <SoftButton size="sm" variant="secondary" icon={Copy} title="复制链接" onClick={() => onAction("copy-download-url", { taskId: task.taskId || "" })} />
                  )}
                  <SoftButton size="sm" variant="danger" icon={Trash2} title="删除" onClick={() => onAction("remove-download-task", { taskId: task.taskId || "", movieId: task.movieId || "" })} />
                </div>
              </div>
            </div>
          );
        }) : tasks.length ? (
          <EmptyState icon={Search} title="当前筛选或搜索没有任务" desc="切换到「全部」或清除搜索词可查看更多下载记录" />
        ) : (
          <EmptyState icon={Download} title="暂无下载任务" desc="进入视频详情页点击「下载」即可创建任务" />
        )}
      </div>
    </PageShell>
  );
}
