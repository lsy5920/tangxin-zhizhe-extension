import { Check, Clock3, Coins, Film, Heart, ListPlus, Route, ShieldCheck, Sparkles, Ticket, UserRound } from "lucide-react";
import type { PlaybackSession, ScreeningState } from "../../playback/types";
import type { LibraryEntry } from "../../types";

type Props = {
  session: PlaybackSession | null;
  request: ScreeningState["request"];
  onRefresh: () => void;
  libraryEntry?: LibraryEntry | null;
  onToggleFavorite: () => void;
  onToggleWatchLater: () => void;
};

function acquisitionLabel(mode?: PlaybackSession["acquisition"]["mode"]) {
  if (mode === "cache") return "糖罐缓存";
  if (mode === "purchased") return "金币解锁";
  if (mode === "legacy") return "旧票迁移";
  return "账号直取";
}

export function ScreeningSidebar({ session, request, onRefresh, libraryEntry, onToggleFavorite, onToggleWatchLater }: Props) {
  const resolving = request.phase === "resolving";
  const requestedMovieId = String(request.movieId || "");
  const requestedTitle = String(request.movieTitle || (requestedMovieId ? `影片 ${requestedMovieId}` : ""));
  const acquisition = session?.acquisition;
  const purchased = acquisition?.mode === "purchased";
  const steps = [
    { label: "识别本场影片", detail: session?.movieId ? `编号 ${session.movieId}` : requestedMovieId ? `编号 ${requestedMovieId}` : "等待选片", done: Boolean(session?.movieId || requestedMovieId), active: resolving && !session && !requestedMovieId },
    { label: "轮换可用账号", detail: session ? `已尝试 ${acquisition?.attempts || 1} 个账号` : "检查直链优先", done: Boolean(session), active: resolving },
    { label: purchased ? "安全核对金币" : "跳过金币购买", detail: purchased ? "账本已 resolved" : session ? "已有直链，禁止扣费" : "仅在全部锁定后进行", done: Boolean(session), active: false },
    { label: "送达放映线路", detail: session ? `${session.sources.length} 条可用线路` : "检票后可开映", done: Boolean(session?.sources.length), active: false }
  ];

  return (
    <aside className="txzz-screening-sidebar txzz-playback-hidden-during-fullscreen overflow-hidden rounded-[1.65rem] border border-white/75 bg-white/78 p-4 shadow-[0_20px_60px_rgba(113,70,160,.13)] backdrop-blur-xl sm:p-5">
      <div className="relative overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-[#fff3f8] via-[#f8efff] to-[#eee9ff] p-4">
        <span className="pointer-events-none absolute -right-5 -top-7 h-24 w-24 rounded-full bg-white/65 blur-xl" />
        <div className="relative flex items-start gap-3">
          <div className="txzz-ticket-mascot flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem] border border-white/80 bg-white/82 text-2xl shadow-sm" aria-hidden="true">🍬</div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[10px] font-black tracking-[.16em] text-violet-500"><Sparkles size={11} /> TANGTANG CHECK-IN</p>
            <h2 className="mt-1 line-clamp-2 text-[16px] font-black leading-snug text-slate-900">{session?.title || requestedTitle || "糖糖检票员等你入场"}</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{session ? "资源已备好，但不会自动播放。点画面中央“开映”才会正式放映。" : resolving ? "正在检查账号与完整线路；旧影片已经收起，不会串场。" : "从糖心影院选片，或打开网站影片详情，糖糖就会开始检票。"}</p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-fuchsia-600"><Ticket size={10} className="mr-1 inline" />{session ? acquisitionLabel(acquisition?.mode) : resolving ? "正在出票" : "等待电影票"}</span>
          {session?.account?.label && <span className="max-w-full truncate rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-violet-600"><UserRound size={10} className="mr-1 inline" />{session.account.label}</span>}
          {purchased && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-600"><Coins size={10} className="mr-1 inline" />幂等解锁</span>}
        </div>
        {session && (
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={libraryEntry?.favorite === true} onClick={onToggleFavorite} className={`min-h-10 rounded-xl border text-[10px] font-extrabold transition ${libraryEntry?.favorite ? "border-fuchsia-200 bg-fuchsia-500 text-white" : "border-white/80 bg-white/75 text-fuchsia-600 hover:bg-white"}`}>
              <Heart size={13} className={`mr-1 inline ${libraryEntry?.favorite ? "fill-white" : ""}`} />{libraryEntry?.favorite ? "已收藏" : "收藏影片"}
            </button>
            <button type="button" aria-pressed={libraryEntry?.watchLater === true} onClick={onToggleWatchLater} className={`min-h-10 rounded-xl border text-[10px] font-extrabold transition ${libraryEntry?.watchLater ? "border-violet-200 bg-violet-600 text-white" : "border-white/80 bg-white/75 text-violet-600 hover:bg-white"}`}>
              <ListPlus size={13} className="mr-1 inline" />{libraryEntry?.watchLater ? "已加入稍后看" : "稍后观看"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[12px] font-extrabold text-slate-800"><ShieldCheck size={14} className="text-violet-500" />检票进度</h3>
          <button type="button" onClick={onRefresh} disabled={resolving} className="min-h-9 rounded-xl bg-violet-50 px-3 text-[10px] font-bold text-violet-600 transition hover:bg-violet-100 disabled:opacity-50">
            {resolving ? "检票中…" : "重新检票"}
          </button>
        </div>
        <ol className="mt-3 space-y-2" aria-live="polite">
          {steps.map((step, index) => (
            <li key={step.label} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${step.active ? "border-violet-200 bg-violet-50/80" : step.done ? "border-emerald-100 bg-emerald-50/55" : "border-slate-100 bg-slate-50/70"}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${step.active ? "txzz-player-spinner border-violet-400 !h-7 !w-7" : step.done ? "bg-emerald-500 text-white" : "bg-white text-slate-400"}`}>
                {!step.active && (step.done ? <Check size={13} /> : index + 1)}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-slate-700">{step.label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-400">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        {request.phase === "error" && (
          <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-[10px] leading-5 text-rose-600" role="alert">{request.error || "检票失败，请稍后重试"}</p>
        )}
      </div>

      {session && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5"><Film size={13} className="text-fuchsia-500" /><span className="mt-1 block text-[10px] text-slate-400">本场编号</span><strong className="block truncate text-[11px] text-slate-700">{session.movieId}</strong></div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5"><Route size={13} className="text-violet-500" /><span className="mt-1 block text-[10px] text-slate-400">线路决策</span><strong className="block truncate text-[11px] text-slate-700">{session.sources.length} 线 · 可切换</strong></div>
          <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2.5"><Clock3 size={13} className="text-sky-500" /><span className="mt-1 block text-[10px] text-slate-400">电影票时间</span><strong className="block truncate text-[11px] text-slate-700">{new Date(session.fetchedAt).toLocaleString("zh-CN", { hour12: false })}</strong></div>
        </div>
      )}
    </aside>
  );
}
