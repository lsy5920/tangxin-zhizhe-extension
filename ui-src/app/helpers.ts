import type { AccountItem, BridgeState, DownloadTask, FlowItem, FullDetail } from "./types";

export function formatTime(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function shortTime(value?: string) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function localizeFlowText(value?: string) {
  if (!value) return "";
  return String(value)
    .replace(/buy_then_full_detail/g, "购买后获取播放详情")
    .replace(/fullplay\.play_link/g, "账号池播放链接")
    .replace(/fullplay\.backup_link/g, "账号池备用链接")
    .replace(/full_detail/g, "播放详情")
    .replace(/fullplay/g, "播放资源")
    .replace(/media\.body/g, "媒体内容")
    .replace(/runtime/g, "运行时")
    .replace(/observed/g, "已观察")
    .replace(/Cloudflare Worker/g, "云端服务")
    .replace(/\bWorker\b/g, "云端服务")
    .replace(/\brequest\b/g, "请求")
    .replace(/\bresponse\b/g, "响应")
    .replace(/\bmedia\b/g, "媒体")
    .replace(/\bhook\b/g, "页面监听")
    .replace(/\bok\b/g, "成功")
    .replace(/\berror\b/g, "失败")
    .replace(/\bidle\b/g, "空闲")
    .replace(/\bmovie:(\d+)/g, "视频 $1")
    .replace(/\bm3u8\b/gi, "播放列表")
    .replace(/\bmp4\b/gi, "视频文件")
    .replace(/\bvideo-api\b/g, "视频接口")
    .replace(/\bplay-api\b/g, "播放接口")
    .replace(/\bpermission-api\b/g, "状态接口")
    .replace(/\bpurchase-api\b/g, "购买接口")
    .replace(/\bpayment-api\b/g, "支付接口")
    .replace(/\bbalance-api\b/g, "余额接口")
    .replace(/\bsegment\b/g, "分片");
}

export function flowItemText(item?: FlowItem) {
  if (!item) return "";
  const title = localizeFlowText(item.title);
  const detail = localizeFlowText(item.detail);
  return [title, detail].filter(Boolean).join("：");
}

export function formatBytes(bytes?: number) {
  const value = Number(bytes || 0);
  if (!value) return "未记录";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function downloadTasks(state: BridgeState) {
  return Object.values(state.downloadTasks || {})
    .filter((task): task is DownloadTask => Boolean(task && typeof task === "object"))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function downloadStats(tasks: DownloadTask[]) {
  return {
    total: tasks.length,
    running: tasks.filter((task) => ["queued", "playlist", "segments", "segment", "save-dialog", "ready"].includes(String(task.stage || ""))).length,
    completed: tasks.filter((task) => task.stage === "complete").length,
    failed: tasks.filter((task) => task.stage === "error").length
  };
}

export function downloadProgress(task: DownloadTask) {
  const total = Number(task.total || 0);
  const current = Number(task.current || 0);
  if (task.stage === "complete" || task.stage === "ready") return 100;
  if (!total) return task.stage === "queued" ? 2 : task.stage === "playlist" ? 6 : 0;
  return Math.max(0, Math.min(99, Math.round((current / total) * 100)));
}

export function downloadStageLabel(stage?: string) {
  if (stage === "queued") return "已排队";
  if (stage === "playlist") return "读取播放列表";
  if (stage === "segments") return "准备分片";
  if (stage === "segment") return "下载分片中";
  if (stage === "ready") return "合并完成，待保存";
  if (stage === "save-dialog") return "选择保存位置";
  if (stage === "complete") return "已保存到设备";
  if (stage === "error") return "失败";
  return stage || "等待任务";
}

export function downloadFormat(task: DownloadTask) {
  if (task.format === "mp4" || /\.mp4(?:[?#]|$)/i.test(task.filename || "")) return "MP4";
  if (task.format === "ts" || /\.ts(?:[?#]|$)/i.test(task.filename || "")) return "TS";
  return task.mode === "direct" ? "原始格式" : "M3U8";
}

export function downloadTitle(task: DownloadTask) {
  return task.titleSnippet || task.movieTitle || task.filename || (task.movieId ? `视频 ${task.movieId}` : "视频任务");
}

export function canSaveDownload(task: DownloadTask) {
  return task.stage === "ready" || task.stage === "complete" || (task.mode === "direct" && Boolean(task.url));
}

export function latestFullDetail(state: BridgeState): FullDetail | undefined {
  const list = state.fullDetails || [];
  return list[list.length - 1];
}

export function accountName(account?: AccountItem | null) {
  if (!account) return "账号池账号";
  return account.userInfo?.nickname ||
    account.userInfo?.account_name ||
    account.userInfo?.name ||
    account.nickname ||
    account.label ||
    account.username ||
    account.id ||
    "账号池账号";
}

export function isCloudAccount(account?: AccountItem | null) {
  const source = String(account?.source || "").toLowerCase();
  return Boolean(account?.cloud || account?.cloudReadonly || account?.isCloud || account?.remoteId || account?.cloudId)
    || ["cloud", "remote", "qrcode", "remote-seed", "seed"].includes(source);
}

export function accountAvailable(account?: AccountItem | null) {
  if (!account) return false;
  if (typeof account.available === "boolean") return account.available;
  const status = String(account.status || "").toLowerCase();
  return !["invalid", "error", "disabled", "expired"].includes(status);
}

export function accountStatusLabel(account?: AccountItem | null) {
  if (!account) return "未知";
  if (accountAvailable(account)) return isCloudAccount(account) ? "自动轮换" : "可用";
  return account.reason || "失效";
}

export function selectedAccount(state: BridgeState) {
  const selectedId = state.selectedFullAccountId;
  return (state.accountPool || []).find((account) => account.id && account.id === selectedId) || null;
}

export function visibleAccounts(state: BridgeState, showInvalid: boolean) {
  const accounts = state.accountPool || [];
  return accounts.filter((account) => showInvalid || accountAvailable(account));
}

export function accountStats(state: BridgeState) {
  const accounts = state.accountPool || [];
  const cloud = accounts.filter(isCloudAccount);
  const local = accounts.filter((account) => !isCloudAccount(account));
  return {
    total: accounts.length,
    cloudAvailable: cloud.filter(accountAvailable).length,
    local: local.length,
    invalid: cloud.filter((account) => !accountAvailable(account)).length
  };
}

export function accountRights(account?: AccountItem | null) {
  const user = account?.userInfo || {};
  const vip = Boolean(user.is_vip === true || user.is_vip === "y" || user.is_vip === "1");
  const dark = Boolean(user.is_dark_vip === true || user.is_dark_vip === "y" || user.is_dark_vip === "1");
  const coins = user.coin ?? user.gold ?? user.balance ?? 0;
  return { vip, dark, coins };
}
