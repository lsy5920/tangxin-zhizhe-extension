import { Clock3, Clapperboard, Coins, Crown, Eye, Info, Play, Sparkles } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie;
  onDetails: (movie: CinemaMovie) => void;
  onPlay: (movie: CinemaMovie) => void;
  resolving?: boolean;
};

function accessLabel(movie: CinemaMovie) {
  if (movie.access === "coin") return `${movie.price || 0} 金币解锁`;
  if (movie.access === "vip") return "VIP 影片";
  return "免费放映";
}

export function CinemaHero({ movie, onDetails, onPlay, resolving = false }: Props) {
  const AccessIcon = movie.access === "coin" ? Coins : movie.access === "vip" ? Crown : Sparkles;
  return (
    <section className="txzz-cinema-hero relative min-h-[20rem] overflow-hidden rounded-[1.8rem] border border-white/14 bg-[#171020] shadow-[0_30px_85px_rgba(28,13,45,.36)] sm:min-h-[22rem]">
      <CinemaPoster
        movie={movie}
        eager
        alt={`${movie.title} 海报`}
        className="absolute inset-0"
        imageClassName="h-full w-full object-cover object-center opacity-70"
        fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_72%_24%,#5f3b72_0%,#25162e_44%,#100b16_100%)]" />}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,7,16,.98)_0%,rgba(18,10,25,.88)_44%,rgba(16,9,22,.32)_75%,rgba(10,7,14,.64)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0912] via-transparent to-black/20" />
      <span className="txzz-cinema-star absolute right-[15%] top-[15%] text-amber-200/80" aria-hidden="true">✦</span>
      <span className="txzz-cinema-star txzz-cinema-star--delay absolute right-[7%] top-[38%] text-fuchsia-200/70" aria-hidden="true">✦</span>

      <div className="relative flex min-h-[20rem] max-w-[39rem] flex-col justify-end p-5 sm:min-h-[22rem] sm:p-7">
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-fuchsia-300/22 bg-fuchsia-300/10 px-3 py-1.5 text-[9px] font-black tracking-[.2em] text-fuchsia-200 backdrop-blur">
          <Clapperboard size={12} /> TONIGHT&apos;S FEATURE
        </p>
        <h2 className="mt-3 line-clamp-2 text-[25px] font-black leading-[1.15] tracking-[-.04em] text-white drop-shadow sm:text-[34px]">{movie.title}</h2>
        <p className="mt-2 text-[11px] font-semibold text-violet-100/65">{movie.creator} · 影片编号 {movie.id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold text-white/70">
          <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-white/9 px-2.5 backdrop-blur"><Clock3 size={11} />{movie.durationLabel}</span>
          <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-white/9 px-2.5 backdrop-blur"><AccessIcon size={11} />{accessLabel(movie)}</span>
          {movie.views && <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-white/9 px-2.5 backdrop-blur"><Eye size={11} />{movie.views}</span>}
          {movie.score && <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-amber-300/15 px-2.5 text-amber-200">★ {movie.score}</span>}
        </div>
        <p className="mt-3 max-w-[32rem] text-[11px] font-medium leading-5 text-white/52">目录阶段只读取目标站原始影片信息。选择开映后，糖糖才会检票、轮换账号并获取当前影片的完整线路。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onPlay(movie)} disabled={resolving} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-[12px] font-black text-[#25162d] shadow-xl transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55">
            {resolving ? <Sparkles size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}{resolving ? "正在检票" : "获取线路并开映"}
          </button>
          <button type="button" onClick={() => onDetails(movie)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/16 bg-black/28 px-4 text-[12px] font-black text-white backdrop-blur transition hover:bg-white/12">
            <Info size={15} />影片详情
          </button>
        </div>
      </div>
    </section>
  );
}
