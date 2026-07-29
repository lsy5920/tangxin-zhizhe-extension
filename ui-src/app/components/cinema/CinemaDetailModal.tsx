import { Bookmark, Check, Clock3, Coins, Crown, Heart, Info, Play, ShieldCheck, Sparkles } from "lucide-react";
import type { CinemaMovie } from "../../cinema/types";
import type { LibraryEntry } from "../../types";
import { ModalSheet, SoftButton } from "../ui/primitives";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie | null;
  libraryEntry?: LibraryEntry | null;
  resolving?: boolean;
  onClose: () => void;
  onOpenPlayback: (movie: CinemaMovie) => void;
  onToggleFavorite: (movie: CinemaMovie) => void;
  onToggleWatchLater: (movie: CinemaMovie) => void;
};

export function CinemaDetailModal({ movie, libraryEntry, resolving = false, onClose, onOpenPlayback, onToggleFavorite, onToggleWatchLater }: Props) {
  if (!movie) return null;
  const accessLabel = movie.access === "coin" ? `${movie.price || 0} 金币` : movie.access === "vip" ? "VIP" : "免费";
  const AccessIcon = movie.access === "coin" ? Coins : movie.access === "vip" ? Crown : Sparkles;
  return (
    <ModalSheet
      open
      onClose={onClose}
      title="本场影片"
      size="lg"
      contentClassName="!bg-[#120d19] !p-0 text-white"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <SoftButton variant="secondary" onClick={onClose}>再逛逛</SoftButton>
          <SoftButton icon={resolving ? Sparkles : Play} disabled={resolving} onClick={() => onOpenPlayback(movie)}>{resolving ? "正在检票" : "获取完整线路并开映"}</SoftButton>
        </div>
      )}
    >
      <div className="relative min-h-[15rem] overflow-hidden">
        <CinemaPoster
          movie={movie}
          eager
          alt={`${movie.title} 海报`}
          className="absolute inset-0"
          imageClassName="h-full w-full object-cover opacity-60"
          fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_70%_20%,#5b3b70_0%,#211428_52%,#120d19_100%)]" />}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#120d19] via-[#120d19]/70 to-black/20" />
        <div className="relative flex min-h-[15rem] flex-col justify-end p-5">
          <p className="text-[9px] font-black tracking-[.18em] text-fuchsia-300">CINEMA TICKET · #{movie.id}</p>
          <h2 className="mt-2 text-[23px] font-black leading-tight tracking-[-.035em]">{movie.title}</h2>
          <p className="mt-2 text-[11px] font-semibold text-white/55">{movie.creator}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-white/75">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/9 px-2.5 py-1.5"><Clock3 size={11} />{movie.durationLabel}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/9 px-2.5 py-1.5"><AccessIcon size={11} />{accessLabel}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/9 px-2.5 py-1.5">{movie.orientation === "portrait" ? "9:16 竖屏" : movie.orientation === "landscape" ? "横屏" : "方屏"}</span>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onToggleFavorite(movie)} className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-[11px] font-black transition ${libraryEntry?.favorite ? "border-fuchsia-300/35 bg-fuchsia-300/15 text-fuchsia-200" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/9"}`}>
            {libraryEntry?.favorite ? <Check size={14} /> : <Heart size={14} />} {libraryEntry?.favorite ? "已收藏" : "收藏"}
          </button>
          <button type="button" onClick={() => onToggleWatchLater(movie)} className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-[11px] font-black transition ${libraryEntry?.watchLater ? "border-violet-300/35 bg-violet-300/15 text-violet-200" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/9"}`}>
            {libraryEntry?.watchLater ? <Check size={14} /> : <Bookmark size={14} />} {libraryEntry?.watchLater ? "已稍后看" : "稍后看"}
          </button>
        </div>
        <div className="rounded-[1.2rem] border border-emerald-300/18 bg-emerald-300/8 p-3.5">
          <p className="flex items-center gap-2 text-[11px] font-black text-emerald-200"><ShieldCheck size={15} />目录与播放严格分离</p>
          <p className="mt-1.5 text-[10px] font-medium leading-5 text-white/50">当前仅载入目标站原始目录信息，尚未请求完整播放线路，也没有触发账号轮换或金币购买。</p>
        </div>
        <div className="rounded-[1.2rem] border border-violet-300/15 bg-violet-300/7 p-3.5">
          <p className="flex items-center gap-2 text-[11px] font-black text-violet-200"><Info size={15} />点击开映后会发生什么</p>
          <p className="mt-1.5 text-[10px] font-medium leading-5 text-white/50">糖糖会进入可见检票流程，调用现有完整会话服务选择线路；资源就绪后仍保持暂停，需你在放映室再次点击播放。</p>
        </div>
      </div>
    </ModalSheet>
  );
}
