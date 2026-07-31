import { useMemo, useState } from "react";
import { Bookmark, Clock3, Clapperboard, Film, Pencil, Play, Repeat2, Save, Search, Trash2 } from "lucide-react";
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
    <div className="txzz-cinema58-collection-page">
      <header className="txzz-cinema58-collection-lead">
        <div className="txzz-cinema58-collection-title"><i><Bookmark size={27} /></i><div><span>TIME MARKERS</span><h2>时间书签</h2><p>保存关键时间点与 A-B 回看片段；切换线路不会改动书签的原始时间。</p></div></div>
        <label className="txzz-cinema58-collection-search"><Search size={16} /><input name="cinema-bookmark-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索影片、书签名称或备注" /></label>
      </header>

      {filtered.length ? (
        <div className="txzz-cinema58-bookmark-list">
          {filtered.map((item, index) => {
            const { movie, bookmark } = item;
            const isEditing = editing?.id === bookmark.id;
            return (
              <article key={`${bookmark.movieId}:${bookmark.id}`}>
                <span className="txzz-cinema58-bookmark-line" aria-hidden="true"><i>{String(index + 1).padStart(2, "0")}</i></span>
                <button type="button" onClick={() => onMovie(movie)} className="txzz-cinema58-bookmark-poster" aria-label={`查看影片：${movie.title}`}><CinemaPoster movie={movie} alt={`${movie.title} 海报`} className="size-full" imageClassName="size-full object-cover" fallback={<span className="txzz-cinema58-poster-symbol"><Clapperboard size={23} /></span>} /></button>
                <div className="txzz-cinema58-bookmark-copy">
                  <span>影片 #{movie.id}</span>
                  <button type="button" onClick={() => onMovie(movie)}>{movie.title}</button>
                  <div className="txzz-cinema58-bookmark-time"><strong><Clock3 size={13} />{formatDuration(bookmark.startSeconds)}</strong>{bookmark.endSeconds && <><i /><strong><Repeat2 size={13} />{formatDuration(bookmark.endSeconds)}</strong></>}</div>
                  {isEditing && editing ? (
                    <div className="txzz-cinema58-bookmark-editor">
                      <input name="cinema-bookmark-label" value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} placeholder="书签名称" />
                      <textarea name="cinema-bookmark-note" value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} placeholder="备注" />
                      <div><button type="button" onClick={() => setEditing(null)}>取消</button><button type="button" onClick={() => { onEdit(item, { label: editing.label, note: editing.note }); setEditing(null); }} className="is-primary"><Save size={12} />保存修改</button></div>
                    </div>
                  ) : <><h3>{bookmark.label || `书签 ${formatDuration(bookmark.startSeconds)}`}</h3><p>{bookmark.note || (bookmark.endSeconds ? "A-B 回看片段" : "单点时间书签")}</p></>}
                </div>
                <div className="txzz-cinema58-bookmark-actions">
                  <button type="button" onClick={() => onPlay(movie)} className="is-primary"><Play size={14} fill="currentColor" />播放</button>
                  <button type="button" onClick={() => onMovie(movie)}><Film size={14} />详情</button>
                  <button type="button" onClick={() => setEditing(isEditing ? null : { id: bookmark.id, label: bookmark.label || "", note: bookmark.note || "" })}><Pencil size={14} />编辑</button>
                  <button type="button" onClick={() => onDelete(item)} className="is-danger"><Trash2 size={14} />删除</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="txzz-cinema58-collection-empty"><i><Bookmark size={31} /></i><h3>还没有匹配的时间书签</h3><p>在播放器菜单或侧栏保存当前位置与 A-B 片段，它们会统一出现在这里。</p></div>}
    </div>
  );
}
