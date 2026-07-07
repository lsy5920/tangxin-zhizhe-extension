import { AlertCircle, CheckCircle, Clock, Copy, Download, Film, Layers, Link, RefreshCw, Route, Save, ShieldCheck, Timer, Wifi } from "lucide-react";
import type { BridgeState, DownloadTask, FullDetail, Page } from "../types";
import { absoluteUrl, canSaveDownload, downloadFormat, downloadProgress, downloadStageLabel, downloadTaskForMovie, downloadTitle, formatBytes, formatDuration, latestFullDetail, localizeFlowText, maskUrl, shortTime } from "../helpers";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage?: (page: Page) => void;
};

type PlaybackLine = {
  key: "play" | "backup";
  label: string;
  url?: string;
  stat?: FullDetail["fullStat"];
  copyAction: string;
};

function lineState(line: PlaybackLine) {
  if (!line.url) return { label: "缺少链接", color: "text-rose-600", bg: "bg-rose-50", ready: false };
  if (line.stat?.error) return { label: "探测异常", color: "text-amber-600", bg: "bg-amber-50", ready: false };
  if (line.stat?.pending) return { label: "探测中", color: "text-sky-600", bg: "bg-sky-50", ready: true };
  return { label: "可播放", color: "text-emerald-600", bg: "bg-emerald-50", ready: true };
}

function bestLine(lines: PlaybackLine[]) {
  return lines.find((line) => lineState(line).ready && line.url) || lines.find((line) => line.url);
}

function playbackTip(latest?: FullDetail) {
  if (!latest) return "打开视频详情页后会自动记录播放资源。";
  if (latest.fullStat?.error && latest.backupStat?.error) return "主备线路探测都异常，建议刷新播放资源或检查账号池。";
  if (!latest.playLink && latest.backupLink) return "主线路缺失，已检测到备用线路，可先复制备用线路或重新刷新资源。";
  if (latest.playLink && latest.backupLink) return "主备线路都已记录，播放卡顿时可切换备用线路。";
  if (latest.playLink) return "主线路已就绪，播放不稳时可刷新资源获取最新链接。";
  return "播放详情缺少可用链接，建议刷新资源或处理账号池。";
}

function taskTone(task?: DownloadTask | null) {
  if (!task) return { label: "未创建", color: "bg-purple-50 text-purple-500" };
  if (task.stage === "error") return { label: "下载失败", color: "bg-rose-50 text-rose-600" };
  if (task.stage === "complete") return { label: "已保存", color: "bg-emerald-50 text-emerald-600" };
  if (task.stage === "ready") return { label: "可保存", color: "bg-emerald-50 text-emerald-600" };
  return { label: downloadStageLabel(task.stage), color: "bg-amber-50 text-amber-600" };
}

