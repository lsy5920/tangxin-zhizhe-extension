import { useState } from "react";
import { Activity, AlertCircle, CheckCircle, Clock, Copy, Download, Film, Gauge, Layers, Link, RefreshCw, Route, Save, Search, ShieldCheck, Signal, Timer, Wifi } from "lucide-react";
import type { BridgeState, DownloadTask, FullDetail, Page } from "../types";
import { absoluteUrl, canSaveDownload, downloadFormat, downloadProgress, downloadStageLabel, downloadTaskForMovie, downloadTitle, formatBytes, formatDuration, isRunningDownloadTask, latestFullDetail, localizeFlowText, maskUrl, shortTime } from "../helpers";

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

type PlaybackRecordFilter = "all" | "downloadable" | "saveable" | "failed" | "backup";

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

function playbackHealth(latest: FullDetail | undefined, lines: PlaybackLine[], preferredLine?: PlaybackLine) {
  // 播放体检只使用当前已捕获的探测数据，不额外发请求，避免影响用户正在播放的视频。
  const usableLines = lines.filter((line) => line.url && !line.stat?.error);
  const readyLines = lines.filter((line) => lineState(line).ready && line.url);
  const errorLines = lines.filter((line) => line.stat?.error);
  const pendingLines = lines.filter((line) => line.stat?.pending);
  const segmentTotal = preferredLine?.stat?.segments || latest?.fullStat?.segments || latest?.backupStat?.segments || 0;
  const duration = preferredLine?.stat?.duration || latest?.fullStat?.duration || latest?.backupStat?.duration || 0;
  const risks: string[] = [];
  let score = 0;

  if (latest) score += 15;
  if (usableLines.length) score += 30;
  if (readyLines.length > 1) score += 15;
  else if (readyLines.length === 1) score += 10;
  if (segmentTotal) score += 20;
  if (duration) score += 10;
  if (!errorLines.length && usableLines.length) score += 10;
  else if (errorLines.length < lines.length) score += 4;
  score = Math.max(0, Math.min(100, score));

  if (!latest) {
    risks.push("等待打开视频详情页后捕获播放资源。");
  } else {
    if (!usableLines.length) risks.push("暂未检测到可用线路，建议刷新播放资源或检查账号池。");
    if (errorLines.length === lines.length) risks.push("主备线路都出现探测异常，需要优先刷新资源。");
    else errorLines.forEach((line) => risks.push(`${line.label}探测异常，可先使用另一条线路。`));
    if (pendingLines.length) risks.push("仍有线路在探测中，稍等片刻后可再次查看体检结果。");
    if (!segmentTotal) risks.push("分片数量未知，播放卡顿时建议先刷新资源。");
    if (usableLines.length === 1) risks.push("仅检测到一条线路，建议保留备用线路用于卡顿时切换。");
    if (!risks.length) risks.push("线路信息完整，可以优先使用推荐线路播放或下载。");
  }

  const label = score >= 85 ? "优秀" : score >= 65 ? "可用" : score >= 35 ? "需观察" : latest ? "待刷新" : "待捕获";
  const tone = score >= 85 ? "text-emerald-600" : score >= 65 ? "text-sky-600" : score >= 35 ? "text-amber-600" : "text-rose-600";
  const bg = score >= 85 ? "bg-emerald-50" : score >= 65 ? "bg-sky-50" : score >= 35 ? "bg-amber-50" : "bg-rose-50";
  const summary = preferredLine?.url
    ? `推荐优先使用${preferredLine.label}，体检分 ${score}。`
    : "暂未找到可推荐线路。";

  return {
    score,
    label,
    tone,
    bg,
    summary,
    recommendedLabel: preferredLine?.url ? preferredLine.label : "暂无推荐",
    riskCount: latest ? Math.max(0, risks.filter((item) => !item.includes("信息完整")).length) : risks.length,
    risks
  };
}

function lineReport(line: PlaybackLine) {
  const stateInfo = lineState(line);
  const lineUrl = absoluteUrl(line.url || "");
  return [
    `${line.label}：${stateInfo.label}`,
    `完整链接：${lineUrl || "暂无"}`,
    `分片数量：${line.stat?.segments || "未知"}`,
    `视频时长：${line.stat?.duration ? formatDuration(line.stat.duration) : "未知"}`,
    `HTTP 状态：${line.stat?.status || "未知"}`,
    line.stat?.error ? `异常信息：${line.stat.error}` : ""
  ].filter(Boolean).join("\n");
}

