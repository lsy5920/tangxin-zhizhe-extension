import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HardDrive, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { BridgeState } from "../../types";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

function formatBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function CinemaStorageView({ state, onAction }: Props) {
  const audit = state.experience?.storageAudit;
  const cleanable = useMemo(() => (audit?.entries || []).filter((entry) => !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || ""))), [audit]);
  const [selected, setSelected] = useState<string[]>([]);
  const storage = audit?.storage;
  const keyFor = (taskId: string, attemptId: string) => `${taskId}:${attemptId}`;

  return (
    <div className="txzz-stream-storage-page">
      <header className="txzz-stream-storage-lead">
        <div><span>OPFS STORAGE</span><h2>存储管家</h2><p>查看下载分片、可恢复任务、组装成品和残留文件；活动任务与待保存成品始终受保护。</p></div>
        <div><button type="button" onClick={() => onAction("run-storage-audit")}><RefreshCw size={14} />重新扫描</button><button type="button" disabled={!selected.length} onClick={() => onAction("cleanup-opfs-storage", { targets: selected })} className="is-danger"><Trash2 size={14} />安全清理{selected.length ? ` ${selected.length}` : ""}</button></div>
      </header>

      <section className="txzz-stream-storage-stats">
        <div><span>浏览器配额</span><strong>{storage?.known ? formatBytes(storage.quota || 0) : "无法检测"}</strong></div>
        <div><span>影院管理占用</span><strong>{formatBytes(audit?.managedBytes || 0)}</strong></div>
        <div className={audit?.lowSpace ? "is-danger" : "is-good"}><span>可用空间</span><strong>{storage?.known ? formatBytes(storage.available || 0) : "未提供"}</strong></div>
        <div className="is-warning"><span>可安全整理</span><strong>{cleanable.length}</strong></div>
      </section>

      {audit?.lowSpace && <div className="txzz-stream-storage-warning"><AlertTriangle size={18} /><div><strong>空间不足，新的下载任务已暂停启动</strong><p>可用空间低于 1 GiB、低于配额 15%，或不足下个任务预计空间的 115%。</p></div></div>}

      {!audit ? (
        <div className="txzz-stream-collection-empty"><HardDrive size={31} /><h3>还没有存储报告</h3><p>点击重新扫描，识别活动任务、恢复分片、成品、残留和孤儿文件。</p></div>
      ) : (
        <section className="txzz-stream-storage-files">
          <div className="txzz-stream-storage-files-head"><div><span>MANAGED FILES</span><h3>影院文件清单</h3></div><button type="button" disabled={!cleanable.length} onClick={() => setSelected(cleanable.map((entry) => keyFor(entry.taskId, entry.attemptId)))}>选择全部可清理项</button></div>
          <div className="txzz-stream-storage-file-list">
            {(audit.entries || []).map((entry) => {
              const key = keyFor(entry.taskId, entry.attemptId);
              const canClean = !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || ""));
              const label = entry.category === "artifact" ? "已组装成品" : entry.category === "resumable" ? "可恢复分片" : entry.category === "residue" ? "失败/取消残留" : entry.category === "duplicate" ? "疑似重复成品" : entry.category === "orphan" ? "孤儿文件" : "活动任务";
              return (
                <label key={key} className={`${entry.protected ? "is-protected" : ""} ${canClean ? "is-cleanable" : ""}`}>
                  <input type="checkbox" disabled={!canClean} checked={selected.includes(key)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((item) => item !== key))} />
                  <span>{entry.protected ? <ShieldCheck size={15} /> : canClean ? <Trash2 size={14} /> : <CheckCircle2 size={14} />}</span>
                  <div><strong>{entry.filename || entry.movieId || entry.taskId}</strong><small>{label}{entry.protected ? " · 已保护" : ""} · {formatBytes(entry.bytes || 0)}</small></div>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
