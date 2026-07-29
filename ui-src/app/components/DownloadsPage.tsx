import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, CalendarClock, CheckCircle, Copy, Download, FolderOpen, HardDrive, Link, Loader, MoreHorizontal, Pause, Play, RefreshCw, Save, Search, Settings2, SortDesc, Trash2, XCircle } from "lucide-react";
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
  if (["queued", "probing", "downloading", "recovering", "assembling", "paused"].includes(String(task.stage || ""))) return { label: downloadStageLabel(task.stage), color: "bg-warning-50 text-warning-600", icon: <Download size={12} /> };
  return { label: downloadStageLabel(task.stage), color: "bg-info-50 text-info-600", icon: <Loader size={12} className="animate-spin" /> };
}

function localDateTimeInput(value?: string) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
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
  const [view, setView] = useState<"queue" | "storage">("queue");
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("00:00");
  const [windowEnd, setWindowEnd] = useState("23:59");
  const [autoCleanup, setAutoCleanup] = useState(false);
  const [selectedStorageKeys, setSelectedStorageKeys] = useState<string[]>([]);
  const retryGeneration = useRef(0);
  const readyCount = tasks.filter(canSaveDownload).length;

  useEffect(() => {
    const policy = state.experience?.downloadPolicy;
    setMaxConcurrent(Number(policy?.maxConcurrent || 1));
    setWindowEnabled(policy?.windowEnabled === true);
    setWindowStart(policy?.windowStart || "00:00");
    setWindowEnd(policy?.windowEnd || "23:59");
    setAutoCleanup(policy?.autoCleanup === true);
  }, [state.experience?.downloadPolicy]);

  useEffect(() => {
    const available = new Set((state.experience?.storageAudit?.entries || [])
      .filter((entry) => !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || "")))
      .map((entry) => `${entry.taskId}:${entry.attemptId}`));
    setSelectedStorageKeys((current) => current.filter((key) => available.has(key)));
  }, [state.experience?.storageAudit]);

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
  const storageAudit = state.experience?.storageAudit;
  const cleanableStorageEntries = (storageAudit?.entries || []).filter((entry) => !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || "")));

  const saveDownloadPolicy = () => onAction("save-experience-settings", {
    downloadPolicy: { maxConcurrent, windowEnabled, windowStart, windowEnd, autoCleanup }
  });

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

      <SegmentedControl
        items={[
          { key: "queue" as const, label: "智能队列", count: stats.total },
          { key: "storage" as const, label: "存储管家", count: storageAudit?.entries?.length || 0 }
        ]}
        value={view}
        onChange={setView}
      />

      {view === "queue" ? <>
      <SectionCard title="智能下载调度" icon={Settings2} hint="到期任务按优先级与创建时间进入可恢复下载内核">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-600">最大并发
            <select value={maxConcurrent} onChange={(event) => setMaxConcurrent(Number(event.target.value))} className="mt-2 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3"><option value={1}>1 · 最稳定</option><option value={2}>2 · 均衡</option><option value={3}>3 · 高性能</option></select>
          </label>
          <label className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-600"><span className="flex items-center justify-between">限定开始窗口<input type="checkbox" checked={windowEnabled} onChange={(event) => setWindowEnabled(event.target.checked)} className="size-4 accent-violet-600" /></span><span className="mt-2 grid grid-cols-2 gap-2"><input type="time" disabled={!windowEnabled} value={windowStart} onChange={(event) => setWindowStart(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 disabled:opacity-50" /><input type="time" disabled={!windowEnabled} value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 disabled:opacity-50" /></span></label>
          <label className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-600"><span className="flex items-center justify-between">7 天残留自动整理<input type="checkbox" checked={autoCleanup} onChange={(event) => setAutoCleanup(event.target.checked)} className="size-4 accent-violet-600" /></span><span className="mt-2 block text-[10px] font-normal leading-5 text-slate-400">只处理孤儿与失败残留，绝不删除活动任务或已完成成品。</span></label>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-violet-50 p-3">
            <SoftButton size="sm" variant="secondary" icon={Pause} onClick={() => onAction("pause-download-queue")}>暂停全部</SoftButton>
            <SoftButton size="sm" variant="sky" icon={Play} onClick={() => onAction("resume-download-queue")}>继续队列</SoftButton>
            <SoftButton size="sm" className="col-span-2" icon={Save} onClick={saveDownloadPolicy}>保存调度设置</SoftButton>
          </div>
        </div>
        {state.experience?.downloadPolicy?.queuePaused && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">队列已暂停，新任务仍会保存，但不会自动开始。</p>}
      </SectionCard>

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
                  <Pill className={task.priority === "high" ? "bg-danger-50 text-danger-600" : task.priority === "low" ? "bg-slate-100 text-slate-500" : "bg-violet-50 text-violet-600"}>{task.priority === "high" ? "高优先" : task.priority === "low" ? "低优先" : "普通优先"}</Pill>
                  {task.notBefore && <Pill className="bg-amber-50 text-amber-700"><CalendarClock size={10} />{new Date(task.notBefore).toLocaleString("zh-CN", { hour12: false })}</Pill>}
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
                {["queued", "paused", "stale", "error"].includes(String(task.stage || "")) && (
                  <div className="grid gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-2">
                    <label className="text-[9px] font-semibold text-slate-500">优先级<select value={task.priority || "normal"} onChange={(event) => onAction("configure-download-task", { taskId: task.taskId || "", priority: event.target.value, notBefore: task.notBefore || "" })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px]"><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label>
                    <label className="text-[9px] font-semibold text-slate-500">指定开始时间<input type="datetime-local" defaultValue={localDateTimeInput(task.notBefore)} onBlur={(event) => onAction("configure-download-task", { taskId: task.taskId || "", priority: task.priority || "normal", notBefore: event.target.value ? new Date(event.target.value).toISOString() : "" })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px]" /></label>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {task.stage === "error" && <SoftButton size="sm" variant="amber" icon={RefreshCw} disabled={!task.movieId} onClick={() => onAction("download-full-video", { movieId: task.movieId || "" })}>重试</SoftButton>}
                  {["queued", "probing", "downloading", "recovering", "assembling"].includes(String(task.stage)) && <SoftButton size="sm" variant="amber" icon={Pause} onClick={() => onAction("pause-download-task", { taskId: task.taskId || "" })}>暂停</SoftButton>}
                  {task.stage === "paused" && <SoftButton size="sm" variant="sky" icon={Play} onClick={() => onAction("resume-download-task", { taskId: task.taskId || "" })}>继续</SoftButton>}
                  {["queued", "probing", "downloading", "paused", "recovering", "assembling"].includes(String(task.stage)) && <SoftButton size="sm" variant="danger" icon={Ban} onClick={() => onAction("cancel-download-task", { taskId: task.taskId || "" })}>取消</SoftButton>}
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
      </> : (
        <SectionCard title="OPFS 存储管家" icon={HardDrive} hint={storageAudit?.checkedAt ? `最近扫描 ${shortTime(storageAudit.checkedAt)}` : "首次使用请先扫描浏览器私有文件系统"}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-[10px] text-slate-400">浏览器配额</span><strong className="mt-1 block text-[13px] text-slate-800">{storageAudit?.storage?.known ? formatBytes(storageAudit.storage.quota || 0) : "无法检测"}</strong></div>
            <div className="rounded-xl bg-violet-50 p-3"><span className="text-[10px] text-violet-400">插件管理占用</span><strong className="mt-1 block text-[13px] text-violet-700">{formatBytes(storageAudit?.managedBytes || 0)}</strong></div>
            <div className={`rounded-xl p-3 ${storageAudit?.lowSpace ? "bg-danger-50" : "bg-success-50"}`}><span className={`text-[10px] ${storageAudit?.lowSpace ? "text-danger-400" : "text-success-500"}`}>可用空间</span><strong className={`mt-1 block text-[13px] ${storageAudit?.lowSpace ? "text-danger-700" : "text-success-700"}`}>{storageAudit?.storage?.known ? formatBytes(storageAudit.storage.available || 0) : "浏览器未提供"}</strong></div>
          </div>
          {storageAudit?.lowSpace && <p className="mt-3 rounded-xl border border-danger-100 bg-danger-50 p-3 text-[11px] font-semibold text-danger-600">可用空间低于 1 GiB 或总配额的 15%，空间不足的新任务将自动暂停。</p>}
          <div className="mt-3 flex flex-wrap gap-2"><SoftButton size="sm" icon={RefreshCw} onClick={() => onAction("run-storage-audit")}>重新扫描</SoftButton><SoftButton size="sm" variant="danger" icon={Trash2} disabled={!selectedStorageKeys.length} onClick={() => onAction("cleanup-opfs-storage", { targets: selectedStorageKeys })}>安全清理所选（{selectedStorageKeys.length}）</SoftButton><SoftButton size="sm" variant="ghost" disabled={!cleanableStorageEntries.length} onClick={() => setSelectedStorageKeys(cleanableStorageEntries.map((entry) => `${entry.taskId}:${entry.attemptId}`))}>选择全部可清理项</SoftButton></div>
          <div className="mt-4 space-y-2">
            {!storageAudit && <EmptyState icon={HardDrive} title="还没有空间报告" desc="点击“重新扫描”统计活动任务、成品、可恢复分片和安全残留" />}
            {storageAudit?.entries?.map((entry) => {
              const key = `${entry.taskId}:${entry.attemptId}`;
              const cleanable = !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || ""));
              const label = entry.category === "artifact" ? "已组装成品" : entry.category === "resumable" ? "可恢复分片" : entry.category === "residue" ? "失败/取消残留" : entry.category === "duplicate" ? "疑似重复成品" : entry.category === "orphan" ? "孤儿文件" : "活动任务";
              return <label key={key} className={`flex items-center gap-3 rounded-xl border p-3 ${entry.protected ? "border-success-100 bg-success-50/60" : cleanable ? "border-warning-100 bg-warning-50/55" : "border-slate-100 bg-slate-50"}`}><input type="checkbox" disabled={!cleanable} checked={selectedStorageKeys.includes(key)} onChange={(event) => setSelectedStorageKeys((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((item) => item !== key))} className="size-4 shrink-0 accent-violet-600 disabled:opacity-30" /><span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-slate-700">{entry.filename || entry.movieId || entry.taskId}</strong><span className="mt-1 block truncate text-[9px] text-slate-400">{label}{entry.protected ? " · 正在使用，已保护" : ""} · {formatBytes(entry.bytes || 0)}</span></span></label>;
            })}
          </div>
        </SectionCard>
      )}

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
