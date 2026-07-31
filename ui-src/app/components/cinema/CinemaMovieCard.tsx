import { Clock3, Coins, Crown, Layers3, MoreHorizontal, Play, Sparkles, Star } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie;
  onOpen: (movie: CinemaMovie) => void;
  onPlay?: (movie: CinemaMovie) => void;
  featured?: boolean;
  progress?: number;
  rank?: number;
};

function accessMeta(movie: CinemaMovie) {
  if (movie.access === "coin") return { label: `${movie.price || 0} 金币`, icon: Coins, className: "is-coin" };
  if (movie.access === "vip") return { label: "VIP", icon: Crown, className: "is-vip" };
  return { label: "免费", icon: Sparkles, className: "is-free" };
}

export function CinemaMovieCard({ movie, onOpen, onPlay, featured = false, progress = 0, rank }: Props) {
  const access = accessMeta(movie);
  const AccessIcon = access.icon;
  const normalizedProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  return (
    <article className={`txzz-cinema58-movie-card ${featured ? "is-rail-card" : ""} ${rank ? "has-rank" : ""}`}>
      {rank ? <span className="txzz-cinema58-card-rank" aria-label={`第 ${rank} 名`}>{String(rank).padStart(2, "0")}</span> : null}
      <div className="txzz-cinema58-card-media">
        <button type="button" onClick={() => onOpen(movie)} className="txzz-cinema58-card-poster" aria-label={`查看影片：${movie.title}`}>
          <CinemaPoster
            movie={movie}
            alt={`${movie.title} 海报`}
            className="txzz-cinema58-card-poster-media"
            imageClassName="size-full object-cover"
            fallback={<span className="txzz-cinema58-poster-symbol"><Layers3 size={27} /><small>海报准备中</small></span>}
          />
        </button>
        <span className={`txzz-cinema58-access-badge ${access.className}`}><AccessIcon size={10} />{access.label}</span>
        {(movie.badge || movie.score) && <span className="txzz-cinema58-score-badge">{movie.score && <Star size={10} fill="currentColor" />}{movie.badge || movie.score}</span>}
        <span className="txzz-cinema58-duration-badge">{movie.isCollection ? <Layers3 size={10} /> : <Clock3 size={10} />}{movie.isCollection ? "合集" : movie.durationLabel}</span>
        <div className="txzz-cinema58-card-actions">
          {onPlay && !movie.isCollection && <button type="button" onClick={() => onPlay(movie)} aria-label={`播放 ${movie.title}`}><Play size={17} fill="currentColor" /></button>}
          <button type="button" onClick={() => onOpen(movie)} aria-label={`查看 ${movie.title} 详情`}><MoreHorizontal size={18} /></button>
        </div>
        {normalizedProgress > 0 && <span className="txzz-cinema58-card-progress" aria-label={`已观看 ${Math.round(normalizedProgress)}%`}><i style={{ width: `${normalizedProgress}%` }} /></span>}
      </div>
      <div className="txzz-cinema58-card-copy">
        <button type="button" onClick={() => onOpen(movie)}>{movie.title}</button>
        <span><small>{movie.creator || `影片 ${movie.id}`}</small><em>{movie.orientation === "portrait" ? "竖屏" : movie.orientation === "square" ? "方屏" : "横屏"}</em></span>
      </div>
    </article>
  );
}
