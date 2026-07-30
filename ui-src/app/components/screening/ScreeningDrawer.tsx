import { useMemo, useState } from "react";
import {
  Ban, Bookmark, Clock3, Copy, Download, ExternalLink, Film, Footprints, Heart,
  Library, Pause, Pencil, Play, Repeat2, Route, Save, Search, Tags, Trash2
} from "lucide-react";
import type { BridgeState, DownloadTask, LibraryEntry, PlaybackBookmark } from "../../types";
import type { PlaybackSession } from "../../playback/types";
import { formatDuration, maskUrl } from "../../helpers";

type Tab = "sources" | "download" | "library" | "bookmarks" | "history";
type LibraryFilter = "all" | "favorite" | "watchLater" | "unwatched";
type LibrarySort = "updated" | "added" | "played" | "unwatched";

type Props = {
  state: BridgeState;
  session: PlaybackSession | null;
  history: PlaybackSession[];
  currentDuration?: number;
  onSelectHistory: (session: PlaybackSession) => void;
  onSeekBookmark: (bookmark: PlaybackBookmark) => void;
  onLoopBookmark: (bookmark: PlaybackBookmark) => void;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

function downloadForMovie(tasks: Record<string, DownloadTask> | undefined, movieId?: string) {
  return Object.values(tasks || {}).find((task) => String(task.movieId) === String(movieId)) || null;
}

function healthTone(state?: string) {
  if (state === "healthy") return "bg-emerald-50 text-emerald-600";
  if (state === "failed") return "bg-rose-50 text-rose-600";
  if (state === "degraded") return "bg-amber-50 text-amber-600";
  return "bg-violet-50 text-violet-600";
}

function libraryTime(entry: LibraryEntry, sort: LibrarySort) {
  const field = sort === "added" ? entry.addedAt : sort === "played" ? entry.lastPlayedAt : entry.updatedAt;
  return Date.parse(String(field || "")) || 0;
}

function libraryRows(state: BridgeState, keyword: string, filter: LibraryFilter, sort: LibrarySort) {
  const query = keyword.trim().toLowerCase();
  return Object.values(state.experience?.library || {}).filter((entry) => {
    if (filter === "favorite" && !entry.favorite) return false;
    if (filter === "watchLater" && !entry.watchLater) return false;
    if (filter === "unwatched" && entry.watchedAt) return false;
    return !query || [entry.movieId, entry.title, entry.note, ...(entry.tags || [])].join(" ").toLowerCase().includes(query);
  }).sort((left, right) => {
    if (sort === "unwatched") {
      const watchedDiff = Number(Boolean(left.watchedAt)) - Number(Boolean(right.watchedAt));
      if (watchedDiff) return watchedDiff;
    }
    return libraryTime(right, sort) - libraryTime(left, sort);
  });
}

export function ScreeningDrawer({
  state,
  session,
  history,
  currentDuration = 0,
  onSelectHistory,
  onSeekBookmark,
  onLoopBookmark,
  onAction
}: Props) {
  const [tab, setTab] = useState<Tab>("sources");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("updated");
  const [editingLibrary, setEditingLibrary] = useState<{ movieId: string; tags: string; note: string } | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<{ id: string; label: string; note: string } | null>(null);
  const task = downloadForMovie(state.downloadTasks, session?.movieId);
  const library = useMemo(
    () => libraryRows(state, librarySearch, libraryFilter, librarySort),
    [libraryFilter, librarySearch, librarySort, state]
  );
  const bookmarks = session ? state.experience?.bookmarks?.[session.movieId] || [] : [];
  const tabs = [
    { key: "sources" as const, label: "片源", icon: Route, badge: session?.sources.length || 0 },
    { key: "download" as const, label: "下载", icon: Download, badge: task ? 1 : 0 },
    { key: "library" as const, label: "片库", icon: Library, badge: Object.keys(state.experience?.library || {}).length },
    { key: "bookmarks" as const, label: "书签", icon: Bookmark, badge: bookmarks.length },
    { key: "history" as const, label: "足迹", icon: Footprints, badge: history.length }
  ];

  const updateLibrary = (entry: LibraryEntry, patch: Partial<LibraryEntry>) => onAction("update-library-entry", {
    ...entry,
    ...patch,
    movieId: entry.movieId,
    title: entry.title || entry.movieId
  });

  return (
    <section className="txzz-screening-drawer txzz-playback-hidden-during-fullscreen overflow-hidden rounded-[1.55rem] border border-white/80 bg-white/82 shadow-[0_18px_55px_rgba(113,70,160,.11)] backdrop-blur-xl">
      <div className="grid grid-cols-5 border-b border-violet-100/70 bg-gradient-to-r from-fuchsia-50/70 to-violet-50/70 p-1.5" role="tablist" aria-label="放映辅助抽屉">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-extrabold transition sm:text-[11px] ${tab === key ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>
            <Icon size={13} className="shrink-0" /><span className="truncate">{label}</span><span className="hidden rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] text-violet-500 sm:inline">{badge}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[26rem] overflow-y-auto p-3 sm:p-4">
        {tab === "sources" && (
          <div className="space-y-2">
            {!session?.sources.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">检票后在这里查看完整线路</p>}
            {session?.sources.map((source) => {
              const completenessRecommended = source.id === session.decision.recommendedSourceId
                && session.decision.reasonCodes.includes("longer-playlist-duration");
              return (
                <article key={source.id} className="rounded-2xl border border-slate-100 bg-slate-50/65 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><strong className="block text-[12px] text-slate-800">{source.label}{completenessRecommended && <span className="ml-1.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[8px] text-fuchsia-600">完整版优先</span>}</strong><span className="mt-0.5 block truncate font-mono text-[9px] text-slate-400">{maskUrl(source.url)}</span></div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${healthTone(source.health.state)}`}>{source.health.state === "healthy" ? "健康" : source.health.state === "failed" ? "异常" : source.health.state === "degraded" ? "降级" : "待验证"}{Number(source.health.duration || 0) > 0 ? ` · ${formatDuration(source.health.duration)}` : ""}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button type="button" onClick={() => onAction(source.id === "backup" ? "copy-backup-link" : "copy-play-link", { url: source.url, label: `${source.label}完整链接` })} className="min-h-10 rounded-xl bg-white text-[10px] font-bold text-violet-600 shadow-sm"><Copy size={12} className="mr-1 inline" />复制</button>
                    <button type="button" onClick={() => onAction("open-playback-url", { url: source.url, label: source.label })} className="min-h-10 rounded-xl bg-white text-[10px] font-bold text-sky-600 shadow-sm"><ExternalLink size={12} className="mr-1 inline" />打开</button>
                    <button type="button" onClick={() => onAction("plan-full-video-download", { movieId: session.movieId, movieTitle: session.title, sourceId: source.id })} className="min-h-10 rounded-xl bg-violet-600 text-[10px] font-bold text-white shadow-sm"><Download size={12} className="mr-1 inline" />规划下载</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {tab === "download" && (
          <div>
            {!session ? <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">暂无本场影片</p> : task ? (
              <article className="rounded-2xl border border-violet-100 bg-violet-50/55 p-4">
                <div className="flex items-center justify-between gap-2"><strong className="truncate text-[12px] text-slate-800">{task.movieTitle || session.title}</strong><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] font-bold text-violet-600">{task.stage || "准备中"}</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500" style={{ width: `${Math.max(0, Math.min(100, Number(task.percent || 0)))}%` }} /></div>
                <p className="mt-2 text-[10px] text-slate-500">{Math.round(Number(task.percent || 0))}% · {task.filename || "正在整理糖果片段"}</p>
                {task.notBefore && <p className="mt-1 text-[9px] text-violet-500"><Clock3 size={10} className="mr-1 inline" />计划 {new Date(task.notBefore).toLocaleString("zh-CN", { hour12: false })}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["queued", "probing", "downloading", "recovering", "assembling"].includes(String(task.stage)) && <button type="button" onClick={() => onAction("pause-download-task", { taskId: task.taskId })} className="min-h-10 rounded-xl bg-amber-100 text-[10px] font-bold text-amber-700"><Pause size={13} className="mr-1 inline" />暂停</button>}
                  {task.stage === "paused" && <button type="button" onClick={() => onAction("resume-download-task", { taskId: task.taskId })} className="min-h-10 rounded-xl bg-sky-100 text-[10px] font-bold text-sky-700"><Play size={13} className="mr-1 inline" />继续</button>}
                  {["queued", "probing", "downloading", "paused", "recovering", "assembling"].includes(String(task.stage)) && <button type="button" onClick={() => onAction("cancel-download-task", { taskId: task.taskId })} className="min-h-10 rounded-xl bg-rose-100 text-[10px] font-bold text-rose-700"><Ban size={13} className="mr-1 inline" />取消</button>}
                  {["ready", "saving", "complete"].includes(String(task.stage)) && <button type="button" onClick={() => onAction("save-download-device", { taskId: task.taskId })} className="col-span-2 min-h-10 rounded-xl bg-emerald-500 text-[10px] font-bold text-white"><Save size={13} className="mr-1 inline" />保存到设备</button>}
                </div>
              </article>
            ) : (
              <button type="button" onClick={() => onAction("plan-full-video-download", { movieId: session.movieId, movieTitle: session.title, lineKey: "auto" })} className="flex min-h-24 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/45 text-violet-600">
                <Download size={20} /><strong className="mt-2 text-[11px]">下载本场影片</strong><span className="mt-1 text-[9px] text-violet-400">自动选择健康线路</span>
              </button>
            )}
          </div>
        )}

        {tab === "library" && (
          <div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative"><Search size={13} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" /><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="搜索标题、编号、标签或备注" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[11px] outline-none focus:border-violet-300" /></label>
              <select value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value as LibraryFilter)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600"><option value="all">全部</option><option value="favorite">收藏</option><option value="watchLater">稍后看</option><option value="unwatched">未观看</option></select>
              <select value={librarySort} onChange={(event) => setLibrarySort(event.target.value as LibrarySort)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600"><option value="updated">最近整理</option><option value="added">收藏时间</option><option value="played">最近观看</option><option value="unwatched">未观看优先</option></select>
            </div>
            <div className="mt-3 space-y-2">
              {!library.length && <p className="rounded-xl bg-slate-50 p-5 text-center text-[11px] text-slate-400">还没有符合条件的影片，先在本场侧栏收藏一部吧</p>}
              {library.map((entry) => {
                const editing = editingLibrary?.movieId === entry.movieId;
                return (
                  <article key={entry.movieId} className="rounded-2xl border border-slate-100 bg-slate-50/65 p-3">
                    <div className="flex items-start gap-3">
                      <button type="button" onClick={() => onAction("open-library-playback", { movieId: entry.movieId, movieTitle: entry.title })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-violet-500 shadow-sm" title="在放映室检票"><Film size={17} /></button>
                      <div className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-slate-800">{entry.title || `影片 ${entry.movieId}`}</strong><span className="mt-1 block text-[9px] text-slate-400">#{entry.movieId}{entry.watchedAt ? " · 已观看" : " · 未观看"}</span><div className="mt-1 flex flex-wrap gap-1">{entry.favorite && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[8px] text-fuchsia-600">收藏</span>}{entry.watchLater && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[8px] text-violet-600">稍后看</span>}{entry.tags?.map((tag) => <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[8px] text-slate-500">{tag}</span>)}</div></div>
                      <button type="button" onClick={() => setEditingLibrary(editing ? null : { movieId: entry.movieId, tags: (entry.tags || []).join(", "), note: entry.note || "" })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500" title="整理标签与备注"><Pencil size={14} /></button>
                    </div>
                    {entry.note && !editing && <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-[9px] leading-4 text-slate-500">{entry.note}</p>}
                    {editing && editingLibrary && (
                      <div className="mt-3 space-y-2 rounded-xl bg-white p-3">
                        <label className="block text-[9px] font-bold text-slate-500"><Tags size={11} className="mr-1 inline" />标签（逗号分隔）<input value={editingLibrary.tags} onChange={(event) => setEditingLibrary({ ...editingLibrary, tags: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-[10px] outline-none focus:border-violet-300" /></label>
                        <label className="block text-[9px] font-bold text-slate-500">备注<textarea value={editingLibrary.note} onChange={(event) => setEditingLibrary({ ...editingLibrary, note: event.target.value })} className="mt-1 min-h-16 w-full resize-y rounded-lg border border-slate-200 p-3 text-[10px] outline-none focus:border-violet-300" /></label>
                        <button type="button" onClick={() => { updateLibrary(entry, { tags: editingLibrary.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean), note: editingLibrary.note }); setEditingLibrary(null); }} className="min-h-10 w-full rounded-xl bg-violet-600 text-[10px] font-bold text-white"><Save size={12} className="mr-1 inline" />保存整理</button>
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <button type="button" onClick={() => updateLibrary(entry, { favorite: !entry.favorite })} className={`min-h-10 rounded-xl text-[9px] font-bold ${entry.favorite ? "bg-fuchsia-500 text-white" : "bg-white text-fuchsia-600"}`}><Heart size={12} className="mr-1 inline" />收藏</button>
                      <button type="button" onClick={() => updateLibrary(entry, { watchLater: !entry.watchLater })} className={`min-h-10 rounded-xl text-[9px] font-bold ${entry.watchLater ? "bg-violet-600 text-white" : "bg-white text-violet-600"}`}><Clock3 size={12} className="mr-1 inline" />稍后看</button>
                      <button type="button" onClick={() => onAction("open-library-playback", { movieId: entry.movieId, movieTitle: entry.title })} className="min-h-10 rounded-xl bg-emerald-500 text-[9px] font-bold text-white"><Play size={12} className="mr-1 inline" />检票播放</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {tab === "bookmarks" && (
          <div className="space-y-2">
            {!session && <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">先选择一场影片再查看时间书签</p>}
            {session && !bookmarks.length && <p className="rounded-xl bg-slate-50 p-5 text-center text-[11px] text-slate-400">播放器右键菜单可以保存当前位置或 A-B 片段</p>}
            {bookmarks.map((bookmark) => {
              const unavailable = currentDuration > 0 && bookmark.startSeconds > currentDuration;
              const editing = editingBookmark?.id === bookmark.id;
              return (
                <article key={bookmark.id} className={`rounded-2xl border p-3 ${unavailable ? "border-amber-100 bg-amber-50/70" : "border-violet-100 bg-violet-50/50"}`}>
                  <div className="flex items-start gap-3">
                    <button type="button" disabled={unavailable} onClick={() => onSeekBookmark(bookmark)} className="flex h-11 min-w-16 shrink-0 items-center justify-center rounded-xl bg-white px-2 font-mono text-[10px] font-bold text-violet-600 shadow-sm disabled:text-amber-500">{formatDuration(bookmark.startSeconds)}</button>
                    <div className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-slate-800">{bookmark.label || `书签 ${formatDuration(bookmark.startSeconds)}`}</strong><span className="mt-1 block text-[9px] text-slate-400">{bookmark.endSeconds ? `片段至 ${formatDuration(bookmark.endSeconds)}` : "单点书签"}{unavailable ? " · 当前片源不可达" : ""}</span>{bookmark.note && !editing && <p className="mt-1 text-[9px] leading-4 text-slate-500">{bookmark.note}</p>}</div>
                    <button type="button" onClick={() => setEditingBookmark(editing ? null : { id: bookmark.id, label: bookmark.label || "", note: bookmark.note || "" })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500" title="编辑书签"><Pencil size={13} /></button>
                  </div>
                  {editing && editingBookmark && (
                    <div className="mt-2 grid gap-2 rounded-xl bg-white p-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input value={editingBookmark.label} onChange={(event) => setEditingBookmark({ ...editingBookmark, label: event.target.value })} placeholder="书签名称" className="min-h-10 rounded-lg border border-slate-200 px-3 text-[10px]" />
                      <input value={editingBookmark.note} onChange={(event) => setEditingBookmark({ ...editingBookmark, note: event.target.value })} placeholder="备注" className="min-h-10 rounded-lg border border-slate-200 px-3 text-[10px]" />
                      <button type="button" onClick={() => { onAction("save-playback-bookmark", { ...bookmark, label: editingBookmark.label, note: editingBookmark.note }); setEditingBookmark(null); }} className="min-h-10 rounded-lg bg-violet-600 px-3 text-[10px] font-bold text-white">保存</button>
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button type="button" disabled={unavailable} onClick={() => onSeekBookmark(bookmark)} className="min-h-10 rounded-xl bg-white text-[9px] font-bold text-sky-600 disabled:opacity-45"><Play size={12} className="mr-1 inline" />跳转</button>
                    <button type="button" disabled={unavailable || !bookmark.endSeconds} onClick={() => onLoopBookmark(bookmark)} className="min-h-10 rounded-xl bg-white text-[9px] font-bold text-fuchsia-600 disabled:opacity-45"><Repeat2 size={12} className="mr-1 inline" />循环</button>
                    <button type="button" onClick={() => onAction("delete-playback-bookmark", { movieId: bookmark.movieId, bookmarkId: bookmark.id })} className="min-h-10 rounded-xl bg-rose-50 text-[9px] font-bold text-rose-600"><Trash2 size={12} className="mr-1 inline" />删除</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {!history.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">还没有放映足迹</p>}
            {[...history].reverse().map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectHistory(item)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${item.id === session?.id ? "border-violet-200 bg-violet-50" : "border-slate-100 bg-slate-50/65 hover:bg-violet-50/55"}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-500 shadow-sm"><Film size={16} /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-slate-800">{item.title}</strong><span className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><Clock3 size={10} />{new Date(item.fetchedAt).toLocaleString("zh-CN", { hour12: false })} · {item.sources.length} 线</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
