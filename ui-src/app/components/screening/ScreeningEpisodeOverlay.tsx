import {
  Check,
  Clock3,
  Coins,
  Download,
  Layers3,
  Play,
  Repeat2,
  Sparkles,
  X
} from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";

type Props = {
  visible: boolean;
  open: boolean;
  episodes: CinemaMovie[];
  currentMovieId: string;
  currentIndex: number;
  nextEpisode: CinemaMovie | null;
  autoNextEnabled: boolean;
  ended: boolean;
  countdown: number | null;
  onOpenChange: (open: boolean) => void;
  onSelectEpisode: (episode: CinemaMovie) => void;
  onDownload: () => void;
  onAutoNextEnabledChange: (enabled: boolean) => void;
  onPlayNext: () => void;
  onCancelCountdown: () => void;
};

function episodeAccess(episode: CinemaMovie) {
  if (episode.access === "coin") return `${episode.price || 0} 金币`;
  if (episode.access === "vip") return "VIP";
  return "免费";
}

export function ScreeningEpisodeOverlay({
  visible,
  open,
  episodes,
  currentMovieId,
  currentIndex,
  nextEpisode,
  autoNextEnabled,
  ended,
  countdown,
  onOpenChange,
  onSelectEpisode,
  onDownload,
  onAutoNextEnabledChange,
  onPlayNext,
  onCancelCountdown
}: Props) {
  const hasCollection = episodes.length > 1;
  const nextRequiresConfirmation = Boolean(nextEpisode?.access === "coin" && nextEpisode.price > 0);

  return (
    <>
      <div className={`absolute right-3 top-[3.9rem] z-[26] flex gap-2 transition sm:right-4 ${visible || open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}>
        <button type="button" onClick={onDownload} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/14 bg-black/58 px-3 text-[10px] font-black text-white/78 shadow-lg backdrop-blur-xl transition hover:bg-white/14 hover:text-white" aria-label="下载当前影片">
          <Download size={13} />下载
        </button>
        {hasCollection && (
          <button type="button" onClick={() => onOpenChange(!open)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-200/20 bg-violet-500/26 px-3 text-[10px] font-black text-violet-50 shadow-lg backdrop-blur-xl transition hover:bg-violet-400/35">
            <Layers3 size={13} />选集 {currentIndex + 1}/{episodes.length}
          </button>
        )}
      </div>

      {open && hasCollection && (
        <section data-txzz-episode-panel="true" role="dialog" aria-label="播放器选集" className="absolute bottom-[5.4rem] right-3 top-[6.8rem] z-[34] flex w-[min(23rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[1.35rem] border border-white/14 bg-[#100c16]/94 text-white shadow-[0_24px_70px_rgba(0,0,0,.48)] backdrop-blur-2xl sm:right-4">
          <header className="flex items-start gap-3 border-b border-white/9 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/22 text-violet-100"><Layers3 size={17} /></span>
            <span className="min-w-0 flex-1"><strong className="block text-[12px] font-black">合集选集</strong><span className="mt-0.5 block text-[8px] font-bold text-white/42">共 {episodes.length} 集 · 选中后重新检票</span></span>
            <button type="button" onClick={() => onOpenChange(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/52 hover:bg-white/9 hover:text-white" aria-label="关闭选集"><X size={15} /></button>
          </header>
          <button type="button" aria-pressed={autoNextEnabled} onClick={() => onAutoNextEnabledChange(!autoNextEnabled)} className="mx-3 mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-white/9 bg-white/5 px-3 text-left text-[9px] font-bold text-white/58 transition hover:bg-white/9">
            <span className={`flex h-5 w-5 items-center justify-center rounded-md ${autoNextEnabled ? "bg-emerald-400 text-slate-950" : "bg-white/9 text-white/35"}`}>{autoNextEnabled && <Check size={12} />}</span>
            <span className="min-w-0 flex-1"><strong className="block text-[10px] text-white/82">自动续播下一集</strong><span className="mt-0.5 block text-[8px] text-white/35">免费/VIP 分集倒计时续播，金币分集需再次确认</span></span>
            <Repeat2 size={13} className={autoNextEnabled ? "text-emerald-300" : "text-white/25"} />
          </button>
          <div className="txzz-player-episode-list mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 pt-1">
            {episodes.map((episode, index) => {
              const current = episode.id === currentMovieId;
              return (
                <button key={episode.id} type="button" onClick={() => { if (!current) onSelectEpisode(episode); }} aria-current={current ? "true" : undefined} className={`grid min-h-12 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${current ? "border-fuchsia-300/32 bg-fuchsia-300/13 text-fuchsia-50" : "border-white/7 bg-white/[.035] text-white/68 hover:border-violet-200/20 hover:bg-white/8 hover:text-white"}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-black ${current ? "bg-fuchsia-400 text-white" : "bg-white/7 text-white/45"}`}>{index + 1}</span>
                  <span className="min-w-0"><strong className="block truncate text-[9px] font-black">{episode.title}</strong><span className="mt-0.5 flex items-center gap-1 text-[8px] font-bold text-white/35"><Clock3 size={8} />{episode.durationLabel} · {episodeAccess(episode)}</span></span>
                  {current ? <span className="rounded-full bg-fuchsia-300/14 px-2 py-1 text-[8px] font-black text-fuchsia-100">当前</span> : <Play size={12} className="text-violet-200/55" />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {ended && nextEpisode && (
        <div className="pointer-events-none absolute inset-0 z-[31] flex items-center justify-center bg-black/58 p-4 backdrop-blur-[2px]">
          <section className="pointer-events-auto w-[min(26rem,100%)] rounded-[1.5rem] border border-white/14 bg-[#15101d]/96 p-5 text-center text-white shadow-[0_28px_90px_rgba(0,0,0,.55)]">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 shadow-lg"><Sparkles size={20} /></span>
            <p className="mt-4 text-[8px] font-black tracking-[.18em] text-fuchsia-200/68">NEXT EPISODE</p>
            <h3 className="mt-1 line-clamp-2 text-[15px] font-black">{nextEpisode.title}</h3>
            <p className="mt-2 text-[9px] font-semibold leading-5 text-white/45">
              {nextRequiresConfirmation
                ? `下一集需 ${nextEpisode.price} 金币，需要你亲自确认后才会检票`
                : countdown !== null ? `${countdown} 秒后自动检票并续播` : "已暂停自动续播，也可以立即播放"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={onCancelCountdown} className="min-h-11 rounded-2xl border border-white/10 bg-white/6 text-[10px] font-black text-white/58 hover:bg-white/10 hover:text-white">留在本集</button>
              <button type="button" onClick={onPlayNext} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-white text-[10px] font-black text-[#211329]"><Play size={13} fill="currentColor" />{nextRequiresConfirmation ? "确认并检票" : "立即续播"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
