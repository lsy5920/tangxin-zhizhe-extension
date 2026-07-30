import { Check, Clock3, Download, Layers3, Play, Repeat2, Sparkles, X } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "../cinema/CinemaPoster";

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

export function ScreeningEpisodeOverlay({ visible, open, episodes, currentMovieId, currentIndex, nextEpisode, autoNextEnabled, ended, countdown, onOpenChange, onSelectEpisode, onDownload, onAutoNextEnabledChange, onPlayNext, onCancelCountdown }: Props) {
  const hasCollection = episodes.length > 1;
  const nextRequiresConfirmation = Boolean(nextEpisode?.access === "coin" && nextEpisode.price > 0);

  return (
    <>
      <div className={`txzz-stream-player-quick-actions ${visible || open ? "is-visible" : ""}`}>
        <button type="button" onClick={onDownload} aria-label="下载当前影片"><Download size={14} /><span>下载</span></button>
        {hasCollection && <button type="button" onClick={() => onOpenChange(!open)} aria-expanded={open} className={open ? "is-active" : ""}><Layers3 size={14} /><span>选集 {currentIndex + 1}/{episodes.length}</span></button>}
      </div>

      {open && hasCollection && (
        <section data-txzz-episode-panel="true" role="dialog" aria-label="播放器选集" className="txzz-stream-player-episodes-panel">
          <header><div><span>SERIES</span><h3>合集选集</h3><p>共 {episodes.length} 集 · 选中后重新检票</p></div><button type="button" onClick={() => onOpenChange(false)} aria-label="关闭选集"><X size={16} /></button></header>
          <button type="button" aria-pressed={autoNextEnabled} onClick={() => onAutoNextEnabledChange(!autoNextEnabled)} className="txzz-stream-auto-next"><span className={autoNextEnabled ? "is-active" : ""}>{autoNextEnabled && <Check size={11} />}</span><div><strong>自动续播下一集</strong><small>免费与 VIP 分集倒计时续播；金币分集再次确认</small></div><Repeat2 size={14} /></button>
          <div className="txzz-player-episode-list txzz-stream-player-episode-list">
            {episodes.map((episode, index) => {
              const current = episode.id === currentMovieId;
              return (
                <button key={episode.id} type="button" onClick={() => { if (!current) onSelectEpisode(episode); }} aria-current={current ? "true" : undefined} className={current ? "is-current" : ""}>
                  <span className="txzz-stream-player-episode-thumb"><CinemaPoster movie={episode} alt="" className="size-full" imageClassName="size-full object-cover" fallback={<i aria-hidden="true">🎬</i>} /><em>{index + 1}</em>{current && <i><Play size={13} fill="currentColor" /></i>}</span>
                  <span><strong>{episode.title}</strong><small><Clock3 size={9} />{episode.durationLabel} · {episodeAccess(episode)}</small></span>
                  {current ? <em>当前</em> : <Play size={13} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {ended && nextEpisode && (
        <div className="txzz-stream-next-episode-overlay">
          <section><span><Sparkles size={19} /></span><small>NEXT EPISODE</small><h3>{nextEpisode.title}</h3><p>{nextRequiresConfirmation ? `下一集需 ${nextEpisode.price} 金币，请确认后再检票` : countdown !== null ? `${countdown} 秒后自动准备下一集` : "自动续播已暂停，也可以立即播放"}</p><div><button type="button" onClick={onCancelCountdown}>留在本集</button><button type="button" onClick={onPlayNext} className="is-primary"><Play size={13} fill="currentColor" />{nextRequiresConfirmation ? "确认并检票" : "立即续播"}</button></div></section>
        </div>
      )}
    </>
  );
}