export function PlaybackPage({ state, onAction, onPage }: Props) {
  const latest = latestFullDetail(state);
  const records = (state.fullDetails || []).slice(-24).reverse();
  const lines: PlaybackLine[] = [
    { key: "play", label: "主线路", url: latest?.playLink, stat: latest?.fullStat, copyAction: "copy-play-link" },
    { key: "backup", label: "备用线路", url: latest?.backupLink, stat: latest?.backupStat, copyAction: "copy-backup-link" }
  ];
  const preferredLine = bestLine(lines);
  const segmentTotal = preferredLine?.stat?.segments || latest?.fullStat?.segments || latest?.backupStat?.segments || 0;
  const duration = preferredLine?.stat?.duration || latest?.fullStat?.duration || latest?.backupStat?.duration;
  const readyCount = lines.filter((line) => lineState(line).ready && line.url).length;
  const fetchedAt = latest?.fetchedAt || String((latest as { ts?: string } | undefined)?.ts || "");
  const currentTask = downloadTaskForMovie(state, latest?.movieId);
  const taskProgress = currentTask ? downloadProgress(currentTask) : 0;
  const currentTaskTone = taskTone(currentTask);

  return (
    <div className="space-y-4 p-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-400 to-violet-500 p-4 text-white shadow-lg">
        <div className="absolute right-3 top-2 select-none text-5xl opacity-15 pointer-events-none">🎬</div>
        <p className="mb-0.5 text-[10px] opacity-70 uppercase tracking-wider">最近视频</p>
        <h3 className="mb-2 pr-10 text-sm font-bold leading-snug">
          {latest?.movieTitle || latest?.title || latest?.movieId || "等待播放详情"}
        </h3>
        <div className="flex items-center gap-1.5 text-xs mb-3">
          {latest ? <CheckCircle size={12} className="text-emerald-300 shrink-0" /> : <AlertCircle size={12} className="text-amber-200 shrink-0" />}
          <span className="opacity-85">
            {latest
              ? `已获取播放详情 · ${readyCount || 0} 条可用线路 · ${segmentTotal || "?"} 个分片${duration ? ` · ${formatDuration(duration)}` : ""}`
              : "打开视频详情页后会记录完整播放资源"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">M3U8</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">{latest?.accountLabel || latest?.accountUser || "自动轮换账号"}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">{localizeFlowText(latest?.action || "full_detail")}</span>
          {fetchedAt && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">{shortTime(fetchedAt)}</span>}
        </div>
        {preferredLine?.url && (
          <div className="flex items-center gap-1.5 mb-2 rounded-lg bg-black/20 px-2 py-1.5">
            <Link size={10} className="shrink-0 text-white/60" />
            <span className="flex-1 truncate text-[10px] text-white/80 font-mono">{preferredLine.label} · {maskUrl(preferredLine.url)}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAction("refresh-full-detail", { movieId: latest?.movieId || "" })}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 px-3 py-1.5 text-xs font-medium backdrop-blur transition-all"
          >
            <RefreshCw size={12} /> 刷新资源
          </button>
          <button
            onClick={() => onAction("download-full-video", { movieId: latest?.movieId || "" })}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 px-3 py-1.5 text-xs font-medium backdrop-blur transition-all"
          >
            <Download size={12} /> 下载视频
          </button>
          {preferredLine?.url && (
            <button
              onClick={() => onAction(preferredLine.copyAction, { url: preferredLine.url, label: `${preferredLine.label}完整链接` })}
              className="flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 px-3 py-1.5 text-xs font-medium backdrop-blur transition-all"
            >
              <Copy size={12} /> 复制完整链接
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700">
              <ShieldCheck size={14} className="text-emerald-400" /> 播放就绪
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-purple-400">{playbackTip(latest)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${readyCount ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {readyCount ? `${readyCount} 条可用` : "待获取"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {lines.map((line) => {
            const stateInfo = lineState(line);
            return (
              <div key={line.key} className={`rounded-2xl ${stateInfo.bg} p-3`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`flex items-center gap-1 text-xs font-semibold ${stateInfo.color}`}>
                    <Route size={12} /> {line.label}
                  </p>
                  <span className={`text-[10px] ${stateInfo.color}`}>{stateInfo.label}</span>
                </div>
                <p className="truncate font-mono text-[10px] text-purple-500">{line.url ? maskUrl(line.url) : "暂无链接"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-500">{line.stat?.segments ? `${line.stat.segments} 分片` : "分片未知"}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-500">{line.stat?.duration ? formatDuration(line.stat.duration) : "时长未知"}</span>
                  {line.stat?.status && <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-500">HTTP {line.stat.status}</span>}
                </div>
                {line.stat?.error && <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-amber-600">{line.stat.error}</p>}
                <button
                  onClick={() => onAction(line.copyAction, { url: line.url || "", label: `${line.label}完整链接` })}
                  disabled={!line.url}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-white/80 px-3 py-1.5 text-[11px] font-medium text-purple-500 shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                >
                  <Copy size={11} /> 复制完整链接
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-purple-700">
          <Layers size={14} className="text-purple-400" /> 分片统计
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "总分片", value: segmentTotal || "—", color: "text-purple-600", bg: "bg-purple-50" },
            { label: "总时长", value: duration ? formatDuration(duration) : "—", color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "状态", value: readyCount ? "正常" : latest ? "异常" : "—", color: readyCount ? "text-sky-600" : "text-rose-600", bg: readyCount ? "bg-sky-50" : "bg-rose-50" }
          ].map((item) => (
            <div key={item.label} className={`${item.bg} rounded-xl p-2.5 text-center`}>
              <p className={`text-base font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-purple-400 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-purple-400">
            <span>数据完整性</span>
            <span>{segmentTotal ? `${segmentTotal} 个分片` : "等待数据"}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-pink-100">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-violet-500 transition-all" style={{ width: latest ? "100%" : "6%" }} />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700">
              <Download size={14} className="text-amber-400" /> 当前视频下载
            </h3>
            <p className="mt-1 truncate text-xs text-purple-400">
              {currentTask ? downloadTitle(currentTask) : latest ? "当前视频还没有下载任务。" : "等待视频播放详情后可创建下载任务。"}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${currentTaskTone.color}`}>{currentTaskTone.label}</span>
        </div>
        {currentTask ? (
          <div className="space-y-2 rounded-2xl bg-purple-50 p-3">
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full bg-white px-2 py-0.5 text-purple-500">{downloadFormat(currentTask)}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-sky-500">{formatBytes(currentTask.bytes)}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-gray-400">{shortTime(currentTask.updatedAt)}</span>
            </div>
            {currentTask.stage !== "complete" && (
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-purple-400">
                  <span>{downloadStageLabel(currentTask.stage)}</span>
                  <span>{currentTask.total ? `${currentTask.current || 0}/${currentTask.total}` : `${taskProgress}%`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${taskProgress}%` }} />
                </div>
              </div>
            )}
            {(currentTask.error || currentTask.transmuxError) && (
              <p className="rounded-xl bg-rose-50 p-2 text-[10px] leading-relaxed text-rose-600">{currentTask.error || `MP4转封装失败，TS已保留：${currentTask.transmuxError}`}</p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-purple-50 p-3 text-[11px] leading-relaxed text-purple-400">
            点击「下载视频」后，下载任务会在这里显示进度；任务创建后可直接保存到设备或进入下载页查看全部记录。
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => currentTask ? onAction("save-download-device", { taskId: currentTask.taskId || "" }) : onAction("download-full-video", { movieId: latest?.movieId || "" })}
            disabled={currentTask ? !canSaveDownload(currentTask) : !latest?.movieId}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 py-2 text-xs font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-45"
          >
            {currentTask ? <><Save size={13} /> 保存到设备</> : <><Download size={13} /> 创建下载任务</>}
          </button>
          <button
            onClick={() => onPage?.("downloads")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-purple-200 py-2 text-xs font-medium text-purple-500 transition-transform active:scale-95"
          >
            <Layers size={13} /> 下载页
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700">
            <Film size={14} className="text-pink-400" /> 播放记录
          </h3>
          <span className="text-[10px] text-purple-400">{records.length} 条</span>
        </div>
        <div className="space-y-2">
          {records.length ? records.map((item, index) => {
            // 播放记录支持直接续操作，减少用户回到详情页反复查找。
            const recordUrl = absoluteUrl(item.playLink || item.backupLink || "");
            const recordTask = downloadTaskForMovie(state, item.movieId);
            const recordTaskProgress = recordTask ? downloadProgress(recordTask) : 0;
            const recordTaskState = taskTone(recordTask);
            return (
              <div key={`${item.movieId}-${index}`} className="rounded-2xl border border-pink-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-purple-800">{item.movieTitle || item.title || item.movieId || "播放详情"}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      {recordUrl ? <CheckCircle size={10} className="shrink-0 text-emerald-400" /> : <AlertCircle size={10} className="shrink-0 text-rose-400" />}
                      <p className="truncate text-[10px] text-purple-400">
                        {recordUrl ? `已就绪 · ${maskUrl(recordUrl)}` : "播放详情缺少链接"}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${recordTaskState.color}`}>
                    {recordTaskState.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="flex items-center gap-0.5 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] text-purple-500"><Wifi size={9} /> M3U8</span>
                  <span className="flex items-center gap-0.5 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-500"><Layers size={9} /> {item.fullStat?.segments || "?"} 分片</span>
                  {item.fullStat?.duration && (
                    <span className="flex items-center gap-0.5 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-500"><Timer size={9} /> {formatDuration(item.fullStat.duration)}</span>
                  )}
                  <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[10px] text-pink-500">{item.accountLabel || item.accountUser || "自动账号"}</span>
                  <span className="flex items-center gap-0.5 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-400"><Clock size={9} /> {shortTime(String((item as { ts?: string }).ts || item.fetchedAt || ""))}</span>
                </div>
                {recordTask && recordTask.stage !== "complete" && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between text-[10px] text-purple-400">
                      <span>{downloadStageLabel(recordTask.stage)}</span>
                      <span>{recordTask.total ? `${recordTask.current || 0}/${recordTask.total}` : `${recordTaskProgress}%`}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-pink-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${recordTaskProgress}%` }} />
                    </div>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onAction("copy-play-link", { url: recordUrl, label: "播放记录完整链接" })}
                    disabled={!recordUrl}
                    className="flex items-center justify-center gap-1 rounded-xl border border-purple-200 px-2 py-1.5 text-[11px] text-purple-500 transition-transform active:scale-95 disabled:opacity-45"
                    title="复制完整链接"
                  >
                    <Copy size={11} /> 复制
                  </button>
                  <button
                    onClick={() => onAction("refresh-full-detail", { movieId: item.movieId || "" })}
                    disabled={!item.movieId}
                    className="flex items-center justify-center gap-1 rounded-xl border border-sky-200 px-2 py-1.5 text-[11px] text-sky-500 transition-transform active:scale-95 disabled:opacity-45"
                    title="刷新该视频资源"
                  >
                    <RefreshCw size={11} /> 刷新
                  </button>
                  <button
                    onClick={() => onAction("download-full-video", { movieId: item.movieId || "" })}
                    disabled={!item.movieId}
                    className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 px-2 py-1.5 text-[11px] font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-45"
                    title="下载该视频"
                  >
                    <Download size={11} /> 下载
                  </button>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-pink-100 bg-white p-4 text-xs text-purple-400 shadow-sm">还没有播放详情记录。打开视频详情页后即会自动记录。</div>
          )}
        </div>
      </div>
    </div>
  );
}
