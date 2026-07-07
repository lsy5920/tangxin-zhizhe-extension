import { useState } from "react";
import { AlertTriangle, CheckCircle, Copy, Download, FolderOpen, Link, Loader, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import type { BridgeState, DownloadTask } from "../types";
import { absoluteUrl, canSaveDownload, downloadFormat, downloadProgress, downloadStageLabel, downloadStats, downloadTasks, downloadTitle, formatBytes, isRunningDownloadTask, maskUrl, shortTime } from "../helpers";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

type DownloadFilter = "all" | "running" | "ready" | "failed";

function taskTone(task: DownloadTask) {
  if (task.stage === "complete" || task.stage === "ready") return { label: downloadStageLabel(task.stage), color: "bg-emerald-100 text-emerald-600", icon: <CheckCircle size={11} /> };
  if (task.stage === "error") return { label: "失败", color: "bg-rose-100 text-rose-600", icon: <XCircle size={11} /> };
  if (["playlist","segments","segment"].includes(String(task.stage||""))) return { label: downloadStageLabel(task.stage), color: "bg-amber-100 text-amber-600", icon: <Download size={11} /> };
  return { label: downloadStageLabel(task.stage), color: "bg-sky-100 text-sky-600", icon: <Loader size={11} className="animate-spin" /> };
}

export function DownloadsPage({ state, onAction }: Props) {
  const tasks = downloadTasks(state);
  const stats = downloadStats(tasks);
  const [filter, setFilter] = useState<DownloadFilter>("all");
  const readyCount = tasks.filter(canSaveDownload).length;
  // 下载任务较多时先按状态缩小范围，再查看具体任务卡片。
  const filteredTasks = tasks.filter((task) => {
    if (filter === "running") return isRunningDownloadTask(task);
    if (filter === "ready") return canSaveDownload(task);
    if (filter === "failed") return task.stage === "error";
    return true;
  });
  const filterItems: { key: DownloadFilter; label: string; value: number; color: string }[] = [
    { key: "all", label: "全部", value: stats.total, color: "text-purple-600" },
    { key: "running", label: "进行中", value: stats.running, color: "text-amber-600" },
    { key: "ready", label: "可保存", value: readyCount, color: "text-emerald-600" },
    { key: "failed", label: "失败", value: stats.failed, color: "text-rose-600" }
  ];
  const filteredTaskIds = filteredTasks.map((task) => task.taskId || "").filter(Boolean);
  const filteredLinkCount = filteredTasks.filter((task) => Boolean(task.url)).length;
  const readyTaskIds = filteredTasks.filter(canSaveDownload).map((task) => task.taskId || "").filter(Boolean);
  const retryMovieIds = Array.from(new Set(filteredTasks
    .filter((task) => task.stage === "error" && task.movieId)
    .map((task) => String(task.movieId))));

  function retryFilteredFailedTasks() {
    // 批量重试按视频编号去重，避免同一视频重复创建下载任务。
    retryMovieIds.forEach((movieId) => onAction("download-full-video", { movieId }));
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "总任务", value: stats.total, color: "bg-purple-100 text-purple-700" },
          { label: "进行中", value: stats.running, color: "bg-amber-100 text-amber-700" },
          { label: "已完成", value: stats.completed, color: "bg-emerald-100 text-emerald-700" },
          { label: "失败", value: stats.failed, color: "bg-rose-100 text-rose-700" }
        ].map((item) => (
          <div key={item.label} className={`${item.color} rounded-2xl p-2 text-center`}>
            <p className="text-lg font-bold">{item.value}</p>
            <p className="text-[10px] opacity-75">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm border border-pink-100">
        {filterItems.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-xl px-1.5 py-2 text-center transition-all ${active ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm" : "text-purple-300 hover:bg-purple-50"}`}
            >
              <p className={`text-sm font-bold ${active ? "text-white" : item.color}`}>{item.value}</p>
              <p className="mt-0.5 text-[10px]">{item.label}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onAction("open-download-folder")} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 px-3 py-2 text-xs text-white shadow-sm transition-transform active:scale-95">
          <FolderOpen size={13} /> 下载目录
        </button>
        <button onClick={() => onAction("refresh-downloads")} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-purple-400 to-violet-500 px-3 py-2 text-xs text-white shadow-sm transition-transform active:scale-95">
          <RefreshCw size={13} /> 刷新
        </button>
        <button onClick={() => onAction("save-downloads")} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-2 text-xs text-white shadow-sm transition-transform active:scale-95">
          <Save size={13} /> 保存记录
        </button>
        <button
          onClick={() => onAction("save-ready-downloads", { taskIds: readyTaskIds })}
          disabled={!readyTaskIds.length}
          className="flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-xs text-emerald-500 transition-transform active:scale-95 disabled:opacity-45"
          title="逐个处理当前筛选里的可保存任务"
        >
          <Save size={13} /> 保存全部
        </button>
        <button
          onClick={() => onAction("copy-filtered-download-urls", { taskIds: filteredTaskIds })}
          disabled={!filteredLinkCount}
          className="flex items-center gap-1 rounded-xl border border-purple-200 px-3 py-2 text-xs text-purple-500 transition-transform active:scale-95 disabled:opacity-45"
          title="复制当前筛选里的完整下载链接"
        >
          <Copy size={13} /> 复制筛选链接
        </button>
        {filter === "failed" && (
          <button
            onClick={retryFilteredFailedTasks}
            disabled={!retryMovieIds.length}
            className="flex items-center gap-1 rounded-xl border border-amber-200 px-3 py-2 text-xs text-amber-500 transition-transform active:scale-95 disabled:opacity-45"
            title="批量重试当前失败任务"
          >
            <RefreshCw size={13} /> 重试失败
          </button>
        )}
        <button onClick={() => onAction("clear-downloads")} className="ml-auto flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs text-rose-500 transition-transform active:scale-95">
          <Trash2 size={13} /> 清空
        </button>
      </div>

      <div className="space-y-3">
        {filteredTasks.length ? filteredTasks.map((task) => {
          const tone = taskTone(task);
          const progress = downloadProgress(task);
          const sourceUrl = absoluteUrl(task.url);
          return (
            <div key={task.taskId || task.movieId || task.url} className="space-y-2 rounded-2xl border border-pink-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-purple-800">{downloadTitle(task)}</p>
                  <p className="mt-0.5 text-[10px] text-purple-300">{task.movieId ? `视频 ${task.movieId}` : task.taskId || "视频任务"}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.color}`}>
                  {tone.icon} {tone.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-500">{downloadFormat(task)}</span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-500">{formatBytes(task.bytes)}</span>
                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-400">{shortTime(task.updatedAt)}</span>
              </div>
              {sourceUrl && (
                <div className="flex items-center gap-1.5 rounded-xl bg-purple-50 px-2.5 py-1.5">
                  <Link size={11} className="shrink-0 text-purple-300" />
                  <span className="shrink-0 text-[10px] font-medium text-purple-400">完整源链接</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-purple-500">{maskUrl(sourceUrl)}</span>
                </div>
              )}
              {task.stage !== "complete" && (
                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-purple-400">
                    <span>{downloadStageLabel(task.stage)}</span>
                    <span>{task.total ? `${task.current||0}/${task.total}` : `${progress}%`}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-pink-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              {(task.error || task.transmuxError) && (
                <div className="flex items-start gap-1.5 rounded-xl bg-rose-50 p-2">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0 text-rose-400" />
                  <p className="text-[10px] text-rose-600 break-all">{task.error || `MP4转封装失败，TS已保留：${task.transmuxError}`}</p>
                </div>
              )}
              <div className="flex gap-1.5 pt-0.5">
                {task.stage === "error" && (
                  // 失败重试复用完整视频下载流程，继续走账号池和资源刷新逻辑。
                  <button
                    onClick={() => onAction("download-full-video", { movieId: task.movieId || "" })}
                    disabled={!task.movieId}
                    className="flex items-center gap-1 rounded-xl border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-500 transition-transform active:scale-95 disabled:opacity-45"
                    title="重新创建下载任务"
                  >
                    <RefreshCw size={11} /> 重试
                  </button>
                )}
                <button
                  onClick={() => onAction("save-download-device", { taskId: task.taskId || "" })}
                  disabled={!canSaveDownload(task)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 py-1.5 text-[11px] font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
                >
                  <Save size={12} /> 保存到设备
                </button>
                {task.url && (
                  <button onClick={() => onAction("copy-download-url", { taskId: task.taskId || "" })} className="flex items-center gap-1 rounded-xl border border-purple-200 px-2.5 py-1.5 text-[11px] text-purple-400 hover:bg-purple-50 transition-colors" title="复制完整下载链接">
                    <Copy size={11} />
                  </button>
                )}
                <button onClick={() => onAction("remove-download-task", { taskId: task.taskId || "", movieId: task.movieId || "" })} className="flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-400 hover:bg-rose-50 transition-colors" title="删除任务">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        }) : tasks.length ? (
          <div className="rounded-2xl border border-pink-100 bg-white p-5 text-center shadow-sm">
            <Download size={28} className="mx-auto mb-2 text-purple-200" />
            <p className="text-xs text-purple-400">当前筛选没有任务</p>
            <p className="mt-1 text-[10px] text-purple-300">切换到「全部」可以查看所有下载记录</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-pink-100 bg-white p-5 text-center shadow-sm">
            <Download size={28} className="mx-auto mb-2 text-purple-200" />
            <p className="text-xs text-purple-400">暂无下载任务</p>
            <p className="mt-1 text-[10px] text-purple-300">进入视频详情页点击"下载"按钮即可创建任务</p>
          </div>
        )}
      </div>
    </div>
  );
}
