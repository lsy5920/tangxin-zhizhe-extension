import { useState } from "react";
import { Clock3, Coins, Crown, Eye, Heart, Play, Sparkles } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";

type Props = {
  movie: CinemaMovie;
  onOpen: (movie: CinemaMovie) => void;
  featured?: boolean;
};

function accessMeta(movie: CinemaMovie) {
  if (movie.access === "coin") return { label: `${movie.price || 0} 金币`, icon: Coins, className: "bg-amber-400/95 text-slate-950" };
  if (movie.access === "vip") return { label: "VIP", icon: Crown, className: "bg-violet-500/95 text-white" };
  return { label: "免费", icon: Sparkles, className: "bg-emerald-400/95 text-slate-950" };
}

function compactMetric(value?: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "";
  if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)}万`;
  return String(number);
}

export function CinemaMovieCard({ movie, onOpen, featured = false }: Props) {
  const [posterFailed, setPosterFailed] = useState(false);
  const access = accessMeta(movie);
  const AccessIcon = access.icon;
  const views = compactMetric(movie.views);
  const likes = compactMetric(movie.likes);

  return (
    <button
      type="button"
      onClick={() => onOpen(movie)}
      className={`txzz-cinema-card group relative min-w-0 overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#17121f] text-left shadow-[0_18px_42px_rgba(17,10,28,.28)] outline-none transition duration-300 hover:-translate-y-1 hover:border-fuchsia-300/35 hover:shadow-[0_24px_55px_rgba(99,50,130,.30)] focus-visible:ring-3 focus-visible:ring-fuchsia-300/60 ${featured ? "w-[9.7rem] shrink-0 sm:w-[11rem]" : "w-full"}`}
      aria-label={`查看影片：${movie.title}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#49335d_0%,#1b1423_58%,#0d0a12_100%)]">
        {movie.posterUrl && !posterFailed ? (
          <img
            src={movie.posterUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setPosterFailed(true)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.045]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center text-white/50">
            <span className="text-4xl" aria-hidden="true">🍿</span>
            <span className="mt-2 text-[10px] font-bold">海报正在补妆</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#100b16] via-transparent to-black/25" />
        <span className={`absolute left-2 top-2 inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-[9px] font-black shadow-lg backdrop-blur ${access.className}`}>
          <AccessIcon size={10} /> {access.label}
        </span>
        {movie.badge && <span className="absolute right-2 top-2 max-w-[55%] truncate rounded-full bg-black/55 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">{movie.badge}</span>}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">
          <Clock3 size={10} /> {movie.durationLabel}
        </span>
        <span className="absolute bottom-2 left-2 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-white/95 text-fuchsia-600 opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <Play size={15} fill="currentColor" />
        </span>
      </div>
      <div className="min-h-[5.8rem] p-3">
        <h3 className="line-clamp-2 text-[12px] font-extrabold leading-[1.45] text-white">{movie.title}</h3>
        <p className="mt-1 truncate text-[10px] font-semibold text-violet-200/65">{movie.creator}</p>
        <div className="mt-2 flex items-center gap-2 text-[9px] font-semibold text-white/42">
          {views && <span className="inline-flex items-center gap-1"><Eye size={10} />{views}</span>}
          {likes && <span className="inline-flex items-center gap-1"><Heart size={10} />{likes}</span>}
          <span className="ml-auto rounded-full border border-white/10 px-1.5 py-0.5">{movie.orientation === "portrait" ? "竖屏" : movie.orientation === "landscape" ? "横屏" : "方屏"}</span>
        </div>
      </div>
    </button>
  );
}
