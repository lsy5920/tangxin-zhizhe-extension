import type { BridgeState, RepositoryUpdateState, UpdateChangelogItem } from "../types";
import { APP_BUILD, APP_VERSION, APP_VERSION_LABEL } from "../constants";
import { formatRelativeTime } from "../helpers";

/** 升级系统统一状态机（界面只认这几种，避免到处 if-else）。 */
export type UpdateUiStatus =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "error"
  | "downloading"
  | "downloaded";

export type UpdateViewModel = {
  status: UpdateUiStatus;
  statusLabel: string;
  statusHint: string;
  localVersion: string;
  localBuild: string;
  remoteVersion: string;
  remoteBuild: string;
  releasedAt: string;
  checkedAt: string;
  checkedRelative: string;
  sourceLabel: string;
  checkMode: string;
  summary: string;
  title: string;
  downloadUrl: string;
  candidates: string[];
  attemptUrls: string[];
  downloadStatus: string;
  downloadError: string;
  manifestUrl: string;
  repositoryUrl: string;
  changelog: UpdateChangelogItem[];
  updateId: string;
  canDownload: boolean;
  canOpenUrl: boolean;
  progressStep: number;
  progressTotal: number;
  raw: RepositoryUpdateState | null;
};

function uniqueUrls(list: Array<string | undefined | null>) {
  return Array.from(new Set(list.map((item) => String(item || "").trim()).filter(Boolean)));
}

export function deriveUpdateStatus(update?: RepositoryUpdateState | null, checking = false, downloading = false): UpdateUiStatus {
  if (checking) return "checking";
  if (downloading) return "downloading";
  if (!update) return "idle";
  if (update.downloadStatus === "已提交下载" || update.downloadStatus === "下载完成") return "downloaded";
  if (update.ok === false) return "error";
  if (update.updateAvailable) return "available";
  if (update.checkedAt || update.remote?.version) return "latest";
  return "idle";
}

const STATUS_LABEL: Record<UpdateUiStatus, string> = {
  idle: "等待检测",
  checking: "正在检测",
  latest: "已是最新",
  available: "发现新版本",
  error: "检测失败",
  downloading: "正在下载",
  downloaded: "已提交下载"
};

export function buildUpdateViewModel(
  state: BridgeState,
  options: { checking?: boolean; downloading?: boolean } = {}
): UpdateViewModel {
  const update = state.repositoryUpdate || null;
  const remote = update?.remote || null;
  const status = deriveUpdateStatus(update, Boolean(options.checking), Boolean(options.downloading));
  const candidates = uniqueUrls([
    ...(update?.downloadCandidates || []),
    ...(remote?.downloadCandidates || []),
    update?.downloadUrl,
    remote?.archiveUrl
  ]);
  const downloadUrl = update?.downloadUrl || remote?.archiveUrl || candidates[0] || "";
  const attemptUrls = uniqueUrls(update?.downloadAttemptUrls || []);
  const changelog = Array.isArray(remote?.changelog) ? remote.changelog.slice(0, 8) : [];
  const compareHint = update?.compareHint || remote?.compareHint || "";
  const probeSummary = String(remote?.probeSummary || update?.probe?.summary || "").trim();
  const summary = status === "error"
    ? `更新检测失败：${update?.error || "请稍后重试"}（已并发尝试全部清单镜像）`
    : status === "available"
      ? (remote?.detail || remote?.notes || remote?.text || remote?.line || remote?.title || "远程已发布新版本，建议立即更新。")
      : status === "latest"
        ? (remote?.detail || (compareHint ? `当前已是最新版本（${compareHint}）` : "当前已是最新版本，可继续使用。"))
        : status === "checking"
          ? "正在并发探测 GitHub 主源与各镜像，自动取最新 version/build…"
          : status === "downloading"
            ? "正在提交最新版 CRX 安装包下载，请留意浏览器下载栏。"
            : status === "downloaded"
              ? (update?.downloadStatus || "最新版 CRX 安装包已提交下载。")
              : "点击「检查更新」可获取远程版本与 CRX 下载地址。";

  const progressMap: Record<UpdateUiStatus, number> = {
    idle: 0,
    checking: 1,
    error: 1,
    latest: 2,
    available: 2,
    downloading: 3,
    downloaded: 4
  };

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    statusHint: status === "available"
      ? "建议下载并重新加载扩展"
      : status === "error"
        ? "可重试检测，或手动打开下载地址"
        : status === "latest"
          ? "本地版本与远程一致"
          : "升级系统会实时读取 GitHub 版本清单",
    localVersion: APP_VERSION_LABEL,
    localBuild: APP_BUILD,
    remoteVersion: remote?.version ? `v${remote.version}` : "未检测",
    remoteBuild: remote?.build || "未检测",
    releasedAt: remote?.releasedAt || "",
    checkedAt: update?.checkedAt || "",
    checkedRelative: update?.checkedAt ? formatRelativeTime(update.checkedAt) : "未检测",
    sourceLabel: remote?.detectionSource || (update?.source === "update.json" ? "远程版本清单（多源最新）" : update?.source || "未检测"),
    checkMode: update?.checkMode || "实时检测",
    summary: probeSummary && (status === "latest" || status === "available")
      ? `${summary}\n探测：${probeSummary}`
      : summary,
    title: remote?.title || STATUS_LABEL[status],
    downloadUrl,
    candidates,
    attemptUrls,
    downloadStatus: update?.downloadStatus || "",
    downloadError: update?.downloadError || (status === "error" ? update?.error || "" : ""),
    manifestUrl: update?.manifestUrl || "",
    repositoryUrl: update?.repositoryUrl || "https://github.com/lsy5920/tangxin-zhizhe-extension",
    changelog,
    updateId: String(remote?.id || `${remote?.version || ""}|${remote?.build || ""}`),
    canDownload: Boolean(downloadUrl) || Boolean(update?.checkedAt) || status === "available" || status === "latest",
    canOpenUrl: Boolean(downloadUrl),
    progressStep: progressMap[status],
    progressTotal: 4,
    raw: update
  };
}

