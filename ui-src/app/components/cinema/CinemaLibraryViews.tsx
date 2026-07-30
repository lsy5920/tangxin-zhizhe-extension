import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bookmark,
  CalendarClock,
  Clock3,
  Compass,
  Heart,
  History,
  Pencil,
  Play,
  Save,
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
  onPlay: (movie: CinemaMovie) => void;
  onUpdateEntry: (item: CinemaLibraryItem, patch: { tags: string[]; note: string }) => void;
  onNavigate: (route: CinemaPrimaryRoute) => void;
  bookmarkCount?: number;
  historyCount?: number;
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

function PageLead({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <header className="txzz-stream-collection-lead"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{children}</header>;
}

function EmptyCollection({ mode, onNavigate }: { mode: "library" | "history" | "search"; onNavigate: (route: CinemaPrimaryRoute) => void }) {
  const copy = mode === "history"
    ? { icon: History, title: "还没有观看足迹", detail: "打开影片并完成一次检票后，最近观看会出现在这里。" }
    : mode === "search"
      ? { icon: SearchX, title: "没有匹配的内容", detail: "换一个关键词，或切换收藏与稍后看。" }
      : { icon: Heart, title: "片库还是空的", detail: "在影片详情中点击收藏或稍后看，慢慢建立自己的片库。" };
  return <div className="txzz-stream-collection-empty"><copy.icon size={30} /><h3>{copy.title}</h3><p>{copy.detail}</p>{mode !== "search" && <button type="button" onClick={() => onNavigate("discover")}><Compass size={14} />去发现影片</button>}</div>;
}

export function CinemaLibraryView({ items, allItems, filter, keyword, onFilter, onKeyword, onMovie, onPlay, onUpdateEntry, onNavigate, bookmarkCount = 0, historyCount = 0 }: LibraryProps) {
  const [editing, setEditing] = useState<{ movieId: string; tags: string; note: string } | null>(null);
  const counts = useMemo(() => ({
    all: allItems.length,
    favorite: allItems.filter((item) => item.entry.favorite).length,
    watchLater: allItems.filter((item) => item.entry.watchLater).length
  }), [allItems]);
  const filters = [
    { id: "all" as const, label: "全部影片" },
    { id: "favorite" as const, label: "我的收藏" },
    { id: "watchLater" as const, label: "稍后观看" }
  ];

  return (
    <div className="txzz-stream-collection-page">
      <PageLead eyebrow="MY CINEMA" title="我的片库" description="收藏、稍后看、标签与备注集中在这里；片库不会保存过期的签名播放链接。">
        <label className="txzz-stream-collection-search"><Search size={15} /><input value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="搜索标题、编号、标签或备注" /></label>
      </PageLead>

      <nav className="txzz-stream-library-tabs" aria-label="片库分类">
        {filters.map((item) => <button key={item.id} type="button" onClick={() => onFilter(item.id)} aria-pressed={filter === item.id} className={filter === item.id ? "is-active" : ""}>{item.label}<span>{counts[item.id]}</span></button>)}
        <i />
        <button type="button" onClick={() => onNavigate("bookmarks")}><Bookmark size={14} />时间书签<span>{bookmarkCount}</span></button>
        <button type="button" onClick={() => onNavigate("history")}><History size={14} />观看足迹<span>{historyCount}</span></button>
      </nav>

      {items.length ? (
        <div className="txzz-stream-library-grid">
          {items.map((item) => {
            const { movie, entry } = item;
            const isEditing = editing?.movieId === movie.id;
            return (
              <article key={movie.id} className="txzz-stream-library-card">
                <div className="txzz-stream-library-poster-wrap">
                  <CinemaMovieCard movie={movie} onOpen={onMovie} />
                  <span className="txzz-stream-library-flags">{entry.favorite && <i title="已收藏"><Heart size={11} fill="currentColor" /></i>}{entry.watchLater && <i title="已稍后看"><Bookmark size={11} fill="currentColor" /></i>}</span>
                </div>
                <div className="txzz-stream-library-notes">
                  {isEditing && editing ? (
                    <div className="txzz-stream-library-editor">
                      <input value={editing.tags} onChange={(event) => setEditing({ ...editing, tags: event.target.value })} placeholder="标签，用逗号分隔" />
                      <textarea value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} placeholder="写下观影备注" />
                      <button type="button" onClick={() => { onUpdateEntry(item, { tags: editing.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), note: editing.note }); setEditing(null); }}><Save size={12} />保存资料</button>
                    </div>
                  ) : (
                    <><div className="txzz-stream-library-tags">{(entry.tags || []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{!(entry.tags || []).length && <small>未添加标签</small>}</div>{entry.note && <p>{entry.note}</p>}</>
                  )}
                  <div className="txzz-stream-library-actions"><button type="button" onClick={() => onPlay(movie)} className="is-primary"><Play size={11} fill="currentColor" />播放</button><button type="button" onClick={() => onMovie(movie)}>详情</button><button type="button" onClick={() => setEditing(isEditing ? null : { movieId: movie.id, tags: (entry.tags || []).join(", "), note: entry.note || "" })}><Pencil size={11} />整理</button></div>
                </div>
              </article>
            );
          })}
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
    <div className="txzz-stream-collection-page">
      <PageLead eyebrow="WATCH HISTORY" title="观看足迹" description="按影片编号去重保存；再次播放时会重新获取当前有效线路。">
        <label className="txzz-stream-collection-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或影片编号" /></label>
      </PageLead>

      {filtered.length ? (
        <div className="txzz-stream-history-list">
          {filtered.map((item) => (
            <article key={item.movie.id}>
              <button type="button" onClick={() => onMovie(item.movie)} className="txzz-stream-history-poster"><CinemaPoster movie={item.movie} alt={`${item.movie.title} 海报`} className="size-full" imageClassName="size-full object-cover" fallback={<span aria-hidden="true">🎬</span>} /></button>
              <div className="txzz-stream-history-copy"><span>影片 #{item.movie.id}</span><button type="button" onClick={() => onMovie(item.movie)}>{item.movie.title}</button><p>{item.movie.creator || "糖心影院片单"}</p><small><CalendarClock size={11} />{formatDate(item.fetchedAt)}<Clock3 size={11} />{item.movie.durationLabel}</small></div>
              <div className="txzz-stream-history-actions"><button type="button" onClick={() => onMovie(item.movie)}>查看详情</button><button type="button" onClick={() => onPlay(item.movie)} className="is-primary"><Play size={13} fill="currentColor" />重新播放</button></div>
            </article>
          ))}
        </div>
      ) : <EmptyCollection mode={query ? "search" : "history"} onNavigate={onNavigate} />}

      {items.length > 0 && <div className="txzz-stream-history-note"><ShieldCheck size={13} />足迹只保存影片资料，不传递历史签名 URL。</div>}
    </div>
  );
}
