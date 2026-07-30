import { Check, Clock3, Coins, Download, Heart, ListPlus, RefreshCw, Route, ShieldCheck, Ticket, UserRound } from "lucide-react";
import type { PlaybackSession, ScreeningState } from "../../playback/types";
import type { LibraryEntry } from "../../types";

type Props = {
  session: PlaybackSession | null;
  request: ScreeningState["request"];
  onRefresh: () => void;
  libraryEntry?: LibraryEntry | null;
  onToggleFavorite: () => void;
  onToggleWatchLater: () => void;
  onPlanDownload: () => void;
  onOpenDownloads?: () => void;
  playing?: boolean;
};

function acquisitionLabel(mode?: PlaybackSession["acquisition"]["mode"]) {
  if (mode === "cache") return "缓存复用";
  if (mode === "purchased") return "金币解锁";
  if (mode === "legacy") return "旧票迁移";
  return "账号直取";
}

export function ScreeningSidebar({ session, request, onRefresh, libraryEntry, onToggleFavorite, onToggleWatchLater, onPlanDownload, onOpenDownloads, playing = false }: Props) {
  const resolving = request.phase === "resolving";
  const requestedMovieId = String(request.movieId || "");
  const requestedTitle = String(request.movieTitle || (requestedMovieId ? `影片 ${requestedMovieId}` : ""));
  const acquisition = session?.acquisition;
  const attempts = Math.max(1, Number(acquisition?.attempts) || 1);
  const purchased = acquisition?.mode === "purchased";
  const steps = [
    { label: "锁定影片", detail: session?.movieId ? `编号 ${session.movieId}` : requestedMovieId ? `编号 ${requestedMovieId}` : "等待选片", done: Boolean(session?.movieId || requestedMovieId), active: resolving && Boolean(requestedMovieId) && !session },
    { label: "检查账号", detail: session ? `已检查 ${attempts} 个账号` : resolving ? "直链优先，逐个验证" : "等待检票", done: Boolean(session), active: resolving && Boolean(requestedMovieId) },
    { label: purchased ? "核对金币账本" : "确认无需购买", detail: purchased ? "购买状态已 resolved" : session ? "发现直链，禁止扣费" : "仅全部锁定后评估", done: Boolean(session), active: false },
    { label: "交付完整线路", detail: session ? `${session.sources.length} 条可用线路` : "检票完成后可开映", done: Boolean(session?.sources.length), active: false }
  ];

  return (
    <aside className="txzz-screening-sidebar txzz-stream-screening-sidebar">
      <header>
        <span className="txzz-stream-ticket-icon"><Ticket size={21} /></span>
        <div><small>SCREENING SESSION</small><h2>{session?.title || requestedTitle || "等待选择影片"}</h2><p>{session ? playing ? "正在放映；切换线路和选集会保留观看状态。" : "线路已经就绪，点击画面开始播放。" : resolving ? "正在核对账号、线路和媒体完整度。" : "请从影院详情页选择影片。"}</p></div>
      </header>

      <div className="txzz-stream-session-badges">
        <span><Ticket size={10} />{session ? acquisitionLabel(acquisition?.mode) : resolving ? "正在出票" : "等待电影票"}</span>
        {session?.account?.label && <span><UserRound size={10} />{session.account.label}</span>}
        {purchased && <span className="is-coin"><Coins size={10} />幂等解锁</span>}
      </div>

      {session && <div className="txzz-stream-session-actions"><button type="button" aria-pressed={libraryEntry?.favorite === true} onClick={onToggleFavorite} className={libraryEntry?.favorite ? "is-selected" : ""}><Heart size={13} fill={libraryEntry?.favorite ? "currentColor" : "none"} />{libraryEntry?.favorite ? "已收藏" : "收藏"}</button><button type="button" aria-pressed={libraryEntry?.watchLater === true} onClick={onToggleWatchLater} className={libraryEntry?.watchLater ? "is-selected" : ""}><ListPlus size={13} />{libraryEntry?.watchLater ? "已稍后看" : "稍后看"}</button><button type="button" onClick={onPlanDownload} className="is-primary"><Download size={13} />规划下载</button>{onOpenDownloads && <button type="button" onClick={onOpenDownloads}><Route size={13} />下载中心</button>}</div>}

      <section className="txzz-stream-ticket-progress">
        <div><h3><ShieldCheck size={14} />检票进度</h3><button type="button" onClick={onRefresh} disabled={resolving}><RefreshCw size={12} className={resolving ? "animate-spin" : ""} />{resolving ? "检票中" : "重新检票"}</button></div>
        <ol aria-live="polite">
          {steps.map((step, index) => <li key={step.label} className={`${step.active ? "is-active" : ""} ${step.done ? "is-done" : ""}`}><span>{step.active ? <i className="txzz-player-spinner" /> : step.done ? <Check size={12} /> : index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></li>)}
        </ol>
        {request.phase === "error" && <p className="txzz-stream-ticket-error" role="alert">{request.error || "检票失败，请稍后重试"}</p>}
      </section>

      {session && <footer><div><span>影片编号</span><strong>{session.movieId}</strong></div><div><span>可用线路</span><strong>{session.sources.length} 条</strong></div><div><Clock3 size={11} /><span>{new Date(session.fetchedAt).toLocaleString("zh-CN", { hour12: false })}</span></div></footer>}
    </aside>
  );
}
