import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock3,
  Database,
  Download,
  Film,
  Gauge,
  HardDrive,
  ListOrdered,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X
} from "lucide-react";
import type { DownloadPlannerState } from "../../types";
import { portalIntoPluginUi, useModalFocusTrap } from "../ui/primitives";

type Props = {
  planner?: DownloadPlannerState | null;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

type PlanContract = {
  sourceId: string;
  networkMode: string;
  qualityHeight: number;
};

export function isDownloadPlanContractDirty(current: PlanContract, accepted: PlanContract) {
  return current.sourceId !== accepted.sourceId
    || current.networkMode !== accepted.networkMode
    || current.qualityHeight !== accepted.qualityHeight;
}

function formatBytes(value = 0) {
  if (!value) return "暂时无法估算";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** index)).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function estimateTime(bytes = 0) {
  const connection = navigator as Navigator & { connection?: { downlink?: number } };
  const megabits = Number(connection.connection?.downlink || 0);
  if (!bytes || !megabits) return "开始后显示实时速度";
  const seconds = Math.ceil((bytes * 8) / (megabits * 1_000_000));
  if (seconds < 60) return `约 ${seconds} 秒`;
  return `约 ${Math.ceil(seconds / 60)} 分钟`;
}

function acceptedQualityHeight(planner?: DownloadPlannerState | null) {
  return Number(planner?.qualityHeight || planner?.plan?.selectedVariant?.height || 0);
}