function playbackHealthReport(
  latest: FullDetail | undefined,
  lines: PlaybackLine[],
  health: ReturnType<typeof playbackHealth>,
  currentTask?: DownloadTask | null
) {
  // 报告面向排障复制，保留完整链接和关键状态，避免用户手动拼截图信息。
  const fetchedAt = latest?.fetchedAt || String((latest as { ts?: string } | undefined)?.ts || "");
  const taskUrl = absoluteUrl(currentTask?.url || "");
  const taskLines = currentTask ? [
    `任务名称：${downloadTitle(currentTask)}`,
    `任务状态：${downloadStageLabel(currentTask.stage)}`,
    `输出格式：${downloadFormat(currentTask)}`,
    `文件大小：${formatBytes(currentTask.bytes)}`,
    `更新时间：${currentTask.updatedAt || "未记录"}`,
    `完整源链接：${taskUrl || "暂无"}`,
    currentTask.error ? `失败原因：${currentTask.error}` : "",
    currentTask.transmuxError ? `转封装异常：${currentTask.transmuxError}` : ""
  ].filter(Boolean) : ["当前视频还没有下载任务。"];

  return [
    "糖心志者播放资源体检报告",
    `视频标题：${latest?.movieTitle || latest?.title || "未记录"}`,
    `视频编号：${latest?.movieId || "未记录"}`,
    `账号：${latest?.accountLabel || latest?.accountUser || "未记录"}`,
    `获取时间：${fetchedAt || "未记录"}`,
    `体检分：${health.score}`,
    `体检状态：${health.label}`,
    `推荐线路：${health.recommendedLabel}`,
    "",
    "风险提示：",
    ...health.risks.map((item) => `- ${item}`),
    "",
    "线路详情：",
    ...lines.map(lineReport),
    "",
    "下载任务：",
    ...taskLines
  ].join("\n");
}

function playbackRecordReport(item: FullDetail, recordTask?: DownloadTask | null) {
  // 单条播放记录报告面向历史视频排查，保留主备线路和关联下载任务状态。
  const playUrl = absoluteUrl(item.playLink || "");
  const backupUrl = absoluteUrl(item.backupLink || "");
  const taskUrl = absoluteUrl(recordTask?.url || "");
  const taskLines = recordTask ? [
    `任务名称：${downloadTitle(recordTask)}`,
    `任务状态：${downloadStageLabel(recordTask.stage)}`,
    `输出格式：${downloadFormat(recordTask)}`,
    `下载进度：${recordTask.total ? `${recordTask.current || 0}/${recordTask.total}` : `${downloadProgress(recordTask)}%`}`,
    `文件大小：${formatBytes(recordTask.bytes)}`,
    `更新时间：${recordTask.updatedAt || "未记录"}`,
    `完整源链接：${taskUrl || "暂无"}`,
    recordTask.error ? `失败原因：${recordTask.error}` : "",
    recordTask.transmuxError ? `转封装异常：${recordTask.transmuxError}` : ""
  ].filter(Boolean) : ["当前播放记录还没有下载任务。"];

  return [
    "糖心志者播放记录报告",
    `视频标题：${item.movieTitle || item.title || "未记录"}`,
    `视频编号：${item.movieId || "未记录"}`,
    `账号：${item.accountLabel || item.accountUser || "未记录"}`,
    `获取时间：${String((item as { ts?: string }).ts || item.fetchedAt || "") || "未记录"}`,
    `主线路：${playUrl || "暂无"}`,
    `备用线路：${backupUrl || "暂无"}`,
    `主线路分片：${item.fullStat?.segments || "未知"}`,
    `主线路时长：${item.fullStat?.duration ? formatDuration(item.fullStat.duration) : "未知"}`,
    `主线路状态：${item.fullStat?.status || "未知"}`,
    item.fullStat?.error ? `主线路异常：${item.fullStat.error}` : "",
    `备用线路分片：${item.backupStat?.segments || "未知"}`,
    `备用线路时长：${item.backupStat?.duration ? formatDuration(item.backupStat.duration) : "未知"}`,
    `备用线路状态：${item.backupStat?.status || "未知"}`,
    item.backupStat?.error ? `备用线路异常：${item.backupStat.error}` : "",
    "",
    "下载任务：",
    ...taskLines
  ].filter((line) => line !== "").join("\n");
}

