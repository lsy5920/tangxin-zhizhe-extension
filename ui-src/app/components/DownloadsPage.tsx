import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Copy, Download, FolderOpen, Link, Loader, MoreHorizontal, RefreshCw, Save, Search, SortDesc, Trash2, XCircle } from "lucide-react";
import type { BridgeState, DownloadTask } from "../types";
import { absoluteUrl, canSaveDownload, downloadFormat, downloadLineLabel, downloadProgress, downloadSpeedText, downloadStageLabel, downloadStats, downloadTasks, downloadTitle, formatBytes, maskUrl, shortTime } from "../helpers";
import {
  groupDownloadFailures,
  selectDownloadTasks,
  uniqueRetryMovieIds
} from "../domain/downloads";
import type { DownloadFilter, DownloadSort } from "../domain/downloads";
import {
  EmptyState,
  ModalSheet,
  PageIntro,
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

type DeleteTarget = { type: "all" } | { type: "task"; task: DownloadTask };

function taskTone(task: DownloadTask) {
  if (task.stage === "complete" || task.stage === "ready") return { label: downloadStageLabel(task.stage), color: "bg-success-50 text-success-600", icon: <CheckCircle size={12} /> };
  if (task.stage === "error") return { label: "失败", color: "bg-danger-50 text-danger-600", icon: <XCircle size={12} /> };
  if (["playlist", "segments", "segment"].includes(String(task.stage || ""))) return { label: downloadStageLabel(task.stage), color: "bg-warning-50 text-warning-600", icon: <Download size={12} /> };
  return { label: downloadStageLabel(task.stage), color: "bg-info-50 text-info-600", icon: <Loader size={12} className="animate-spin" /> };
}

export function DownloadsPage({ state, onAction }: Props) {
  const tasks = downloadTasks(state);
  const stats = downloadStats(tasks);
  const [filter, setFilter] = useState<DownloadFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<DownloadSort>("updated");
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryGeneration = useRef(0);
  const readyCount = tasks.filter(canSaveDownload).length;

  useEffect(() => () => {
    // 页面卸载后终止尚未发出的重试动作，避免切页后后台继续排队。
    retryGeneration.current += 1;
  }, []);

  const filteredTasks = selectDownloadTasks(tasks, filter, searchText, sortMode);

  const filterItems = [
    { key: "all" as const, label: "全部", count: stats.total, tone: "text-brand-600" },
    { key: "running" as const, label: "进行中", count: stats.running, tone: "text-warning-600" },
    { key: "ready" as const, label: "可保存", count: readyCount, tone: "text-success-600" },
    { key: "failed" as const, label: "失败", count: stats.failed, tone: "text-danger-600" }
  ];
  const sortItems: { key: DownloadSort; label: string; tip: string }[] = [
    { key: "updated", label: "最近更新", tip: "按更新时间倒序" },
    { key: "failed", label: "失败优先", tip: "失败任务排在前面" },
    { key: "progress", label: "进度优先", tip: "进度高的排在前面" },
    { key: "size", label: "文件大小", tip: "文件大的排在前面" }
  ];
  const filteredTaskIds = filteredTasks.map((task) => task.taskId || task.movieId || task.url || "").filter(Boolean);
  const filteredLinkCount = filteredTasks.filter((task) => Boolean(task.url)).length;
  const failedFilteredTasks = filteredTasks.filter((task) => task.stage === "error");
  const failedReasonGroups = groupDownloadFailures(filteredTasks);
  const readyTaskIds = filteredTasks.filter(canSaveDownload).map((task) => task.taskId || "").filter(Boolean);
  const filterLabel = filterItems.find((item) => item.key === filter)?.label || "当前筛选";
  const retryMovieIds = uniqueRetryMovieIds(filteredTasks);

  function runBulkAction(action: string, payload?: Record<string, unknown>) {
    setShowBulkActions(false);
    onAction(action, payload);
  }

  async function retryFilteredFailedTasks() {
    if (retrying || !retryMovieIds.length) return;
    setRetrying(true);
    setShowBulkActions(false);
    const generation = ++retryGeneration.current;
    // 逐个启动任务并留出调度间隔，避免多个视频同时争抢账号池与网络连接。
    for (const movieId of retryMovieIds) {
      if (generation !== retryGeneration.current) break;
      onAction("download-full-video", { movieId });
      await new Promise((resolve) => window.setTimeout(resolve, 420));
    }
    if (generation === retryGeneration.current) setRetrying(false);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "all") onAction("clear-downloads", { confirmed: true });
    else onAction("remove-download-task", { taskId: deleteTarget.task.taskId || "", movieId: deleteTarget.task.movieId || "" });
    setDeleteTarget(null);
  }

  return (
    <PageShell>
      <PageIntro
        eyebrow="DOWNLOAD BASKET"
        title="下载收纳篮"
        description="每个下载任务都会整齐放在这里；可以筛选、排查、保存，清空前仍会认真向你确认。"
        actions={
          <>
            <SoftButton size="sm" variant="secondary" icon={FolderOpen} onClick={() => onAction("open-download-folder")}>打开文件夹</SoftButton>
            <SoftButton size="sm" icon={Save} disabled={!readyTaskIds.length} onClick={() => onAction("save-ready-downloads", { taskIds: readyTaskIds })}>收下可用项</SoftButton>
          </>
        }
        meta={
          <>
            <Pill className="bg-slate-100 text-slate-600">共 {stats.total} 个</Pill>
            <Pill className="bg-success-50 text-success-600">已完成 {stats.completed}</Pill>
            {stats.running > 0 && <Pill className="bg-warning-50 text-warning-600">进行中 {stats.running}</Pill>}
            {stats.failed > 0 && <Pill className="bg-danger-50 text-danger-600">失败 {stats.failed}</Pill>}
          </>
        }
      />

      <SectionCard title="整理与查找" icon={Search} hint={`收纳篮里当前显示 ${filteredTasks.length} / ${stats.total} 个任务`}>
        <div className="space-y-3">
          <SegmentedControl items={filterItems} value={filter} onChange={setFilter} />
          <div className="grid gap-2.5 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <SoftInput value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索标题、编号、任务或链接" className="pl-9 pr-16" aria-label="搜索下载任务" />
              {searchText && <button type="button" onClick={() => setSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100">清除</button>}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {sortItems.map((item) => {
                const active = sortMode === item.key;
                return (
                  <button key={item.key} type="button" onClick={() => setSortMode(item.key)} title={item.tip} aria-pressed={active} className={`flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-medium transition ${active ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                    <SortDesc size={12} /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <SoftButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => onAction("refresh-downloads")}>刷新状态</SoftButton>
            {filter === "failed" && <SoftButton size="sm" variant="amber" icon={RefreshCw} disabled={!retryMovieIds.length || retrying} onClick={retryFilteredFailedTasks}>{retrying ? "正在排队重试" : `重试失败项${retryMovieIds.length ? `（${retryMovieIds.length}）` : ""}`}</SoftButton>}
            <SoftButton size="sm" variant="ghost" icon={MoreHorizontal} onClick={() => setShowBulkActions(true)}>更多批量操作</SoftButton>
          </div>
        </div>
      </SectionCard>

      {failedReasonGroups.length > 0 && (
        <SectionCard title="失败原因概览" icon={AlertTriangle} tone="rose" action={<Pill className="bg-danger-50 text-danger-600">{failedFilteredTasks.length} 个 / {failedReasonGroups.length} 类</Pill>}>
          <div className="space-y-2">
            {failedReasonGroups.slice(0, 3).map(([reason, list]) => (
              <div key={reason} className="flex items-start justify-between gap-3 rounded-xl border border-danger-100 bg-danger-50/60 px-3 py-2.5">
                <p className="min-w-0 flex-1 break-all text-[11px] leading-[1.55] text-danger-600">{reason}</p>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-danger-600">{list.length}</span>
              </div>
            ))}
            {failedReasonGroups.length > 3 && <p className="text-[11px] text-slate-500">还有 {failedReasonGroups.length - 3} 类原因，可在批量操作中复制完整失败摘要。</p>}
          </div>
        </SectionCard>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {filteredTasks.length ? filteredTasks.map((task) => {
          const tone = taskTone(task);
          const progress = downloadProgress(task);
          const sourceUrl = absoluteUrl(task.url);
          return (
            <article key={task.taskId || task.movieId || task.url} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/92 shadow-[var(--txzz-shadow-sm)] transition hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-md">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13px] font-semibold text-slate-900">{downloadTitle(task)}</h3>
                  <p className="mt-1 text-[11px] text-slate-400">{task.movieId ? `视频 ${task.movieId}` : task.taskId || "视频任务"}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.color}`}>{tone.icon}{tone.label}</span>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-1.5">
                  <Pill className="bg-slate-100 text-slate-600">{downloadFormat(task)}</Pill>
                  {task.lineKey && <Pill className="bg-brand-50 text-brand-700">{downloadLineLabel(task.lineKey)}</Pill>}
                  <Pill className="bg-info-50 text-info-600">{task.totalBytes ? `${formatBytes(task.bytes)} / ${formatBytes(task.totalBytes)}` : formatBytes(task.bytes)}</Pill>
                  {downloadSpeedText(task) && <Pill className="bg-success-50 text-success-600">{downloadSpeedText(task)}</Pill>}
                  <Pill className="bg-slate-50 text-slate-500">{shortTime(task.updatedAt)}</Pill>
                </div>
                {sourceUrl && <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"><Link size={12} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{maskUrl(sourceUrl)}</span></div>}
                {task.stage !== "complete" && (
                  <div>
                    <div className="mb-1.5 flex justify-between text-[11px] text-slate-500"><span>{downloadStageLabel(task.stage)}</span><span className="tabular-nums font-semibold text-warning-600">{progress}%{task.total ? ` · ${task.current || 0}/${task.total} 片` : ""}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full border border-white bg-slate-100 p-0.5"><div className="h-full rounded-full bg-gradient-to-r from-warning-500 to-brand-400 transition-all" style={{ width: `${progress}%` }} /></div>
                    <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-slate-400"><span>{task.totalBytes ? `已下载 ${formatBytes(task.bytes || 0)} / 约 ${formatBytes(task.totalBytes)}` : task.bytes ? `已下载 ${formatBytes(task.bytes)}` : "等待体积统计"}</span><span>{downloadSpeedText(task) || "—"}</span></div>
                  </div>
                )}
                {(task.error || task.transmuxError) && <div className="flex items-start gap-2 rounded-xl bg-danger-50 p-2.5"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger-500" /><p className="break-all text-[11px] leading-[1.55] text-danger-600">{task.error || `MP4 转封装失败，TS 已保留：${task.transmuxError}`}</p></div>}
                <div className="flex flex-wrap gap-2">
                  {task.stage === "error" && <SoftButton size="sm" variant="amber" icon={RefreshCw} disabled={!task.movieId} onClick={() => onAction("download-full-video", { movieId: task.movieId || "" })}>重试</SoftButton>}
                  <SoftButton size="sm" className="min-w-[8rem] flex-1" icon={Save} disabled={!canSaveDownload(task)} onClick={() => onAction("save-download-device", { taskId: task.taskId || "" })}>保存到设备</SoftButton>
                  {task.url && <SoftButton size="sm" variant="secondary" icon={Copy} title="复制链接" aria-label="复制下载链接" onClick={() => onAction("copy-download-url", { taskId: task.taskId || "" })} />}
                  <SoftButton size="sm" variant="danger" icon={Trash2} title="删除任务" aria-label="删除下载任务" onClick={() => setDeleteTarget({ type: "task", task })} />
                </div>
              </div>
            </article>
          );
        }) : tasks.length ? (
          <div className="lg:col-span-2"><EmptyState icon={Search} title="当前筛选或搜索没有任务" desc="切换到“全部”或清除搜索词可查看更多下载记录" /></div>
        ) : (
          <div className="lg:col-span-2"><EmptyState icon={Download} title="收纳篮还是空的" desc="进入视频详情页点击“下载”，任务就会来到这里" /></div>
        )}
      </div>

      <ModalSheet open={showBulkActions} onClose={() => setShowBulkActions(false)} title={`批量操作 · ${filterLabel}`}>
        <div className="grid gap-2 sm:grid-cols-2">
          <SoftButton variant="secondary" className="w-full justify-start" icon={Save} onClick={() => runBulkAction("save-downloads")}>保存任务记录</SoftButton>
          <SoftButton variant="secondary" className="w-full justify-start" icon={Copy} disabled={!filteredLinkCount} onClick={() => runBulkAction("copy-filtered-download-urls", { taskIds: filteredTaskIds })}>复制当前链接</SoftButton>
          <SoftButton variant="secondary" className="w-full justify-start" icon={Copy} disabled={!filteredTasks.length} onClick={() => runBulkAction("copy-filtered-download-report", { taskIds: filteredTaskIds, filterLabel })}>复制当前报告</SoftButton>
          <SoftButton variant="danger" className="w-full justify-start" icon={AlertTriangle} disabled={!failedFilteredTasks.length} onClick={() => runBulkAction("copy-failed-download-summary", { taskIds: filteredTaskIds, filterLabel })}>复制失败摘要</SoftButton>
          <SoftButton variant="amber" className="w-full justify-start" icon={RefreshCw} disabled={!retryMovieIds.length || retrying} onClick={retryFilteredFailedTasks}>节流重试失败项</SoftButton>
          <SoftButton variant="danger" className="w-full justify-start" icon={Trash2} disabled={!tasks.length} onClick={() => { setShowBulkActions(false); setDeleteTarget({ type: "all" }); }}>清空全部任务</SoftButton>
        </div>
      </ModalSheet>

      <ModalSheet
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === "all" ? "确认清空全部下载任务？" : "确认删除这个下载任务？"}
        footer={<div className="grid grid-cols-2 gap-2"><SoftButton variant="secondary" className="w-full" onClick={() => setDeleteTarget(null)}>取消</SoftButton><SoftButton variant="danger" className="w-full" icon={Trash2} onClick={confirmDelete}>确认删除</SoftButton></div>}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-50 text-danger-500"><AlertTriangle size={18} /></span>
          <p className="text-[13px] leading-6 text-slate-600">{deleteTarget?.type === "all" ? `将清空 ${tasks.length} 个任务的插件记录；已经保存到设备的文件不会被删除。` : `将删除“${deleteTarget?.type === "task" ? downloadTitle(deleteTarget.task) : "该任务"}”的插件记录；已经保存到设备的文件不会被删除。`}</p>
        </div>
      </ModalSheet>
    </PageShell>
  );
}
