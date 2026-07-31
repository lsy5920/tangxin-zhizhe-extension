import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
    <div className="txzz-cinema58-download-page">
      <header className="txzz-cinema58-download-lead">
        <div className="txzz-cinema58-download-title"><i><Download size={27} /></i><div><span>OFFLINE CINEMA</span><h2>离线下载</h2><p>规划、调度、暂停恢复、组装与保存都在影院完成；后台只接管你确认过的任务。</p></div></div>
        <div className="txzz-cinema58-download-lead-actions">
          <button type="button" onClick={onOpenStorage}><HardDrive size={15} />存储管家{storageIssues > 0 && <em>{storageIssues}</em>}</button>
          <button type="button" onClick={() => onAction("open-download-folder")}><FolderOpen size={15} />下载文件夹</button>
          <button type="button" disabled={!readyTaskIds.length} onClick={() => onAction("save-ready-downloads", { taskIds: readyTaskIds })} className="is-primary"><Save size={15} />保存可用项{readyTaskIds.length ? ` ${readyTaskIds.length}` : ""}</button>
        </div>
      </header>

      <div className="txzz-cinema58-download-dashboard">
        <section className="txzz-cinema58-download-stats" aria-label="下载统计">
          <div><i><Download size={16} /></i><span>全部任务<small>当前队列</small></span><strong>{stats.total}</strong></div>
          <div><i><RefreshCw size={16} /></i><span>正在执行<small>{queuePaused ? "队列已暂停" : "调度运行中"}</small></span><strong>{stats.running}</strong></div>
          <div><i><Save size={16} /></i><span>已保存<small>可离线观看</small></span><strong>{stats.completed}</strong></div>
          <div className={stats.failed ? "is-warning" : ""}><i><AlertTriangle size={16} /></i><span>需要处理<small>失败或过期</small></span><strong>{stats.failed}</strong></div>
        </section>

        <section className="txzz-cinema58-scheduler">
          <div className="txzz-cinema58-scheduler-title"><span><i><Settings2 size={16} /></i><strong>智能调度<small>控制并发、开始时段与安全清理</small></strong></span><em className={queuePaused ? "is-paused" : "is-running"}>{queuePaused ? "队列已暂停" : "调度运行中"}</em></div>
          <div className="txzz-cinema58-scheduler-grid">
            <label><span>最大并发</span><select name="cinema-download-max-concurrent" value={maxConcurrent} onChange={(event) => setMaxConcurrent(Number(event.target.value))}><option value={1}>1 · 稳定</option><option value={2}>2 · 均衡</option><option value={3}>3 · 高性能</option></select></label>
            <div className="txzz-cinema58-schedule-window"><label><span>限定新任务开始时段</span><input name="cinema-download-window-enabled" type="checkbox" checked={windowEnabled} onChange={(event) => setWindowEnabled(event.target.checked)} /></label><div><input name="cinema-download-window-start" aria-label="下载时段开始时间" type="time" disabled={!windowEnabled} value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /><input name="cinema-download-window-end" aria-label="下载时段结束时间" type="time" disabled={!windowEnabled} value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} /></div></div>
            <label className="txzz-cinema58-cleanup-toggle"><span>自动整理旧残留<input name="cinema-download-auto-cleanup" type="checkbox" checked={autoCleanup} onChange={(event) => setAutoCleanup(event.target.checked)} /></span><small>只清理审计确认的孤儿与失败残留。</small></label>
            <div className="txzz-cinema58-scheduler-actions"><button type="button" onClick={() => onAction(queuePaused ? "resume-download-queue" : "pause-download-queue")}>{queuePaused ? <Play size={13} /> : <Pause size={13} />}{queuePaused ? "继续队列" : "暂停队列"}</button><button type="button" onClick={savePolicy} className="is-primary"><Save size={13} />保存策略</button></div>
          </div>
        </section>
      </div>

      <section className="txzz-cinema58-download-list-section">
        <header><div><span>DOWNLOAD QUEUE</span><h3>任务队列</h3></div><small>到期时间 → 优先级 → 创建时间</small></header>
        <div className="txzz-cinema58-download-tools">
          <nav>{filterItems.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={filter === item.id ? "is-active" : ""}>{item.label}<span>{item.count}</span></button>)}</nav>
          <label><Search size={14} /><input name="cinema-download-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索影片、编号、任务或错误" /></label>
          <select name="cinema-download-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as DownloadSort)} aria-label="下载任务排序"><option value="updated">最近更新</option><option value="failed">失败优先</option><option value="progress">进度优先</option><option value="size">文件大小</option></select>
          <button type="button" onClick={() => onAction("refresh-downloads")}><RefreshCw size={13} />刷新</button>
        </div>

        {failedGroups.length > 0 && <div className="txzz-cinema58-failure-summary"><AlertTriangle size={17} /><div><strong>有任务需要重新规划</strong><span>{failedGroups.slice(0, 2).map(([reason, rows]) => `${rows.length}× ${reason}`).join("；")}</span></div><button type="button" onClick={() => onAction("copy-failed-download-summary", { taskIds: filteredTasks.filter((task) => task.stage === "error").map((task) => task.taskId).filter(Boolean), filterLabel: "需处理" })}><Copy size={13} />复制诊断</button></div>}

        <div className="txzz-cinema58-download-task-list">
          {filteredTasks.map((task) => {
            const progress = downloadProgress(task);
            const taskId = task.taskId || "";
            const retryable = ["error", "stale"].includes(String(task.stage || ""));
            return (
              <article key={taskId || task.movieId || task.url} className={taskTone(task)}>
                <div className="txzz-cinema58-download-progress-ring" style={{ "--txzz-download-progress": `${progress * 3.6}deg` } as CSSProperties}><span>{progress}<small>%</small></span></div>
                <div className="txzz-cinema58-download-task-main">
                  <div className="txzz-cinema58-download-task-head"><div><span>影片 #{task.movieId || "UNKNOWN"}</span><h4>{downloadTitle(task)}</h4><small>{taskId || "等待任务编号"} · {shortTime(task.updatedAt)}</small></div><em className={taskTone(task)}>{downloadStageLabel(task.stage)}</em></div>
                  <div className="txzz-cinema58-download-tags"><span>{downloadFormat(task)}</span><span>{downloadLineLabel(task.lineKey)}</span><span>{priorityLabel(task.priority)}</span>{task.notBefore && <span><CalendarClock size={10} />{new Date(task.notBefore).toLocaleString("zh-CN", { hour12: false })}</span>}</div>
                  {task.stage !== "complete" && <div className="txzz-cinema58-download-progress"><div><span>{task.totalBytes ? `${formatBytes(task.bytes || 0)} / ${formatBytes(task.totalBytes)}` : task.bytes ? formatBytes(task.bytes) : "等待体积统计"}</span><strong>{downloadSpeedText(task) || "等待速度"}</strong></div><span><i style={{ width: `${progress}%` }} /></span></div>}
                  {(task.error || task.transmuxError) && <p className="txzz-cinema58-task-error"><AlertTriangle size={12} />{task.error || task.transmuxError}</p>}
                  {["queued", "paused", "stale", "error"].includes(String(task.stage || "")) && <div className="txzz-cinema58-task-config"><label>优先级<select name={`cinema-download-task-priority-${taskId}`} value={task.priority || "normal"} onChange={(event) => onAction("configure-download-task", { taskId, priority: event.target.value, notBefore: task.notBefore || "" })}><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label><label>指定开始时间<input name={`cinema-download-task-start-${taskId}`} type="datetime-local" defaultValue={localDateTimeInput(task.notBefore)} onBlur={(event) => onAction("configure-download-task", { taskId, priority: task.priority || "normal", notBefore: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label></div>}
                  <div className="txzz-cinema58-task-actions">
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

        {!filteredTasks.length && <div className="txzz-cinema58-collection-empty"><i><Download size={31} /></i><h3>{tasks.length ? "没有符合条件的任务" : "下载队列还是空的"}</h3><p>{tasks.length ? "切换筛选或清除搜索词。" : "从影片详情或播放页点击下载，完成规划后任务会出现在这里。"}</p></div>}
        {tasks.length > 0 && <div className="txzz-cinema58-download-footer"><span>删除会先停止网络请求并清理 OPFS，再移除任务记录。</span><button type="button" onClick={() => setDeleteTarget("all")}><Trash2 size={12} />清空任务</button></div>}
      </section>

      {deleteTarget && <div className="txzz-cinema58-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><div role="dialog" aria-modal="true" aria-labelledby="txzz-cinema58-delete-title"><i><AlertTriangle size={23} /></i><h3 id="txzz-cinema58-delete-title">{deleteTarget === "all" ? "清空全部下载任务？" : "删除这个下载任务？"}</h3><p>活动请求会先中止；OPFS 清理成功后才移除任务元数据，已保存到设备的文件不受影响。</p><div><button type="button" onClick={() => setDeleteTarget(null)}>取消</button><button type="button" onClick={confirmDelete} className="is-danger">确认删除</button></div></div></div>}
    </div>
  );
}
