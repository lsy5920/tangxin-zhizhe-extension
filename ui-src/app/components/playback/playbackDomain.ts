import type { FullDetail } from "../../types";

export type PlaybackLine = {
  key: "play" | "backup";
  label: string;
  url?: string;
  stat?: FullDetail["fullStat"];
  copyAction: string;
  openAction: string;
};

export type PlaybackPreviewKey = "recommended" | "play" | "backup" | "record";

/** 综合分片、时长、延迟和 HTTP 状态评分，备用线更好时允许成为推荐线路。 */
export function lineScore(line?: PlaybackLine | null) {
  if (!line?.url) return -10000;
  const stat = line.stat;
  if (!stat) return 15;
  if (stat.error) return -800 + Math.min(50, Number(stat.segments || 0));
  if (stat.pending) return 25;
  let score = 100;
  const status = Number(stat.status || 0);
  if (status >= 200 && status < 400) score += 60;
  else if (status > 0) score -= 40;
  const segments = Number(stat.segments || 0);
  const duration = Number(stat.duration || 0);
  const latency = Number((stat as { latencyMs?: number }).latencyMs || 0);
  score += Math.min(50, segments / 4);
  score += Math.min(40, duration / 20);
  if (latency > 0) score += Math.max(0, 50 - Math.min(50, latency / 80));
  if (segments <= 0 && duration <= 0) score -= 20;
  return score;
}

export function lineState(line: PlaybackLine) {
  if (!line.url) return { label: "缺少链接", color: "text-danger-600", bg: "border-danger-100 bg-danger-50/60", ready: false, score: -10000 };
  if (line.stat?.error) return { label: "探测异常", color: "text-warning-600", bg: "border-warning-100 bg-warning-50/60", ready: false, score: lineScore(line) };
  if (line.stat?.pending) return { label: "探测中", color: "text-info-600", bg: "border-info-100 bg-info-50/60", ready: true, score: lineScore(line) };
  return { label: "可播放", color: "text-success-600", bg: "border-success-100 bg-success-50/60", ready: true, score: lineScore(line) };
}

export function bestLine(lines: PlaybackLine[]) {
  let best: PlaybackLine | undefined;
  let bestScore = -Infinity;
  for (const line of lines) {
    const score = lineScore(line);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best || lines.find((line) => line.url) || lines[0];
}

export function isPlaylistUrl(url?: string) {
  return /\.m3u8(?:[?#]|$)/i.test(String(url || "")) || /m3u8/i.test(String(url || ""));
}

export function previewLineLabel(key: PlaybackPreviewKey) {
  if (key === "play") return "主线路";
  if (key === "backup") return "备用线路";
  if (key === "record") return "播放记录";
  return "推荐线路";
}

export function playbackTip(latest?: FullDetail) {
  if (!latest) return "打开视频详情页后会自动记录播放资源。";
  if (latest.fullStat?.error && latest.backupStat?.error) return "主备线路探测都异常，建议刷新播放资源或检查账号池。";
  if (!latest.playLink && latest.backupLink) return "主线路缺失，已检测到备用线路，可先使用备用线路或重新刷新资源。";
  if (latest.playLink && latest.backupLink) return "主备线路都已记录，系统会优先使用评分更高的线路。";
  if (latest.playLink) return "主线路已就绪，播放不稳时可刷新资源获取最新链接。";
  return "播放详情缺少可用链接，建议刷新资源或处理账号池。";
}

/** 只使用已有探测数据生成健康状态，不额外发请求，避免与正在播放的视频争抢带宽。 */
export function playbackHealth(latest: FullDetail | undefined, lines: PlaybackLine[], preferredLine?: PlaybackLine) {
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
  if (usableLines.length) {
    if (!errorLines.length) score += 10;
    else if (errorLines.length < lines.length) score += 4;
  }
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
  const tone = score >= 85 ? "text-success-600" : score >= 65 ? "text-info-600" : score >= 35 ? "text-warning-600" : "text-danger-600";
  const bg = score >= 85 ? "bg-success-50" : score >= 65 ? "bg-info-50" : score >= 35 ? "bg-warning-50" : "bg-danger-50";
  const preferredScore = preferredLine ? lineScore(preferredLine) : -Infinity;

  return {
    score,
    label,
    tone,
    bg,
    recommendedLabel: preferredLine?.url ? preferredLine.label : "暂无推荐",
    recommendedScore: Number.isFinite(preferredScore) ? Math.round(preferredScore) : 0,
    risks
  };
}
