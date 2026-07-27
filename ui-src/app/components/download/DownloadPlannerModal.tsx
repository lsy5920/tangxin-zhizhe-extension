import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Database, Download, Film, Gauge, HardDrive, X } from "lucide-react";
import type { DownloadPlannerState } from "../../types";
import { SoftButton, useModalFocusTrap } from "../ui/primitives";

type Props = {
  planner?: DownloadPlannerState | null;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

function formatBytes(value = 0) {
  if (!value) return "暂时无法估算";
  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** index)).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function estimateTime(bytes = 0) {
  const connection = navigator as Navigator & { connection?: { downlink?: number } };
  const megabits = Number(connection.connection?.downlink || 0);
  if (!bytes || !megabits) return "网速未知，开始后显示实时速度";
  const seconds = Math.ceil((bytes * 8) / (megabits * 1_000_000));
  if (seconds < 60) return `约 ${seconds} 秒`;
  return `约 ${Math.ceil(seconds / 60)} 分钟`;
}

export function DownloadPlannerModal({ planner, onAction }: Props) {
  const [sourceId, setSourceId] = useState("");
  const [networkMode, setNetworkMode] = useState("balanced");
  const [qualityHeight, setQualityHeight] = useState(0);
  const [container, setContainer] = useState("mp4");
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closePlanner = () => onAction("close-download-planner");
  useModalFocusTrap(Boolean(planner?.open), closePlanner, dialogRef, closeButtonRef);

  useEffect(() => {
    if (!planner?.open) return;
    setSourceId(planner.source?.id || planner.lineKey || "");
    setQualityHeight(Number(planner.plan?.selectedVariant?.height || 0));
    setContainer(planner.plan?.compatibleContainers?.includes("mp4") ? "mp4" : planner.plan?.compatibleContainers?.[0] || "mp4");
  }, [planner?.open, planner?.taskId, planner?.source?.id, planner?.plan?.selectedVariant?.height]);

  const variants = useMemo(() => [...(planner?.plan?.variants || [])]
    .filter((item) => !item.separateAudio)
    .sort((left, right) => Number(left.height || 0) - Number(right.height || 0)), [planner?.plan?.variants]);
  if (!planner?.open) return null;
  const plan = planner.plan || {};
  const blocked = Boolean(plan.blockedReason);

  const replan = () => onAction("plan-full-video-download", {
    movieId: planner.movieId || "",
    sourceId,
    lineKey: sourceId || planner.lineKey || "auto",
    networkMode,
    qualityHeight
  });

  return (
    <div className="fixed inset-0 z-[2147483646] grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="txzz-download-planner-title" data-txzz-modal-sheet="true" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/80 bg-[#fffafd] p-5 shadow-2xl sm:max-w-2xl sm:rounded-[2rem] sm:p-7">
        <header className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-400 to-violet-500 text-white shadow-lg"><Film size={22} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-pink-500">下载前检票</p>
            <h2 id="txzz-download-planner-title" className="mt-1 truncate text-xl font-black text-slate-800">{planner.movieTitle || `视频 ${planner.movieId}`}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">确认线路、画质与容器；空间不足或清单不安全时不会启动。</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={closePlanner} className="grid size-10 place-items-center rounded-2xl bg-white text-slate-500 shadow-sm" aria-label="关闭下载规划"><X size={18} /></button>
        </header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl bg-violet-50 p-3 text-xs font-bold text-slate-600">
            <span className="mb-2 flex items-center gap-2 text-violet-600"><Gauge size={14} />片源线路</span>
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="min-h-11 w-full rounded-xl border border-violet-100 bg-white px-3 text-slate-700">
              {(planner.sources || []).map((source) => <option key={source.id} value={source.id}>{source.label || source.id}</option>)}
            </select>
          </label>
          <label className="rounded-2xl bg-sky-50 p-3 text-xs font-bold text-slate-600">
            <span className="mb-2 flex items-center gap-2 text-sky-600"><Database size={14} />下载模式</span>
            <select value={networkMode} onChange={(event) => setNetworkMode(event.target.value)} className="min-h-11 w-full rounded-xl border border-sky-100 bg-white px-3 text-slate-700">
              <option value="data-saver">省流 · 最高 720P / 2.5 Mbps</option>
              <option value="balanced">均衡 · 按设备尺寸</option>
              <option value="high-quality">高清 · 设备最高档</option>
            </select>
          </label>
          <label className="rounded-2xl bg-pink-50 p-3 text-xs font-bold text-slate-600">
            <span className="mb-2 flex items-center gap-2 text-pink-600"><Film size={14} />清晰度</span>
            <select value={qualityHeight} onChange={(event) => setQualityHeight(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-pink-100 bg-white px-3 text-slate-700">
              <option value={0}>按模式自动选择</option>
              {variants.map((variant) => <option key={variant.id || variant.height} value={variant.height || 0}>{variant.height ? `${variant.height}P` : variant.id}</option>)}
            </select>
          </label>
          <label className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-slate-600">
            <span className="mb-2 flex items-center gap-2 text-amber-600"><HardDrive size={14} />输出容器</span>
            <select value={container} onChange={(event) => setContainer(event.target.value)} className="min-h-11 w-full rounded-xl border border-amber-100 bg-white px-3 text-slate-700">
              {(plan.compatibleContainers || ["mp4"]).map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
            </select>
          </label>
        </div>

        <dl className="mt-4 grid gap-2 rounded-2xl border border-pink-100 bg-white p-4 text-xs sm:grid-cols-2">
          <div><dt className="text-slate-400">预计大小</dt><dd className="mt-1 font-black text-slate-700">{formatBytes(plan.estimatedBytes)}</dd></div>
          <div><dt className="text-slate-400">预计耗时</dt><dd className="mt-1 flex items-center gap-1 font-black text-slate-700"><Clock3 size={13} />{estimateTime(plan.estimatedBytes)}</dd></div>
          <div><dt className="text-slate-400">浏览器可用空间</dt><dd className="mt-1 font-black text-slate-700">{plan.storage?.known ? formatBytes(plan.storage.available) : "浏览器未提供，启动时继续保护"}</dd></div>
          <div><dt className="text-slate-400">清单兼容性</dt><dd className="mt-1 font-black text-slate-700">{plan.segmentCount ? `${plan.segmentCount} 段 · ${plan.container || "待识别"} · ${plan.audioMode || "未知音轨"}` : "渐进式媒体"}</dd></div>
        </dl>

        {blocked && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-600">{plan.blockedReason}</p>}
        <div className="mt-5 grid gap-2 sm:grid-cols-[auto_1fr]">
          <SoftButton variant="secondary" onClick={replan}>重新估算</SoftButton>
          <SoftButton icon={Download} disabled={blocked} onClick={() => onAction("start-planned-download", {
            movieId: planner.movieId || "",
            sourceId,
            lineKey: sourceId || planner.lineKey || "auto",
            networkMode,
            qualityHeight,
            container
          })}>放进可恢复下载队列</SoftButton>
        </div>
      </section>
    </div>
  );
}