export function DownloadPlannerModal({ planner, onAction }: Props) {
  const [sourceId, setSourceId] = useState("");
  const [networkMode, setNetworkMode] = useState("balanced");
  const [qualityHeight, setQualityHeight] = useState(0);
  const [container, setContainer] = useState("mp4");
  const [priority, setPriority] = useState("normal");
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [acceptedContract, setAcceptedContract] = useState<PlanContract>({ sourceId: "", networkMode: "balanced", qualityHeight: 0 });
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closePlanner = () => onAction("close-download-planner");
  useModalFocusTrap(Boolean(planner?.open), closePlanner, dialogRef, closeButtonRef);

  useEffect(() => {
    if (!planner?.open) return;
    setPriority("normal");
    setScheduleMode("now");
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setScheduledAt(date.toISOString().slice(0, 16));
  }, [planner?.open, planner?.taskId, planner?.movieId]);

  useEffect(() => {
    if (!planner?.open) return;
    const nextContract = {
      sourceId: String(planner.source?.id || planner.lineKey || ""),
      networkMode: String(planner.networkMode || "balanced"),
      qualityHeight: acceptedQualityHeight(planner)
    };
    setSourceId(nextContract.sourceId);
    setNetworkMode(nextContract.networkMode);
    setQualityHeight(nextContract.qualityHeight);
    setAcceptedContract(nextContract);
    setContainer(planner.plan?.compatibleContainers?.includes("mp4")
      ? "mp4"
      : planner.plan?.compatibleContainers?.[0] || "mp4");
  }, [planner?.open, planner?.planTicket, planner?.source?.id, planner?.lineKey]);

  const variants = useMemo(() => [...(planner?.plan?.variants || [])]
    .filter((item) => !item.separateAudio)
    .sort((left, right) => Number(left.height || 0) - Number(right.height || 0)), [planner?.plan?.variants]);

  if (!planner?.open) return null;
  const plan = planner.plan || {};
  const blocked = Boolean(plan.blockedReason);
  const submitting = planner.phase === "submitting";
  const contractDirty = planner.phase === "ready" && isDownloadPlanContractDirty(
    { sourceId, networkMode, qualityHeight },
    acceptedContract
  );
  const startDisabled = blocked
    || submitting
    || contractDirty
    || !planner.planTicket
    || (scheduleMode === "scheduled" && !scheduledAt);

  const replan = () => onAction("plan-full-video-download", {
    movieId: planner.movieId || "",
    movieTitle: planner.movieTitle || "",
    sourceId,
    lineKey: sourceId || planner.lineKey || "auto",
    networkMode,
    qualityHeight
  });

  const startDownload = () => onAction("start-planned-download", {
    movieId: planner.movieId || "",
    movieTitle: planner.movieTitle || "",
    planTicket: planner.planTicket || "",
    sourceId,
    lineKey: sourceId || planner.lineKey || "auto",
    networkMode,
    qualityHeight,
    container,
    priority,
    notBefore: scheduleMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : ""
  });

  const layer = (
    <div className="txzz-download-planner-layer txzz-candy-interactive" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePlanner(); }}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txzz-download-planner-title"
        data-txzz-modal-sheet="true"
        className="txzz-download-planner-dialog"
      >
        <header className="txzz-download-planner-header">
          <span><Film size={20} /></span>
          <div>
            <small>OFFLINE DOWNLOAD</small>
            <h2 id="txzz-download-planner-title">{planner.movieTitle || `影片 ${planner.movieId}`}</h2>
            <p>确认片源、清晰度、文件格式与启动时间，再交给可恢复队列。</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={closePlanner} aria-label="关闭下载规划"><X size={18} /></button>
        </header>

        {planner.phase === "probing" ? (
          <div className="txzz-download-planner-state" role="status" aria-live="polite">
            <LoaderCircle size={36} className="animate-spin" />
            <strong>正在分析完整媒体</strong>
            <p>依次检查线路、主清单、音轨、分片和浏览器可用空间，完成前不会创建任务。</p>
            <ol><li className="is-active">线路</li><li>清单</li><li>空间</li><li>队列</li></ol>
          </div>
        ) : planner.phase === "submitting" ? (
          <div className="txzz-download-planner-state" role="status" aria-live="polite">
            <LoaderCircle size={36} className="animate-spin" />
            <strong>正在写入可恢复队列</strong>
            <p>后台正在原子创建任务和 OPFS 清单。写入成功后窗口会自动关闭。</p>
            <ol><li className="is-done">线路</li><li className="is-done">清单</li><li className="is-done">空间</li><li className="is-active">队列</li></ol>
          </div>
        ) : planner.phase === "error" ? (
          <div className="txzz-download-planner-state is-error" role="alert">
            <AlertTriangle size={36} />
            <strong>下载方案未完成</strong>
            <p>{planner.error || "线路或清单探测没有完成，请重新尝试。"}</p>
            <button type="button" onClick={replan}><RefreshCw size={14} />重新分析</button>
          </div>
        ) : (
          <div className="txzz-download-planner-content">
            <div className="txzz-download-planner-fields">
              <label><span><Gauge size={15} />片源线路</span><select name="cinema-download-source" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{(planner.sources || []).map((source) => <option key={source.id} value={source.id}>{source.label || source.id}</option>)}</select></label>
              <label><span><Database size={15} />网络策略</span><select name="cinema-download-network-mode" value={networkMode} onChange={(event) => setNetworkMode(event.target.value)}><option value="data-saver">省流 · 最高 720P</option><option value="balanced">均衡 · 适配设备</option><option value="high-quality">高清 · 最高画质</option></select></label>
              <label><span><Film size={15} />清晰度</span><select name="cinema-download-quality" value={qualityHeight} onChange={(event) => setQualityHeight(Number(event.target.value))}><option value={0}>按策略自动选择</option>{variants.map((variant) => <option key={variant.id || variant.height} value={variant.height || 0}>{variant.height ? `${variant.height}P` : variant.id}</option>)}</select></label>
              <label><span><HardDrive size={15} />文件格式</span><select name="cinema-download-container" value={container} onChange={(event) => setContainer(event.target.value)}>{(plan.compatibleContainers || ["mp4"]).map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>
              <label><span><ListOrdered size={15} />队列优先级</span><select name="cinema-download-priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="high">高 · 优先开始</option><option value="normal">普通 · 默认</option><option value="low">低 · 空闲时开始</option></select></label>
              <fieldset>
                <legend><CalendarClock size={15} />开始时间</legend>
                <div>
                  <button type="button" aria-pressed={scheduleMode === "now"} onClick={() => setScheduleMode("now")} className={scheduleMode === "now" ? "is-active" : ""}>尽快开始</button>
                  <button type="button" aria-pressed={scheduleMode === "scheduled"} onClick={() => setScheduleMode("scheduled")} className={scheduleMode === "scheduled" ? "is-active" : ""}>指定时间</button>
                </div>
                {scheduleMode === "scheduled" && <input name="cinema-download-start-at" aria-label="指定下载开始时间" type="datetime-local" value={scheduledAt} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} onChange={(event) => setScheduledAt(event.target.value)} />}
              </fieldset>
            </div>

            <dl className="txzz-download-planner-metrics">
              <div><dt>预计大小</dt><dd>{formatBytes(plan.estimatedBytes)}</dd></div>
              <div><dt>预计耗时</dt><dd><Clock3 size={13} />{estimateTime(plan.estimatedBytes)}</dd></div>
              <div><dt>可用空间</dt><dd>{plan.storage?.known ? formatBytes(plan.storage.available) : "启动时继续保护"}</dd></div>
              <div><dt>媒体清单</dt><dd>{plan.segmentCount ? `${plan.segmentCount} 段 · ${plan.container || "待识别"}` : "渐进式媒体"}</dd></div>
            </dl>

            <div className={`txzz-download-planner-check ${blocked || contractDirty ? "is-warning" : "is-ready"}`}>
              {blocked || contractDirty ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
              <div>
                <strong>{blocked ? "当前媒体不适合下载" : contractDirty ? "片源或画质已经修改" : "方案已通过兼容性检查"}</strong>
                <p>{plan.blockedReason || (contractDirty ? "点击“更新方案”，重新核对清单和空间后才能加入队列。" : `${plan.audioMode || "未知音轨"} · ${plan.container || "待识别容器"} · 创建时再次校验票据与空间`)}</p>
              </div>
              {!blocked && !contractDirty && <Check size={16} />}
            </div>

            <footer className="txzz-download-planner-actions">
              <button type="button" onClick={replan}><RefreshCw size={14} />{contractDirty ? "更新方案" : "重新估算"}</button>
              <button type="button" className="is-primary" disabled={startDisabled} onClick={startDownload}>
                <Download size={15} />{scheduleMode === "scheduled" ? "按计划加入下载队列" : "加入可恢复下载队列"}
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
  return portalIntoPluginUi(layer);
}