function taskTone(task?: DownloadTask | null) {
  if (!task) return { label: "未创建", color: "bg-purple-50 text-purple-500" };
  if (task.stage === "error") return { label: "下载失败", color: "bg-rose-50 text-rose-600" };
  if (task.stage === "complete") return { label: "已保存", color: "bg-emerald-50 text-emerald-600" };
  if (task.stage === "ready") return { label: "可保存", color: "bg-emerald-50 text-emerald-600" };
  return { label: downloadStageLabel(task.stage), color: "bg-amber-50 text-amber-600" };
}

export function PlaybackPage({ state, onAction, onPage }: Props) {
  const [recordFilter, setRecordFilter] = useState<PlaybackRecordFilter>("all");
  const [recordSearch, setRecordSearch] = useState("");
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
  const currentTaskUrl = absoluteUrl(currentTask?.url || "");
  const preferredLineUrl = absoluteUrl(preferredLine?.url || "");
  const health = playbackHealth(latest, lines, preferredLine);
  const healthReport = playbackHealthReport(latest, lines, health, currentTask);
  const recordRows = records.map((item, index) => {
    // 播放记录筛选全部使用本地已有状态，避免为了筛选再次请求播放接口。
    const recordUrl = absoluteUrl(item.playLink || item.backupLink || "");
    const recordTask = downloadTaskForMovie(state, item.movieId);
    const recordCanSave = recordTask ? canSaveDownload(recordTask) : false;
    const recordRunning = recordTask ? isRunningDownloadTask(recordTask) : false;
    const recordFailed = recordTask?.stage === "error" || Boolean(item.fullStat?.error || item.backupStat?.error);
    const recordCanDownload = Boolean(item.movieId) && !recordTask;
    const searchText = [
      item.movieTitle,
      item.title,
      item.movieId,
      item.accountLabel,
      item.accountUser,
      item.playLink,
      item.backupLink,
      recordTask ? downloadTitle(recordTask) : ""
    ].filter(Boolean).join(" ").toLowerCase();
    return {
      item,
      index,
      recordUrl,
      recordTask,
      recordCanSave,
      recordRunning,
      recordFailed,
      recordCanDownload,
      searchText
    };
  });
  const recordStats = {
    total: recordRows.length,
    downloadable: recordRows.filter((row) => row.recordCanDownload).length,
    saveable: recordRows.filter((row) => row.recordCanSave).length,
    failed: recordRows.filter((row) => row.recordFailed).length,
    backup: recordRows.filter((row) => Boolean(row.item.backupLink)).length
  };
  const recordFilterItems: { key: PlaybackRecordFilter; label: string; value: number; color: string }[] = [
    { key: "all", label: "全部", value: recordStats.total, color: "text-purple-600" },
    { key: "downloadable", label: "可下载", value: recordStats.downloadable, color: "text-pink-600" },
    { key: "saveable", label: "可保存", value: recordStats.saveable, color: "text-emerald-600" },
    { key: "failed", label: "失败", value: recordStats.failed, color: "text-rose-600" },
    { key: "backup", label: "有备用", value: recordStats.backup, color: "text-sky-600" }
  ];
  const recordKeyword = recordSearch.trim().toLowerCase();
  const filteredRecordRows = recordRows.filter((row) => {
    if (recordFilter === "downloadable" && !row.recordCanDownload) return false;
    if (recordFilter === "saveable" && !row.recordCanSave) return false;
    if (recordFilter === "failed" && !row.recordFailed) return false;
    if (recordFilter === "backup" && !row.item.backupLink) return false;
    return !recordKeyword || row.searchText.includes(recordKeyword);
  });

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
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">体检 {health.score} 分</span>
          {fetchedAt && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur">{shortTime(fetchedAt)}</span>}
        </div>
        {preferredLineUrl && (
          <div className="flex items-center gap-1.5 mb-2 rounded-lg bg-black/20 px-2 py-1.5">
            <Link size={10} className="shrink-0 text-white/60" />
            <span className="flex-1 truncate text-[10px] text-white/80 font-mono">{preferredLine?.label} · {maskUrl(preferredLineUrl)}</span>
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
              onClick={() => onAction(preferredLine.copyAction, { url: preferredLineUrl, label: `${preferredLine.label}完整链接` })}
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
        <div className="grid gap-2 sm:grid-cols-3">
          <div className={`rounded-xl px-3 py-2 ${health.bg}`}>
            <p className={`flex items-center gap-1 text-xs font-semibold ${health.tone}`}>
              <Gauge size={12} /> 体检分
            </p>
            <p className={`mt-1 text-lg font-bold ${health.tone}`}>{health.score}</p>
            <p className="text-[10px] text-purple-400">{health.label}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-3 py-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-sky-600">
              <Signal size={12} /> 推荐线路
            </p>
            <p className="mt-1 truncate text-sm font-bold text-sky-600">{health.recommendedLabel}</p>
            <p className="text-[10px] text-purple-400">{readyCount ? `${readyCount} 条可用线路` : "等待线路"}</p>
          </div>
          <div className="rounded-xl bg-purple-50 px-3 py-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-purple-600">
              <Activity size={12} /> 风险项
            </p>
            <p className="mt-1 text-lg font-bold text-purple-600">{health.riskCount}</p>
            <p className="truncate text-[10px] text-purple-400">{health.summary}</p>
          </div>
        </div>
        <div className="space-y-1 rounded-xl bg-gray-50 p-2">
          {health.risks.slice(0, 3).map((item) => (
            <p key={item} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-purple-500">
              <Activity size={10} className="mt-0.5 shrink-0 text-purple-300" />
              <span>{item}</span>
            </p>
          ))}
        </div>
        <button
          onClick={() => onAction("copy-playback-health-report", { report: healthReport })}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-purple-200 px-3 py-2 text-xs font-medium text-purple-500 transition-transform active:scale-95"
          title="复制当前播放资源体检报告"
        >
          <Copy size={13} /> 复制体检报告
        </button>
        <div className="grid gap-2 sm:grid-cols-2">
          {lines.map((line) => {
            const stateInfo = lineState(line);
            const lineUrl = absoluteUrl(line.url || "");
            return (
              <div key={line.key} className={`rounded-2xl ${stateInfo.bg} p-3`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`flex items-center gap-1 text-xs font-semibold ${stateInfo.color}`}>
                    <Route size={12} /> {line.label}
                  </p>
                  <span className={`text-[10px] ${stateInfo.color}`}>{stateInfo.label}</span>
                </div>
                <p className="truncate font-mono text-[10px] text-purple-500">{lineUrl ? maskUrl(lineUrl) : "暂无链接"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-500">{line.stat?.segments ? `${line.stat.segments} 分片` : "分片未知"}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-500">{line.stat?.duration ? formatDuration(line.stat.duration) : "时长未知"}</span>
                  {line.stat?.status && <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-500">HTTP {line.stat.status}</span>}
                </div>
                {line.stat?.error && <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-amber-600">{line.stat.error}</p>}
                <button
                  onClick={() => onAction(line.copyAction, { url: lineUrl, label: `${line.label}完整链接` })}
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
            {currentTaskUrl && (
              <div className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5">
                <Link size={11} className="shrink-0 text-purple-300" />
                <span className="shrink-0 text-[10px] font-medium text-purple-400">完整源链接</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-purple-500">{maskUrl(currentTaskUrl)}</span>
              </div>
            )}
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
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              // 下载失败时直接重新创建当前视频任务，其他可保存状态继续走保存流程。
              if (currentTask?.stage === "error") onAction("download-full-video", { movieId: currentTask.movieId || latest?.movieId || "" });
              else if (currentTask) onAction("save-download-device", { taskId: currentTask.taskId || "" });
              else onAction("download-full-video", { movieId: latest?.movieId || "" });
            }}
            disabled={currentTask ? currentTask.stage !== "error" && !canSaveDownload(currentTask) : !latest?.movieId}
            className="flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 py-2 text-xs font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-45"
          >
            {currentTask?.stage === "error" ? <><RefreshCw size={13} /> 重试下载</> : currentTask ? <><Save size={13} /> 保存到设备</> : <><Download size={13} /> 创建下载任务</>}
          </button>
          {currentTaskUrl && (
            <button
              onClick={() => onAction("copy-download-url", { taskId: currentTask?.taskId || "" })}
              className="flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-200 py-2 text-xs font-medium text-sky-500 transition-transform active:scale-95"
            >
              <Copy size={13} /> 复制链接
            </button>
          )}
          <button
            onClick={() => onPage?.("downloads")}
            className="flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-xl border border-purple-200 py-2 text-xs font-medium text-purple-500 transition-transform active:scale-95"
          >
            <Layers size={13} /> 下载页
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700">
            <Film size={14} className="text-pink-400" /> 播放记录
          </h3>
          <span className="text-[10px] text-purple-400">{filteredRecordRows.length}/{recordStats.total} 条</span>
        </div>
        <div className="rounded-2xl border border-pink-100 bg-white p-2 shadow-sm">
          <div className="flex items-center gap-2 rounded-xl bg-purple-50 px-2.5 py-1.5">
            <Search size={12} className="shrink-0 text-purple-300" />
            <input
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.target.value)}
              placeholder="搜索标题、编号、账号或链接"
              className="min-w-0 flex-1 bg-transparent text-xs text-purple-700 outline-none placeholder:text-purple-300"
            />
            {recordSearch && (
              <button onClick={() => setRecordSearch("")} className="rounded-full bg-white px-2 py-0.5 text-[10px] text-purple-400">
                清除
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {recordFilterItems.map((filterItem) => {
              const active = recordFilter === filterItem.key;
              return (
                <button
                  key={filterItem.key}
                  onClick={() => setRecordFilter(filterItem.key)}
                  className={`rounded-xl px-1 py-1.5 text-center transition-all ${active ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm" : "text-purple-300 hover:bg-purple-50"}`}
                >
                  <p className={`text-sm font-bold ${active ? "text-white" : filterItem.color}`}>{filterItem.value}</p>
                  <p className="mt-0.5 text-[9px]">{filterItem.label}</p>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          {filteredRecordRows.length ? filteredRecordRows.map(({ item, index, recordUrl, recordTask, recordCanSave, recordRunning }) => {
            // 播放记录支持直接续操作，减少用户回到详情页反复查找。
            const recordTaskProgress = recordTask ? downloadProgress(recordTask) : 0;
            const recordTaskState = taskTone(recordTask);
            const recordPrimaryAction = recordTask?.stage === "error" ? "重试" : recordCanSave ? "保存" : recordRunning ? "查看" : "下载";
            const recordReport = playbackRecordReport(item, recordTask);
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
                    onClick={() => onAction("copy-playback-health-report", { report: recordReport })}
                    className="flex items-center justify-center gap-1 rounded-xl border border-purple-200 px-2 py-1.5 text-[11px] text-purple-500 transition-transform active:scale-95 disabled:opacity-45"
                    title="复制该播放记录报告"
                  >
                    <Copy size={11} /> 报告
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
                    onClick={() => {
                      // 播放记录里的主按钮按当前下载状态智能切换，减少用户再跳回下载页找任务。
                      if (recordTask?.stage === "error") onAction("download-full-video", { movieId: recordTask.movieId || item.movieId || "" });
                      else if (recordCanSave) onAction("save-download-device", { taskId: recordTask?.taskId || "" });
                      else if (recordRunning) onPage?.("downloads");
                      else onAction("download-full-video", { movieId: item.movieId || "" });
                    }}
                    disabled={recordCanSave ? !recordTask?.taskId : !item.movieId}
                    className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 px-2 py-1.5 text-[11px] font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-45"
                    title={recordCanSave ? "保存该视频到设备" : recordTask?.stage === "error" ? "重新创建下载任务" : recordRunning ? "查看下载任务" : "下载该视频"}
                  >
                    {recordCanSave ? <Save size={11} /> : recordTask?.stage === "error" ? <RefreshCw size={11} /> : recordRunning ? <Layers size={11} /> : <Download size={11} />} {recordPrimaryAction}
                  </button>
                </div>
              </div>
            );
          }) : records.length ? (
            <div className="rounded-2xl border border-pink-100 bg-white p-4 text-xs text-purple-400 shadow-sm">
              当前搜索或筛选没有匹配的播放记录，可切换到「全部」或清除搜索词后再看。
            </div>
          ) : (
            <div className="rounded-2xl border border-pink-100 bg-white p-4 text-xs text-purple-400 shadow-sm">还没有播放详情记录。打开视频详情页后即会自动记录。</div>
          )}
        </div>
      </div>
    </div>
  );
}
