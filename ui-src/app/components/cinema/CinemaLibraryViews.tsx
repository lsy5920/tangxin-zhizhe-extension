import { useMemo, useState } from "react";
import {
  Bookmark,
  CalendarClock,
  Clock3,
  Compass,
  Heart,
  History,
  Play,
  Search,
  SearchX,
  ShieldCheck
} from "lucide-react";
import type { CinemaHistoryItem, CinemaLibraryItem, CinemaPrimaryRoute } from "../../cinema/appModel";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaMovieCard } from "./CinemaMovieCard";
import { CinemaPoster } from "./CinemaPoster";

type LibraryProps = {
  items: CinemaLibraryItem[];
  allItems: CinemaLibraryItem[];
  filter: "all" | "favorite" | "watchLater";
  keyword: string;
  onFilter: (filter: "all" | "favorite" | "watchLater") => void;
  onKeyword: (value: string) => void;
  onMovie: (movie: CinemaMovie) => void;
  onNavigate: (route: CinemaPrimaryRoute) => void;
};

type HistoryProps = {
  items: CinemaHistoryItem[];
  onMovie: (movie: CinemaMovie) => void;
  onPlay: (movie: CinemaMovie) => void;
  onNavigate: (route: CinemaPrimaryRoute) => void;
};

function formatDate(value?: string) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function EmptyCollection({ mode, onNavigate }: { mode: "library" | "history" | "search"; onNavigate: (route: CinemaPrimaryRoute) => void }) {
  const copy = mode === "history"
    ? { icon: History, title: "还没有观看足迹", detail: "打开一部影片并完成检票后，最近记录会出现在这里。" }
    : mode === "search"
      ? { icon: SearchX, title: "片库里没找到", detail: "换个关键词，或切换收藏/稍后看筛选。" }
      : { icon: Heart, title: "你的片库还是空的", detail: "在影片详情中点收藏或稍后看，就能组成自己的影院。" };
  return (
    <div className="rounded-[1.7rem] border border-dashed border-white/12 bg-white/[.025] px-5 py-14 text-center">
      <copy.icon size={34} className="mx-auto text-fuchsia-200/55" />
      <h2 className="mt-4 text-[15px] font-black">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[10px] font-semibold leading-5 text-white/40">{copy.detail}</p>
      {mode !== "search" && <button type="button" onClick={() => onNavigate("discover")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-[11px] font-black text-[#211329]"><Compass size={14} />去发现好片</button>}
    </div>
  );
}

export function CinemaLibraryView({ items, allItems, filter, keyword, onFilter, onKeyword, onMovie, onNavigate }: LibraryProps) {
  const counts = useMemo(() => ({
    all: allItems.length,
    favorite: allItems.filter((item) => item.entry.favorite).length,
    watchLater: allItems.filter((item) => item.entry.watchLater).length
  }), [allItems]);
  const filters = [
    { id: "all" as const, label: "全部", icon: Heart },
    { id: "favorite" as const, label: "收藏", icon: Heart },
    { id: "watchLater" as const, label: "稍后看", icon: Bookmark }
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 pb-8 sm:p-5 lg:p-7 xl:px-9">
      <section className="rounded-[1.55rem] border border-white/8 bg-white/[.035] p-3.5 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[8px] font-black tracking-[.18em] text-fuchsia-300/60">PERSONAL COLLECTION</p><h2 className="mt-1 text-[18px] font-black tracking-[-.025em]">把想看的都放在一起</h2><p className="mt-1 text-[9px] font-semibold text-white/38">仅保存目录元数据，不保存签名播放地址</p></div>
          <label className="relative w-full sm:max-w-xs"><span className="sr-only">搜索我的片库</span><Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/32" /><input value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="搜索标题、编号、标签或备注" className="h-11 w-full rounded-2xl border border-white/9 bg-black/20 pl-10 pr-3 text-[11px] font-bold text-white outline-none placeholder:text-white/27 focus:border-fuchsia-300/35" /></label>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="片库筛选">
          {filters.map((item) => <button key={item.id} type="button" onClick={() => onFilter(item.id)} aria-pressed={filter === item.id} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black transition ${filter === item.id ? "border-fuchsia-300/35 bg-fuchsia-300/14 text-fuchsia-100" : "border-white/8 bg-white/4 text-white/44 hover:bg-white/8 hover:text-white/72"}`}><item.icon size={12} />{item.label}<span className="rounded-full bg-black/22 px-1.5 py-0.5 text-[8px]">{counts[item.id]}</span></button>)}
        </div>
      </section>

      {items.length ? (
        <div className="txzz-cinema-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map(({ movie, entry }) => (
            <div key={movie.id} className="relative min-w-0">
              <CinemaMovieCard movie={movie} onOpen={onMovie} />
              <div className="pointer-events-none absolute right-2 top-12 flex flex-col gap-1">
                {entry.favorite && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-500/90 text-white shadow-lg" title="已收藏"><Heart size={12} fill="currentColor" /></span>}
                {entry.watchLater && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/90 text-white shadow-lg" title="已稍后看"><Bookmark size={12} fill="currentColor" /></span>}
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyCollection mode={keyword ? "search" : "library"} onNavigate={onNavigate} />}
    </div>
  );
}

export function CinemaHistoryView({ items, onMovie, onPlay, onNavigate }: HistoryProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return needle ? items.filter((item) => `${item.movie.title} ${item.movie.id}`.toLocaleLowerCase("zh-CN").includes(needle)) : items;
  }, [items, query]);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 pb-8 sm:p-5 lg:p-7 xl:px-9">
      <section className="rounded-[1.55rem] border border-white/8 bg-white/[.035] p-3.5 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="flex items-center gap-1.5 text-[8px] font-black tracking-[.18em] text-violet-300/60"><History size={11} /> RECENT SESSIONS</p><h2 className="mt-1 text-[18px] font-black tracking-[-.025em]">最近检票的影片</h2><p className="mt-1 text-[9px] font-semibold text-white/38">已按影片编号去重；再次开映会重新获取有效线路</p></div>
          <label className="relative w-full sm:max-w-xs"><span className="sr-only">搜索观看足迹</span><Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/32" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或影片编号" className="h-11 w-full rounded-2xl border border-white/9 bg-black/20 pl-10 pr-3 text-[11px] font-bold text-white outline-none placeholder:text-white/27 focus:border-violet-300/35" /></label>
        </div>
      </section>

      {filtered.length ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.movie.id} className="group grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-[1.4rem] border border-white/9 bg-white/[.035] shadow-[0_18px_45px_rgba(0,0,0,.16)] transition hover:border-violet-300/22 hover:bg-white/[.055] sm:grid-cols-[8rem_minmax(0,1fr)]">
              <button type="button" onClick={() => onMovie(item.movie)} className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#49335d,#17111f)] text-left" aria-label={`查看影片：${item.movie.title}`}>
                <CinemaPoster movie={item.movie} alt={`${item.movie.title} 海报`} className="absolute inset-0" imageClassName="size-full object-cover transition duration-500 group-hover:scale-[1.04]" fallback={<div className="flex size-full items-center justify-center text-4xl">🍿</div>} />
                <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/12" />
              </button>
              <div className="flex min-w-0 flex-col p-4">
                <p className="text-[8px] font-black tracking-[.15em] text-violet-300/55">MOVIE #{item.movie.id}</p>
                <button type="button" onClick={() => onMovie(item.movie)} className="mt-1 line-clamp-2 text-left text-[14px] font-black leading-5 text-white transition hover:text-fuchsia-100">{item.movie.title}</button>
                <div className="mt-2 space-y-1 text-[9px] font-semibold text-white/38"><p className="flex items-center gap-1.5"><CalendarClock size={11} />{formatDate(item.fetchedAt)}</p><p className="flex items-center gap-1.5"><Clock3 size={11} />{item.movie.durationLabel} · {item.acquisitionMode === "purchased" ? "已完成安全解锁" : "已获取过线路"}</p></div>
                <div className="mt-auto flex gap-2 pt-3"><button type="button" onClick={() => onMovie(item.movie)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/9 bg-white/5 px-2 text-[10px] font-black text-white/62 hover:bg-white/9 hover:text-white">详情</button><button type="button" onClick={() => onPlay(item.movie)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-[10px] font-black text-[#211329]"><Play size={12} fill="currentColor" />重新开映</button></div>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyCollection mode={query ? "search" : "history"} onNavigate={onNavigate} />}

      {items.length > 0 && <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/10 bg-emerald-300/5 px-3 py-2.5 text-[9px] font-semibold text-emerald-100/55"><ShieldCheck size={12} />足迹页不传递历史签名 URL，播放时重新检票</div>}
    </div>
  );
}
