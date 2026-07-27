import { useState } from "react";
import { Clock3, Copy, Download, ExternalLink, Film, Footprints, Route, Save } from "lucide-react";
import type { BridgeState, DownloadTask } from "../../types";
import type { PlaybackSession } from "../../playback/types";
import { formatDuration, maskUrl } from "../../helpers";

type Tab = "sources" | "download" | "history";

type Props = {
  state: BridgeState;
  session: PlaybackSession | null;
  history: PlaybackSession[];
  onSelectHistory: (session: PlaybackSession) => void;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

function downloadForMovie(tasks: Record<string, DownloadTask> | undefined, movieId?: string) {
  return Object.values(tasks || {}).find((task) => String(task.movieId) === String(movieId)) || null;
}

function healthTone(state?: string) {
  if (state === "healthy") return "bg-emerald-50 text-emerald-600";
  if (state === "failed") return "bg-rose-50 text-rose-600";
  if (state === "degraded") return "bg-amber-50 text-amber-600";
  return "bg-violet-50 text-violet-600";
}

export function ScreeningDrawer({ state, session, history, onSelectHistory, onAction }: Props) {
  const [tab, setTab] = useState<Tab>("sources");
  const task = downloadForMovie(state.downloadTasks, session?.movieId);
  const tabs = [
    { key: "sources" as const, label: "片源", icon: Route, badge: session?.sources.length || 0 },
    { key: "download" as const, label: "下载", icon: Download, badge: task ? 1 : 0 },
    { key: "history" as const, label: "足迹", icon: Footprints, badge: history.length }
  ];

  return (
    <section className="txzz-screening-drawer txzz-playback-hidden-during-fullscreen overflow-hidden rounded-[1.55rem] border border-white/80 bg-white/82 shadow-[0_18px_55px_rgba(113,70,160,.11)] backdrop-blur-xl">
      <div className="grid grid-cols-3 border-b border-violet-100/70 bg-gradient-to-r from-fuchsia-50/70 to-violet-50/70 p-1.5" role="tablist" aria-label="放映辅助抽屉">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-extrabold transition ${tab === key ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>
            <Icon size={14} />{label}<span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] text-violet-500">{badge}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[23rem] overflow-y-auto p-3 sm:p-4">
        {tab === "sources" && (
          <div className="space-y-2">
            {!session?.sources.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">检票后在这里查看完整线路</p>}
            {session?.sources.map((source) => {
              const completenessRecommended = source.id === session.decision.recommendedSourceId
                && session.decision.reasonCodes.includes("longer-playlist-duration");
              return (
              <article key={source.id} className="rounded-2xl border border-slate-100 bg-slate-50/65 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><strong className="block text-[12px] text-slate-800">{source.label}{completenessRecommended && <span className="ml-1.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[8px] text-fuchsia-600">完整版优先</span>}</strong><span className="mt-0.5 block truncate font-mono text-[9px] text-slate-400">{maskUrl(source.url)}</span></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${healthTone(source.health.state)}`}>{source.health.state === "healthy" ? "健康" : source.health.state === "failed" ? "异常" : source.health.state === "degraded" ? "降级" : "待验证"}{Number(source.health.duration || 0) > 0 ? ` · ${formatDuration(source.health.duration)}` : ""}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => onAction(source.id === "backup" ? "copy-backup-link" : "copy-play-link", { url: source.url, label: `${source.label}完整链接` })} className="min-h-10 rounded-xl bg-white text-[10px] font-bold text-violet-600 shadow-sm"><Copy size={12} className="mr-1 inline" />复制</button>
                  <button type="button" onClick={() => onAction("open-playback-url", { url: source.url, label: source.label })} className="min-h-10 rounded-xl bg-white text-[10px] font-bold text-sky-600 shadow-sm"><ExternalLink size={12} className="mr-1 inline" />打开</button>
                  <button type="button" onClick={() => onAction("download-full-video", { movieId: session.movieId, lineKey: source.id === "backup" ? "backup" : "play", url: source.url })} className="min-h-10 rounded-xl bg-violet-600 text-[10px] font-bold text-white shadow-sm"><Download size={12} className="mr-1 inline" />下载</button>
                </div>
              </article>
              );
            })}
          </div>
        )}

        {tab === "download" && (
          <div>
            {!session ? <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">暂无本场影片</p> : task ? (
              <article className="rounded-2xl border border-violet-100 bg-violet-50/55 p-4">
                <div className="flex items-center justify-between"><strong className="text-[12px] text-slate-800">{task.movieTitle || session.title}</strong><span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-violet-600">{task.stage || "准备中"}</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500" style={{ width: `${Math.max(0, Math.min(100, Number(task.percent || 0)))}%` }} /></div>
                <p className="mt-2 text-[10px] text-slate-500">{Math.round(Number(task.percent || 0))}% · {task.filename || "正在整理糖果片段"}</p>
                {task.stage === "ready" && <button type="button" onClick={() => onAction("save-download-device", { taskId: task.taskId })} className="mt-3 min-h-10 w-full rounded-xl bg-emerald-500 text-[10px] font-bold text-white"><Save size={13} className="mr-1 inline" />保存到设备</button>}
              </article>
            ) : (
              <button type="button" onClick={() => onAction("download-full-video", { movieId: session.movieId, lineKey: "auto" })} className="flex min-h-24 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/45 text-violet-600">
                <Download size={20} /><strong className="mt-2 text-[11px]">下载本场影片</strong><span className="mt-1 text-[9px] text-violet-400">自动选择健康线路</span>
              </button>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {!history.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">还没有放映足迹</p>}
            {[...history].reverse().map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectHistory(item)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${item.id === session?.id ? "border-violet-200 bg-violet-50" : "border-slate-100 bg-slate-50/65 hover:border-violet-150 hover:bg-violet-50/55"}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-500 shadow-sm"><Film size={16} /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-slate-800">{item.title}</strong><span className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><Clock3 size={10} />{new Date(item.fetchedAt).toLocaleString("zh-CN", { hour12: false })} · {item.sources.length} 线</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
