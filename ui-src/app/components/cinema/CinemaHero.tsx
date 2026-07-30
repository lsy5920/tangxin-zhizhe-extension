import { Clock3, Coins, Crown, Info, Layers3, Play, Sparkles, Star } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie;
  onDetails: (movie: CinemaMovie) => void;
  onPlay: (movie: CinemaMovie) => void;
  resolving?: boolean;
};

function accessLabel(movie: CinemaMovie) {
  if (movie.access === "coin") return `${movie.price || 0} 金币`;
  if (movie.access === "vip") return "VIP";
  return "免费";
}

export function CinemaHero({ movie, onDetails, onPlay, resolving = false }: Props) {
  const AccessIcon = movie.access === "coin" ? Coins : movie.access === "vip" ? Crown : Sparkles;
  return (
    <section className="txzz-stream-hero">
      <CinemaPoster
        movie={movie}
        eager
        alt=""
        className="txzz-stream-hero-backdrop"
        imageClassName="size-full object-cover"
        fallback={<span className="txzz-stream-hero-fallback" aria-hidden="true">🎞️</span>}
      />
      <div className="txzz-stream-hero-shade" />
      <div className="txzz-stream-hero-copy">
        <span className="txzz-stream-feature-label"><i />今日推荐</span>
        <h2>{movie.title}</h2>
        <div className="txzz-stream-hero-meta">
          {movie.score && <span className="is-score"><Star size={12} fill="currentColor" />{movie.score}</span>}
          <span><Clock3 size={12} />{movie.durationLabel}</span>
          <span><AccessIcon size={12} />{accessLabel(movie)}</span>
          {movie.isCollection && <span><Layers3 size={12} />系列合集</span>}
          <span>#{movie.id}</span>
        </div>
        <p>{movie.creator || "糖心影院精选"} · 从目录挑选，点击播放后再获取当前影片的完整可用线路。</p>
        <div className="txzz-stream-hero-actions">
          <button type="button" onClick={() => movie.isCollection ? onDetails(movie) : onPlay(movie)} disabled={resolving} className="is-primary">
            {resolving ? <Sparkles size={17} className="animate-spin" /> : movie.isCollection ? <Layers3 size={17} /> : <Play size={17} fill="currentColor" />}
            {resolving ? "正在准备" : movie.isCollection ? "查看选集" : "立即播放"}
          </button>
          <button type="button" onClick={() => onDetails(movie)}><Info size={17} />详情</button>
        </div>
      </div>
      <button type="button" onClick={() => onDetails(movie)} className="txzz-stream-hero-poster" aria-label={`查看 ${movie.title} 详情`}>
        <CinemaPoster movie={movie} eager alt={`${movie.title} 海报`} className="size-full" imageClassName="size-full object-cover" fallback={<span aria-hidden="true">🍿</span>} />
      </button>
      <span className="txzz-stream-hero-ticket" aria-hidden="true"><i /><i /><i /><i /><i /></span>
    </section>
  );
}
