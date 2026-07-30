import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2
} from "lucide-react";
import type { BridgeState, DownloadTask } from "../../types";
import {
  canSaveDownload,
  downloadFormat,
  downloadLineLabel,
  downloadProgress,
  downloadSpeedText,
  downloadStageLabel,
  downloadStats,
  downloadTasks,
  downloadTitle,
  formatBytes,
  shortTime
} from "../../helpers";
import { groupDownloadFailures, selectDownloadTasks, type DownloadFilter, type DownloadSort } from "../../domain/downloads";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onOpenStorage: () => void;
};

function localDateTimeInput(value?: string) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function taskTone(task: DownloadTask) {
  if (["ready", "complete"].includes(String(task.stage))) return "is-success";
  if (task.stage === "error") return "is-error";
  if (task.stage === "paused" || task.stage === "stale") return "is-warning";
  return "is-active";
}

function priorityLabel(priority?: string) {
  if (priority === "high") return "高优先";
  if (priority === "low") return "低优先";
  return "普通优先";
}

export function CinemaDownloadView({ state, onAction, onOpenStorage }: Props) {
  const tasks = downloadTasks(state);
  const stats = downloadStats(tasks);
  const [filter, setFilter] = useState<DownloadFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<DownloadSort>("updated");
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("00:00");
  const [windowEnd, setWindowEnd] = useState("23:59");
  const [autoCleanup, setAutoCleanup] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DownloadTask | "all" | null>(null);

  useEffect(() => {
    const policy = state.experience?.downloadPolicy;
    setMaxConcurrent(Math.max(1, Math.min(3, Number(policy?.maxConcurrent || 1))));
    setWindowEnabled(policy?.windowEnabled === true);
    setWindowStart(policy?.windowStart || "00:00");
    setWindowEnd(policy?.windowEnd || "23:59");
    setAutoCleanup(policy?.autoCleanup === true);
  }, [state.experience?.downloadPolicy]);

  const filteredTasks = useMemo(() => selectDownloadTasks(tasks, filter, searchText, sortMode), [filter, searchText, sortMode, tasks]);
  const readyTaskIds = filteredTasks.filter(canSaveDownload).map((task) => task.taskId || "").filter(Boolean);
  const failedGroups = groupDownloadFailures(filteredTasks);
  const queuePaused = state.experience?.downloadPolicy?.queuePaused === true;
  const storageIssues = (state.experience?.storageAudit?.entries || []).filter((entry) => !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || ""))).length;
  const filterItems: Array<{ id: DownloadFilter; label: string; count: number }> = [
    { id: "all", label: "全部", count: stats.total },
    { id: "running", label: "进行中", count: stats.running },
    { id: "ready", label: "可保存", count: tasks.filter(canSaveDownload).length },
    { id: "failed", label: "需处理", count: stats.failed }
  ];

  const savePolicy = () => onAction("save-experience-settings", { downloadPolicy: { maxConcurrent, windowEnabled, windowStart, windowEnd, autoCleanup } });
  const confirmDelete = () => {
    if (deleteTarget === "all") onAction("clear-downloads", { confirmed: true });
    else if (deleteTarget) onAction("remove-download-task", { taskId: deleteTarget.taskId || "", movieId: deleteTarget.movieId || "" });
    setDeleteTarget(null);
  };

  return (
    <div className="txzz-stream-download-page">
      <header className="txzz-stream-download-lead">
        <div><span>OFFLINE CINEMA</span><h2>离线下载</h2><p>规划、调度、暂停恢复、组装与保存都在影院完成。后台只恢复你确认过的任务。</p></div>
        <div className="txzz-stream-download-lead-actions">
          <button type="button" onClick={onOpenStorage}><HardDrive size={15} />存储管家{storageIssues > 0 && <em>{storageIssues}</em>}</button>
          <button type="button" onClick={() => onAction("open-download-folder")}><FolderOpen size={15} />下载文件夹</button>
          <button type="button" disabled={!readyTaskIds.length} onClick={() => onAction("save-ready-downloads", { taskIds: readyTaskIds })} className="is-primary"><Save size={15} />保存可用项{readyTaskIds.length ? ` ${readyTaskIds.length}` : ""}</button>
        </div>
      </header>

      <section className="txzz-stream-download-stats">
        <div><span>全部任务</span><strong>{stats.total}</strong></div><div><span>正在执行</span><strong>{stats.running}</strong></div><div><span>已保存</span><strong>{stats.completed}</strong></div><div><span>需要处理</span><strong>{stats.failed}</strong></div>
      </section>

      <section className="txzz-stream-scheduler">
        <div className="txzz-stream-scheduler-title"><span><Settings2 size={15} /><strong>智能调度</strong><small>控制并发、开始时段与安全清理</small></span><em className={queuePaused ? "is-paused" : "is-running"}>{queuePaused ? "队列已暂停" : "调度运行中"}</em></div>
        <div className="txzz-stream-scheduler-grid">
          <label><span>最大并发</span><select value={maxConcurrent} onChange={(event) => setMaxConcurrent(Number(event.target.value))}><option value={1}>1 · 稳定</option><option value={2}>2 · 均衡</option><option value={3}>3 · 高性能</option></select></label>
          <div className="txzz-stream-schedule-window"><label><span>限定新任务开始时段</span><input type="checkbox" checked={windowEnabled} onChange={(event) => setWindowEnabled(event.target.checked)} /></label><div><input type="time" disabled={!windowEnabled} value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /><input type="time" disabled={!windowEnabled} value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} /></div></div>
          <label className="txzz-stream-cleanup-toggle"><span>自动整理旧残留<input type="checkbox" checked={autoCleanup} onChange={(event) => setAutoCleanup(event.target.checked)} /></span><small>只清理审计确认的孤儿与失败残留。</small></label>
          <div className="txzz-stream-scheduler-actions"><button type="button" onClick={() => onAction(queuePaused ? "resume-download-queue" : "pause-download-queue")}>{queuePaused ? <Play size={13} /> : <Pause size={13} />}{queuePaused ? "继续队列" : "暂停队列"}</button><button type="button" onClick={savePolicy} className="is-primary"><Save size={13} />保存策略</button></div>
        </div>
      </section>

      <section className="txzz-stream-download-list-section">
        <div className="txzz-stream-download-tools">
          <nav>{filterItems.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={filter === item.id ? "is-active" : ""}>{item.label}<span>{item.count}</span></button>)}</nav>
          <label><Search size={14} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索影片、编号、任务或错误" /></label>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as DownloadSort)} aria-label="下载任务排序"><option value="updated">最近更新</option><option value="failed">失败优先</option><option value="progress">进度优先</option><option value="size">文件大小</option></select>
          <button type="button" onClick={() => onAction("refresh-downloads")}><RefreshCw size={13} />刷新</button>
        </div>

        {failedGroups.length > 0 && <div className="txzz-stream-failure-summary"><AlertTriangle size={16} /><div><strong>有任务需要重新规划</strong><span>{failedGroups.slice(0, 2).map(([reason, rows]) => `${rows.length}× ${reason}`).join("；")}</span></div><button type="button" onClick={() => onAction("copy-failed-download-summary", { taskIds: filteredTasks.filter((task) => task.stage === "error").map((task) => task.taskId).filter(Boolean), filterLabel: "需处理" })}><Copy size={13} />复制诊断</button></div>}

        <div className="txzz-stream-download-task-list">
          {filteredTasks.map((task) => {
            const progress = downloadProgress(task);
            const taskId = task.taskId || "";
            const retryable = ["error", "stale"].includes(String(task.stage || ""));
            return (
              <article key={taskId || task.movieId || task.url}>
                <div className="txzz-stream-download-task-head"><div><span>影片 #{task.movieId || "UNKNOWN"}</span><h3>{downloadTitle(task)}</h3><small>{taskId || "等待任务编号"} · {shortTime(task.updatedAt)}</small></div><em className={taskTone(task)}>{downloadStageLabel(task.stage)}</em></div>
                <div className="txzz-stream-download-task-body">
                  <div className="txzz-stream-download-tags"><span>{downloadFormat(task)}</span><span>{downloadLineLabel(task.lineKey)}</span><span>{priorityLabel(task.priority)}</span>{task.notBefore && <span><CalendarClock size={10} />{new Date(task.notBefore).toLocaleString("zh-CN", { hour12: false })}</span>}</div>
                  {task.stage !== "complete" && <div className="txzz-stream-download-progress"><div><span>{task.totalBytes ? `${formatBytes(task.bytes || 0)} / ${formatBytes(task.totalBytes)}` : task.bytes ? formatBytes(task.bytes) : "等待体积统计"}</span><strong>{progress}%{downloadSpeedText(task) ? ` · ${downloadSpeedText(task)}` : ""}</strong></div><span><i style={{ width: `${progress}%` }} /></span></div>}
                  {(task.error || task.transmuxError) && <p className="txzz-stream-task-error"><AlertTriangle size={12} />{task.error || task.transmuxError}</p>}
                  {["queued", "paused", "stale", "error"].includes(String(task.stage || "")) && <div className="txzz-stream-task-config"><label>优先级<select value={task.priority || "normal"} onChange={(event) => onAction("configure-download-task", { taskId, priority: event.target.value, notBefore: task.notBefore || "" })}><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label><label>指定开始时间<input type="datetime-local" defaultValue={localDateTimeInput(task.notBefore)} onBlur={(event) => onAction("configure-download-task", { taskId, priority: task.priority || "normal", notBefore: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label></div>}
                  <div className="txzz-stream-task-actions">
                    {retryable && <button type="button" disabled={!task.movieId} onClick={() => onAction("plan-full-video-download", { movieId: task.movieId || "", movieTitle: downloadTitle(task), lineKey: task.lineKey || "auto" })}><RefreshCw size={12} />重新规划</button>}
                    {["queued", "probing", "downloading", "recovering", "assembling"].includes(String(task.stage)) && <button type="button" onClick={() => onAction("pause-download-task", { taskId })}><Pause size={12} />暂停</button>}
                    {task.stage === "paused" && <button type="button" onClick={() => onAction("resume-download-task", { taskId })}><Play size={12} />继续</button>}
                    {["queued", "probing", "downloading", "paused", "recovering", "assembling"].includes(String(task.stage)) && <button type="button" onClick={() => onAction("cancel-download-task", { taskId })} className="is-danger"><Ban size={12} />取消</button>}
                    <button type="button" disabled={!canSaveDownload(task)} onClick={() => onAction("save-download-device", { taskId })} className="is-primary"><Save size={12} />保存到设备</button>
                    {task.url && <button type="button" onClick={() => onAction("copy-download-url", { taskId })} aria-label="复制下载链接"><Copy size={13} /></button>}
                    <button type="button" onClick={() => setDeleteTarget(task)} className="is-danger" aria-label="删除任务"><Trash2 size={13} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!filteredTasks.length && <div className="txzz-stream-collection-empty"><Download size={31} /><h3>{tasks.length ? "没有符合条件的任务" : "下载队列还是空的"}</h3><p>{tasks.length ? "切换筛选或清除搜索词。" : "从影片详情或播放页点击下载，完成规划后任务会出现在这里。"}</p></div>}
        {tasks.length > 0 && <div className="txzz-stream-download-footer"><span>删除会先停止网络请求并清理 OPFS，再移除任务记录。</span><button type="button" onClick={() => setDeleteTarget("all")}><Trash2 size={12} />清空任务</button></div>}
      </section>

      {deleteTarget && <div className="txzz-stream-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><div role="dialog" aria-modal="true" aria-labelledby="txzz-stream-delete-title"><AlertTriangle size={22} /><h3 id="txzz-stream-delete-title">{deleteTarget === "all" ? "清空全部下载任务？" : "删除这个下载任务？"}</h3><p>活动请求会先中止；OPFS 清理成功后才移除任务元数据，已保存到设备的文件不受影响。</p><div><button type="button" onClick={() => setDeleteTarget(null)}>取消</button><button type="button" onClick={confirmDelete} className="is-danger">确认删除</button></div></div></div>}
    </div>
  );
}