export function buildUpdateCopyText(vm: UpdateViewModel) {
  return [
    "糖心志者 · 升级系统报告",
    `状态：${vm.statusLabel}`,
    `本地版本：${vm.localVersion}`,
    `本地构建：${vm.localBuild}`,
    `远程版本：${vm.remoteVersion}`,
    `远程构建：${vm.remoteBuild}`,
    `发布时间：${vm.releasedAt || "未检测"}`,
    `检测时间：${vm.checkedAt || "未检测"}`,
    `检测模式：${vm.checkMode}`,
    `检测来源：${vm.sourceLabel}`,
    `清单地址：${vm.manifestUrl || "未检测"}`,
    `下载地址：${vm.downloadUrl || "未检测"}`,
    `候选地址：${vm.candidates.length ? vm.candidates.join(" | ") : "无"}`,
    `实际尝试：${vm.attemptUrls.length ? vm.attemptUrls.join(" | ") : "未开始"}`,
    `下载状态：${vm.downloadStatus || "未开始"}`,
    `错误信息：${vm.downloadError || "无"}`,
    `更新说明：${vm.summary}`,
    ...(vm.changelog.length
      ? ["", "最近更新：", ...vm.changelog.map((item, index) => `${index + 1}. 【${item.type || "更新"}】${item.title || item.detail || item.id || "记录"}`)]
      : [])
  ].join("\n");
}

export function updateStatusTone(status: UpdateUiStatus) {
  if (status === "error") {
    return {
      badge: "bg-rose-100 text-rose-600",
      soft: "from-rose-50 via-pink-50 to-white",
      solid: "from-rose-500 to-red-500",
      ring: "ring-rose-200",
      border: "border-rose-100",
      text: "text-rose-600",
      bar: "bg-rose-400"
    };
  }
  if (status === "available" || status === "downloaded") {
    return {
      badge: "bg-amber-100 text-amber-700",
      soft: "from-amber-50 via-orange-50 to-white",
      solid: "from-amber-400 via-orange-500 to-rose-500",
      ring: "ring-amber-200",
      border: "border-amber-100",
      text: "text-amber-700",
      bar: "bg-amber-400"
    };
  }
  if (status === "checking" || status === "downloading") {
    return {
      badge: "bg-sky-100 text-sky-700",
      soft: "from-sky-50 via-cyan-50 to-white",
      solid: "from-sky-400 to-blue-500",
      ring: "ring-sky-200",
      border: "border-sky-100",
      text: "text-sky-700",
      bar: "bg-sky-400"
    };
  }
  if (status === "latest") {
    return {
      badge: "bg-emerald-100 text-emerald-700",
      soft: "from-emerald-50 via-teal-50 to-white",
      solid: "from-emerald-400 to-teal-500",
      ring: "ring-emerald-200",
      border: "border-emerald-100",
      text: "text-emerald-700",
      bar: "bg-emerald-400"
    };
  }
  return {
    badge: "bg-purple-100 text-purple-700",
    soft: "from-purple-50 via-pink-50 to-white",
    solid: "from-pink-400 to-purple-500",
    ring: "ring-purple-200",
    border: "border-purple-100",
    text: "text-purple-700",
    bar: "bg-purple-400"
  };
}

export function changelogTypeLabel(type?: string) {
  const raw = String(type || "").replace(/[【】]/g, "");
  if (!raw) return "更新";
  return raw;
}

export { APP_VERSION, APP_BUILD, APP_VERSION_LABEL };
