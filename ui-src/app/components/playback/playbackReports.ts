import type { DownloadTask, FullDetail } from "../../types";
import { absoluteUrl, downloadFormat, downloadProgress, downloadStageLabel, downloadTitle, formatBytes, formatDuration } from "../../helpers";
import { lineState, playbackHealth, type PlaybackLine } from "./playbackDomain";

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

export function playbackHealthReport(
  latest: FullDetail | undefined,
  lines: PlaybackLine[],
  health: ReturnType<typeof playbackHealth>,
  currentTask?: DownloadTask | null
) {
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

export function playbackRecordReport(item: FullDetail, recordTask?: DownloadTask | null) {
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

export function playbackRecordsReport(
  rows: { item: FullDetail; recordTask?: DownloadTask | null; recordFailed?: boolean }[],
  filterLabel = "当前筛选"
) {
  const readyCount = rows.filter((row) => absoluteUrl(row.item.playLink || row.item.backupLink || "")).length;
  const failedCount = rows.filter((row) => row.recordFailed).length;
  const backupCount = rows.filter((row) => row.item.backupLink).length;
  const lines = [
    "糖心志者播放记录批量报告",
    `筛选范围：${filterLabel}`,
    `记录数量：${rows.length}`,
    `可播放记录：${readyCount}`,
    `异常记录：${failedCount}`,
    `含备用线路：${backupCount}`,
    `生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    ""
  ];
  rows.forEach((row, index) => {
    const item = row.item;
    const recordTask = row.recordTask || null;
    const playUrl = absoluteUrl(item.playLink || "");
    const backupUrl = absoluteUrl(item.backupLink || "");
    const taskUrl = absoluteUrl(recordTask?.url || "");
    lines.push(
      `${index + 1}. ${item.movieTitle || item.title || item.movieId || "播放详情"}`,
      `视频编号：${item.movieId || "未记录"}`,
      `账号：${item.accountLabel || item.accountUser || "未记录"}`,
      `获取时间：${String((item as { ts?: string }).ts || item.fetchedAt || "") || "未记录"}`,
      `主线路：${playUrl || "暂无"}`,
      `备用线路：${backupUrl || "暂无"}`,
      `主线路分片：${item.fullStat?.segments || "未知"}`,
      `主线路时长：${item.fullStat?.duration ? formatDuration(item.fullStat.duration) : "未知"}`,
      item.fullStat?.error ? `主线路异常：${item.fullStat.error}` : "",
      item.backupStat?.error ? `备用线路异常：${item.backupStat.error}` : "",
      recordTask ? `下载任务：${downloadStageLabel(recordTask.stage)} / ${downloadFormat(recordTask)} / ${recordTask.total ? `${recordTask.current || 0}/${recordTask.total}` : `${downloadProgress(recordTask)}%`}` : "下载任务：未创建",
      recordTask ? `下载源链接：${taskUrl || "暂无"}` : "",
      recordTask?.error ? `下载失败：${recordTask.error}` : "",
      recordTask?.transmuxError ? `转封装异常：${recordTask.transmuxError}` : "",
      ""
    );
  });
  return lines.filter((line) => line !== "").join("\n");
}
