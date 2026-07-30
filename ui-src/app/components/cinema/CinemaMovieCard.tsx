import { Clock3, Coins, Crown, Layers3, Play, Sparkles, Star } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie;
  onOpen: (movie: CinemaMovie) => void;
  featured?: boolean;
  progress?: number;
  rank?: number;
};

function accessMeta(movie: CinemaMovie) {
  if (movie.access === "coin") return { label: `${movie.price || 0} 金币`, icon: Coins, className: "is-coin" };
  if (movie.access === "vip") return { label: "VIP", icon: Crown, className: "is-vip" };
  return { label: "免费", icon: Sparkles, className: "is-free" };
}

export function CinemaMovieCard({ movie, onOpen, featured = false, progress = 0, rank }: Props) {
  const access = accessMeta(movie);
  const AccessIcon = access.icon;
  const normalizedProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  return (
    <article className={`txzz-stream-movie-card ${featured ? "is-rail-card" : ""} ${rank ? "has-rank" : ""}`}>
      {rank ? <span className="txzz-stream-card-rank" aria-label={`第 ${rank} 名`}>{rank}</span> : null}
      <button type="button" onClick={() => onOpen(movie)} className="txzz-stream-card-poster" aria-label={`查看影片：${movie.title}`}>
        <CinemaPoster
          movie={movie}
          alt={`${movie.title} 海报`}
          className="txzz-stream-card-poster-media"
          imageClassName="size-full object-cover"
          fallback={<span className="txzz-stream-poster-fallback"><ClapperFallback /><small>海报待补</small></span>}
        />
        <span className={`txzz-stream-access-badge ${access.className}`}><AccessIcon size={10} />{access.label}</span>
        {(movie.badge || movie.score) && <span className="txzz-stream-score-badge">{movie.score && <Star size={9} fill="currentColor" />}{movie.badge || movie.score}</span>}
        <span className="txzz-stream-duration-badge">{movie.isCollection ? <Layers3 size={10} /> : <Clock3 size={10} />}{movie.isCollection ? "合集" : movie.durationLabel}</span>
        <span className="txzz-stream-card-play"><Play size={18} fill="currentColor" /></span>
        {normalizedProgress > 0 && <span className="txzz-stream-card-progress"><i style={{ width: `${normalizedProgress}%` }} /></span>}
      </button>
      <button type="button" onClick={() => onOpen(movie)} className="txzz-stream-card-copy">
        <strong>{movie.title}</strong>
        <span><small>{movie.creator || `影片 ${movie.id}`}</small><em>{movie.orientation === "portrait" ? "竖屏" : movie.orientation === "square" ? "方屏" : "横屏"}</em></span>
      </button>
    </article>
  );
}

function ClapperFallback() {
  return <span aria-hidden="true">🎬</span>;
}
