import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Crown,
  Info,
  Layers3,
  Play,
  Sparkles,
  Star
} from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie;
  onDetails: (movie: CinemaMovie) => void;
  onPlay: (movie: CinemaMovie) => void;
  resolving?: boolean;
  position?: number;
  total?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onPauseChange?: (paused: boolean) => void;
};

function accessLabel(movie: CinemaMovie) {
  if (movie.access === "coin") return `${movie.price || 0} 金币`;
  if (movie.access === "vip") return "VIP 专享";
  return "免费放映";
}

export function CinemaHero({
  movie,
  onDetails,
  onPlay,
  resolving = false,
  position = 0,
  total = 1,
  onPrevious,
  onNext,
  onPauseChange
}: Props) {
  const AccessIcon = movie.access === "coin" ? Coins : movie.access === "vip" ? Crown : Sparkles;
  const showNavigation = total > 1 && onPrevious && onNext;

  return (
    <section
      className="txzz-cinema58-hero"
      onPointerEnter={() => onPauseChange?.(true)}
      onPointerLeave={() => onPauseChange?.(false)}
      onFocusCapture={() => onPauseChange?.(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPauseChange?.(false);
      }}
      aria-roledescription="carousel"
      aria-label="今日精选影片"
    >
      <CinemaPoster
        movie={movie}
        eager
        alt=""
        className="txzz-cinema58-hero-backdrop"
        imageClassName="size-full object-cover"
        fallback={<span className="txzz-cinema58-poster-symbol" aria-hidden="true"><Layers3 size={48} /></span>}
      />
      <div className="txzz-cinema58-hero-shade" />
      <div className="txzz-cinema58-hero-copy">
        <span className="txzz-cinema58-feature-label"><Sparkles size={13} />编辑精选</span>
        <h2>{movie.title}</h2>
        <div className="txzz-cinema58-hero-meta">
          {movie.score && <span className="is-score"><Star size={12} fill="currentColor" />{movie.score}</span>}
          <span><Clock3 size={12} />{movie.durationLabel}</span>
          <span><AccessIcon size={12} />{accessLabel(movie)}</span>
          {movie.isCollection && <span><Layers3 size={12} />系列合集</span>}
          <span>#{movie.id}</span>
        </div>
        <p>{movie.creator || "糖心影院精选"} · 完整片源会在你的点击之后按需准备。</p>
        <div className="txzz-cinema58-hero-actions">
          <button type="button" onClick={() => movie.isCollection ? onDetails(movie) : onPlay(movie)} disabled={resolving} className="is-primary">
            {resolving ? <Sparkles size={18} className="animate-spin" /> : movie.isCollection ? <Layers3 size={18} /> : <Play size={18} fill="currentColor" />}
            {resolving ? "正在准备" : movie.isCollection ? "查看选集" : "立即播放"}
          </button>
          <button type="button" onClick={() => onDetails(movie)}><Info size={18} />影片详情</button>
        </div>
      </div>

      <button type="button" onClick={() => onDetails(movie)} className="txzz-cinema58-hero-poster" aria-label={`查看 ${movie.title} 详情`}>
        <CinemaPoster
          movie={movie}
          eager
          alt={`${movie.title} 海报`}
          className="size-full"
          imageClassName="size-full object-cover"
          fallback={<span className="txzz-cinema58-poster-symbol" aria-hidden="true"><Layers3 size={32} /></span>}
        />
        <span><Play size={15} fill="currentColor" />{movie.isCollection ? "进入合集" : "查看影片"}</span>
      </button>

      {showNavigation && (
        <div className="txzz-cinema58-hero-nav" aria-label="切换精选影片">
          <button type="button" onClick={onPrevious} aria-label="上一部精选影片"><ChevronLeft size={18} /></button>
          <span><strong>{String(position + 1).padStart(2, "0")}</strong><i />{String(total).padStart(2, "0")}</span>
          <button type="button" onClick={onNext} aria-label="下一部精选影片"><ChevronRight size={18} /></button>
        </div>
      )}
      <span className="txzz-cinema58-hero-stitch" aria-hidden="true" />
    </section>
  );
}
