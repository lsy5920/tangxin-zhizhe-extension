import { useMemo, useState } from "react";
import { Bookmark, Clock3, Film, Pencil, Play, Repeat2, Search, Trash2 } from "lucide-react";
import type { CinemaBookmarkItem } from "../../cinema/appModel";
import type { CinemaMovie } from "../../cinema/types";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  items: CinemaBookmarkItem[];
  onMovie: (movie: CinemaMovie) => void;
  onPlay: (movie: CinemaMovie) => void;
  onEdit: (item: CinemaBookmarkItem, patch: { label: string; note: string }) => void;
  onDelete: (item: CinemaBookmarkItem) => void;
};

function formatDuration(value = 0) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function CinemaBookmarkView({ items, onMovie, onPlay, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string; note: string } | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return needle ? items.filter(({ movie, bookmark }) => [movie.id, movie.title, bookmark.label, bookmark.note].join(" ").toLocaleLowerCase("zh-CN").includes(needle)) : items;
  }, [items, query]);

  return (
    <div className="txzz-stream-collection-page">
      <header className="txzz-stream-collection-lead">
        <div><span>TIME MARKERS</span><h2>时间书签</h2><p>保存关键时间点与 A-B 回看片段；切换线路不会改动书签的原始时间。</p></div>
        <label className="txzz-stream-collection-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索影片、书签名称或备注" /></label>
      </header>

      {filtered.length ? (
        <div className="txzz-stream-bookmark-list">
          {filtered.map((item) => {
            const { movie, bookmark } = item;
            const isEditing = editing?.id === bookmark.id;
            return (
              <article key={`${bookmark.movieId}:${bookmark.id}`}>
                <button type="button" onClick={() => onMovie(movie)} className="txzz-stream-bookmark-poster" aria-label={`查看影片：${movie.title}`}><CinemaPoster movie={movie} alt={`${movie.title} 海报`} className="size-full" imageClassName="size-full object-cover" fallback={<span aria-hidden="true">🎬</span>} /></button>
                <div className="txzz-stream-bookmark-copy">
                  <span>影片 #{movie.id}</span>
                  <button type="button" onClick={() => onMovie(movie)}>{movie.title}</button>
                  <div className="txzz-stream-bookmark-time"><strong><Clock3 size={12} />{formatDuration(bookmark.startSeconds)}</strong>{bookmark.endSeconds && <strong><Repeat2 size={12} />{formatDuration(bookmark.endSeconds)}</strong>}</div>
                  {isEditing && editing ? <div className="txzz-stream-bookmark-editor"><input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} placeholder="书签名称" /><textarea value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} placeholder="备注" /><button type="button" onClick={() => { onEdit(item, { label: editing.label, note: editing.note }); setEditing(null); }}>保存修改</button></div> : <><h3>{bookmark.label || `书签 ${formatDuration(bookmark.startSeconds)}`}</h3><p>{bookmark.note || (bookmark.endSeconds ? "A-B 回看片段" : "单点时间书签")}</p></>}
                </div>
                <div className="txzz-stream-bookmark-actions">
                  <button type="button" onClick={() => onPlay(movie)} className="is-primary"><Play size={13} fill="currentColor" />播放</button>
                  <button type="button" onClick={() => onMovie(movie)}><Film size={13} />详情</button>
                  <button type="button" onClick={() => setEditing(isEditing ? null : { id: bookmark.id, label: bookmark.label || "", note: bookmark.note || "" })}><Pencil size={13} />编辑</button>
                  <button type="button" onClick={() => onDelete(item)} className="is-danger"><Trash2 size={13} />删除</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="txzz-stream-collection-empty"><Bookmark size={30} /><h3>还没有匹配的时间书签</h3><p>在播放器菜单或侧栏保存当前位置与 A-B 片段，它们会统一出现在这里。</p></div>}
    </div>
  );
}
