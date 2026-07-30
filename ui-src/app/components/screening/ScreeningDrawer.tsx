import { useEffect, useState } from "react";
import {
  Ban,
  Bookmark,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  Repeat2,
  Route,
  Save,
  Trash2
} from "lucide-react";
import type { PlaybackSession } from "../../playback/types";
import type { BridgeState, PlaybackBookmark } from "../../types";
import { downloadTaskForMovie, formatDuration, maskUrl } from "../../helpers";

type Tab = "sources" | "bookmarks" | "download";

type Props = {
  state: BridgeState;
  session: PlaybackSession | null;
  currentDuration?: number;
  onSeekBookmark: (bookmark: PlaybackBookmark) => void;
  onLoopBookmark: (bookmark: PlaybackBookmark) => void;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

function healthModifier(state?: string) {
  if (state === "healthy") return "is-healthy";
  if (state === "failed") return "is-failed";
  if (state === "degraded") return "is-degraded";
  return "is-unknown";
}

function healthLabel(state?: string) {
  if (state === "healthy") return "健康";
  if (state === "failed") return "异常";
  if (state === "degraded") return "降级";
  return "待验证";
}

const ACTIVE_DOWNLOAD_STAGES = ["queued", "probing", "downloading", "recovering", "assembling"];
const CANCELLABLE_DOWNLOAD_STAGES = [...ACTIVE_DOWNLOAD_STAGES, "paused"];

export function ScreeningDrawer({
  state,
  session,
  currentDuration = 0,
  onSeekBookmark,
  onLoopBookmark,
  onAction
}: Props) {
  const [tab, setTab] = useState<Tab>("sources");
  const [editingBookmark, setEditingBookmark] = useState<{ id: string; label: string; note: string } | null>(null);
  const task = downloadTaskForMovie(state, session?.movieId);
  const bookmarks = session ? state.experience?.bookmarks?.[session.movieId] || [] : [];
  const tabs = [
    { key: "sources" as const, label: "线路", icon: Route, badge: session?.sources.length || 0 },
    { key: "bookmarks" as const, label: "书签", icon: Bookmark, badge: bookmarks.length },
    { key: "download" as const, label: "离线", icon: Download, badge: task ? 1 : 0 }
  ];

  useEffect(() => {
    setTab("sources");
    setEditingBookmark(null);
  }, [session?.movieId]);

  return (
    <section className="txzz-screening-drawer txzz-stream-screening-drawer txzz-playback-hidden-during-fullscreen">
      <header className="txzz-stream-drawer-tabs" role="tablist" aria-label="本场影片工具">
        <div>
          <small>NOW SCREENING</small>
          <strong>本场影片工具</strong>
        </div>
        <nav>
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={tab === key ? "is-active" : ""}
            >
              <Icon size={14} />
              <span>{label}</span>
              <em>{badge}</em>
            </button>
          ))}
        </nav>
      </header>

      <div className="txzz-stream-drawer-body">
        {tab === "sources" && (
          <div className="txzz-stream-source-list">
            {!session?.sources.length && (
              <p className="txzz-stream-drawer-empty">检票完成后，这里会列出可播放的完整线路。</p>
            )}
            {session?.sources.map((source) => {
              const recommended = source.id === session.decision.recommendedSourceId;
              return (
                <article key={source.id} className={recommended ? "is-recommended" : ""}>
                  <div className="txzz-stream-source-heading">
                    <span className="txzz-stream-source-index"><Route size={15} /></span>
                    <div>
                      <strong>{source.label}</strong>
                      <code>{maskUrl(source.url)}</code>
                    </div>
                    {recommended && <mark>正在使用</mark>}
                    <span className={`txzz-stream-source-health ${healthModifier(source.health.state)}`}>
                      {healthLabel(source.health.state)}
                      {Number(source.health.duration || 0) > 0 ? ` · ${formatDuration(source.health.duration)}` : ""}
                    </span>
                  </div>
                  <div className="txzz-stream-source-actions">
                    <button
                      type="button"
                      onClick={() => onAction(source.id === "backup" ? "copy-backup-link" : "copy-play-link", {
                        url: source.url,
                        label: `${source.label}完整链接`
                      })}
                    ><Copy size={13} />复制链接</button>
                    <button type="button" onClick={() => onAction("open-playback-url", { url: source.url, label: source.label })}>
                      <ExternalLink size={13} />新页打开
                    </button>
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => onAction("plan-full-video-download", {
                        movieId: session.movieId,
                        movieTitle: session.title,
                        sourceId: source.id,
                        lineKey: source.id
                      })}
                    ><Download size={13} />下载此线路</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {tab === "bookmarks" && (
          <div className="txzz-stream-bookmark-list">
            {!session && <p className="txzz-stream-drawer-empty">先从影院选择一部影片。</p>}
            {session && !bookmarks.length && (
              <p className="txzz-stream-drawer-empty">在播放器菜单或右键菜单中保存当前位置，也可以保存 A–B 片段。</p>
            )}
            {bookmarks.map((bookmark) => {
              const unavailable = currentDuration > 0 && bookmark.startSeconds > currentDuration;
              const editing = editingBookmark?.id === bookmark.id;
              return (
                <article key={bookmark.id} className={unavailable ? "is-unavailable" : ""}>
                  <button type="button" disabled={unavailable} onClick={() => onSeekBookmark(bookmark)} className="txzz-stream-bookmark-time">
                    {formatDuration(bookmark.startSeconds)}
                  </button>
                  <div className="txzz-stream-bookmark-copy">
                    <strong>{bookmark.label || `书签 ${formatDuration(bookmark.startSeconds)}`}</strong>
                    <small>{bookmark.endSeconds ? `片段至 ${formatDuration(bookmark.endSeconds)}` : "单点书签"}{unavailable ? " · 当前片源不可达" : ""}</small>
                    {bookmark.note && !editing && <p>{bookmark.note}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingBookmark(editing ? null : { id: bookmark.id, label: bookmark.label || "", note: bookmark.note || "" })}
                    className="txzz-stream-bookmark-edit"
                    aria-label="编辑书签"
                  ><Pencil size={14} /></button>

                  {editing && editingBookmark && (
                    <div className="txzz-stream-bookmark-editor">
                      <input value={editingBookmark.label} onChange={(event) => setEditingBookmark({ ...editingBookmark, label: event.target.value })} placeholder="书签名称" />
                      <input value={editingBookmark.note} onChange={(event) => setEditingBookmark({ ...editingBookmark, note: event.target.value })} placeholder="备注" />
                      <button
                        type="button"
                        onClick={() => {
                          onAction("save-playback-bookmark", { ...bookmark, label: editingBookmark.label, note: editingBookmark.note });
                          setEditingBookmark(null);
                        }}
                      ><Save size={13} />保存</button>
                    </div>
                  )}

                  <div className="txzz-stream-bookmark-actions">
                    <button type="button" disabled={unavailable} onClick={() => onSeekBookmark(bookmark)}><Play size={13} />跳转</button>
                    <button type="button" disabled={unavailable || !bookmark.endSeconds} onClick={() => onLoopBookmark(bookmark)}><Repeat2 size={13} />循环片段</button>
                    <button type="button" className="is-danger" onClick={() => onAction("delete-playback-bookmark", { movieId: bookmark.movieId, bookmarkId: bookmark.id })}><Trash2 size={13} />删除</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {tab === "download" && (
          <div className="txzz-stream-current-download">
            {!session ? (
              <p className="txzz-stream-drawer-empty">暂无本场影片。</p>
            ) : task ? (
              <article>
                <div className="txzz-stream-download-heading">
                  <Download size={17} />
                  <div><strong>{task.movieTitle || session.title}</strong><small>{task.stage || "准备中"} · {task.filename || "等待生成文件"}</small></div>
                  <em>{Math.round(Number(task.percent || 0))}%</em>
                </div>
                <div className="txzz-stream-download-progress" aria-label={`下载进度 ${Math.round(Number(task.percent || 0))}%`}>
                  <span style={{ width: `${Math.max(0, Math.min(100, Number(task.percent || 0)))}%` }} />
                </div>
                {task.notBefore && <p><Clock3 size={11} />计划开始：{new Date(task.notBefore).toLocaleString("zh-CN", { hour12: false })}</p>}
                <div className="txzz-stream-download-actions">
                  {ACTIVE_DOWNLOAD_STAGES.includes(String(task.stage)) && <button type="button" onClick={() => onAction("pause-download-task", { taskId: task.taskId })}><Pause size={13} />暂停</button>}
                  {task.stage === "paused" && <button type="button" onClick={() => onAction("resume-download-task", { taskId: task.taskId })}><Play size={13} />继续</button>}
                  {CANCELLABLE_DOWNLOAD_STAGES.includes(String(task.stage)) && <button type="button" className="is-danger" onClick={() => onAction("cancel-download-task", { taskId: task.taskId })}><Ban size={13} />取消</button>}
                  {["ready", "saving", "complete"].includes(String(task.stage)) && <button type="button" className="is-primary" onClick={() => onAction("save-download-device", { taskId: task.taskId })}><Save size={13} />保存到设备</button>}
                </div>
              </article>
            ) : (
              <button
                type="button"
                className="txzz-stream-download-empty"
                onClick={() => onAction("plan-full-video-download", { movieId: session.movieId, movieTitle: session.title, lineKey: "auto" })}
              >
                <Download size={21} />
                <strong>规划本场离线下载</strong>
                <span>先检查线路、画质、空间和清单兼容性</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
