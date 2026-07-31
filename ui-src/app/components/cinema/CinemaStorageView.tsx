import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Database, HardDrive, PieChart, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
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
  const quota = Number(storage?.quota || 0);
  const used = Number(storage?.usage || 0);
  const ratio = storage?.known && quota > 0 ? Math.max(0, Math.min(100, Math.round((used / quota) * 100))) : 0;

  return (
    <div className="txzz-cinema58-storage-page">
      <header className="txzz-cinema58-storage-lead">
        <div className="txzz-cinema58-storage-title"><i><HardDrive size={27} /></i><div><span>OPFS STORAGE</span><h2>存储管家</h2><p>识别下载分片、可恢复任务、组装成品与残留；活动任务和待保存成品始终受保护。</p></div></div>
        <div><button type="button" onClick={() => onAction("run-storage-audit")}><RefreshCw size={15} />重新扫描</button><button type="button" disabled={!selected.length} onClick={() => onAction("cleanup-opfs-storage", { targets: selected })} className="is-danger"><Trash2 size={15} />安全清理{selected.length ? ` ${selected.length}` : ""}</button></div>
      </header>

      <div className="txzz-cinema58-storage-overview">
        <section className="txzz-cinema58-storage-gauge">
          <div className="txzz-cinema58-storage-ring" style={{ "--txzz-storage-ratio": `${ratio * 3.6}deg` } as CSSProperties}><span><strong>{storage?.known ? ratio : "--"}</strong><small>{storage?.known ? "% 已用" : "未检测"}</small></span></div>
          <div><span>浏览器空间</span><h3>{storage?.known ? `${formatBytes(used)} / ${formatBytes(quota)}` : "浏览器未提供配额"}</h3><p>{storage?.known ? `当前可用 ${formatBytes(storage.available || 0)}` : "仍可管理影院已经识别的文件。"}</p></div>
        </section>
        <section className="txzz-cinema58-storage-stats">
          <div><i><Database size={16} /></i><span>影院管理占用<small>分片与成品</small></span><strong>{formatBytes(audit?.managedBytes || 0)}</strong></div>
          <div className={audit?.lowSpace ? "is-danger" : "is-good"}><i><PieChart size={16} /></i><span>可用空间<small>{audit?.lowSpace ? "已阻止新任务" : "空间状态正常"}</small></span><strong>{storage?.known ? formatBytes(storage.available || 0) : "未提供"}</strong></div>
          <div className="is-warning"><i><Trash2 size={16} /></i><span>可安全整理<small>不含活动任务</small></span><strong>{cleanable.length}</strong></div>
        </section>
      </div>

      {audit?.lowSpace && <div className="txzz-cinema58-storage-warning"><AlertTriangle size={19} /><div><strong>空间不足，新的下载任务已暂停启动</strong><p>可用空间低于 1 GiB、低于配额 15%，或不足下个任务预计空间的 115%。</p></div></div>}

      {!audit ? (
        <div className="txzz-cinema58-collection-empty"><i><HardDrive size={31} /></i><h3>还没有存储报告</h3><p>点击重新扫描，识别活动任务、恢复分片、成品、残留和孤儿文件。</p><button type="button" onClick={() => onAction("run-storage-audit")}><RefreshCw size={14} />开始扫描</button></div>
      ) : (
        <section className="txzz-cinema58-storage-files">
          <header><div><span>MANAGED FILES</span><h3>影院文件清单</h3><p>勾选审计确认的可清理项；受保护文件保持只读。</p></div><button type="button" disabled={!cleanable.length} onClick={() => setSelected(cleanable.map((entry) => keyFor(entry.taskId, entry.attemptId)))}>选择全部可清理项</button></header>
          <div className="txzz-cinema58-storage-file-list">
            {(audit.entries || []).map((entry) => {
              const key = keyFor(entry.taskId, entry.attemptId);
              const canClean = !entry.protected && ["orphan", "residue", "duplicate"].includes(String(entry.category || ""));
              const label = entry.category === "artifact" ? "已组装成品" : entry.category === "resumable" ? "可恢复分片" : entry.category === "residue" ? "失败/取消残留" : entry.category === "duplicate" ? "疑似重复成品" : entry.category === "orphan" ? "孤儿文件" : "活动任务";
              return (
                <label key={key} className={`${entry.protected ? "is-protected" : ""} ${canClean ? "is-cleanable" : ""}`}>
                  <input name={`cinema-storage-select-${key}`} aria-label={`选择文件 ${entry.filename || entry.movieId || entry.taskId}`} type="checkbox" disabled={!canClean} checked={selected.includes(key)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((item) => item !== key))} />
                  <span>{entry.protected ? <ShieldCheck size={16} /> : canClean ? <Trash2 size={15} /> : <CheckCircle2 size={15} />}</span>
                  <div><strong>{entry.filename || entry.movieId || entry.taskId}</strong><small>{label}{entry.protected ? " · 已保护" : ""}</small></div>
                  <em>{formatBytes(entry.bytes || 0)}</em>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
