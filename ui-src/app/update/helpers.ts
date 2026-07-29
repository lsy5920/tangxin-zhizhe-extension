import type {
  BridgeState,
  RepositoryUpdateState,
  UpdateChangelogItem,
  UpdateCheckPhase,
  UpdateDownloadPhase,
  UpdatePackageProbe,
  UpdatePackageProbeAttempt
} from "../types";
import { APP_BUILD, APP_VERSION, APP_VERSION_LABEL } from "../constants";
import { formatRelativeTime } from "../helpers";
import { updateCore } from "./updateCore";

/** 升级系统 v8 的界面状态，由后台阶段字段和本地版本指纹共同推导。 */
export type UpdateUiStatus =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "error"
  | "validating"
  | "saving"
  | "submitted"
  | "download-error";

export type UpdateMirrorSource = NonNullable<NonNullable<RepositoryUpdateState["probe"]>["sources"]>[number];

export type UpdateViewModel = {
  status: UpdateUiStatus;
  statusLabel: string;
  statusHint: string;
  busy: boolean;
  localVersion: string;
  localBuild: string;
  remoteVersion: string;
  remoteBuild: string;
  releasedAt: string;
  checkedAt: string;
  checkedRelative: string;
  sourceLabel: string;
  checkMode: string;
  checkPhase: UpdateCheckPhase;
  downloadPhase: UpdateDownloadPhase;
  summary: string;
  title: string;
  downloadUrl: string;
  candidates: string[];
  attemptUrls: string[];
  downloadStatus: string;
  downloadError: string;
  downloadId: number;
  downloadSaveVia: string;
  manifestUrl: string;
  repositoryUrl: string;
  changelog: UpdateChangelogItem[];
  updateId: string;
  canDownload: boolean;
  progressStep: number;
  progressError: boolean;
  cacheHit: boolean;
  cacheAgeMs: number;
  cacheLabel: string;
  mirrorSources: UpdateMirrorSource[];
  mirrorHealthLabel: string;
  packageProbe: UpdatePackageProbe | null;
  packageProbeAttempts: UpdatePackageProbeAttempt[];
  packageProbeLabel: string;
  installationHint: string;
  raw: RepositoryUpdateState | null;
};

function uniqueUrls(list: Array<string | undefined | null>) {
  return Array.from(new Set(list.map((item) => String(item || "").trim()).filter(Boolean)));
}

function formatDuration(ms = 0) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function formatCacheAge(ms = 0) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "时间未知";
  if (value < 5000) return "刚刚";
  return `${formatDuration(value)}前`;
}

export function formatUpdateBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "未记录";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function updateUrlHost(url = "") {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url || "未知镜像";
  }
}

export function deriveUpdateStatus(update?: RepositoryUpdateState | null): UpdateUiStatus {
  if (!update) return "idle";
  if (update.checkPhase === "checking" || update.status === "checking") return "checking";
  if (update.downloadPhase === "validating") return "validating";
  if (update.downloadPhase === "saving") return "saving";
  const checkFailed = update.checkPhase === "error" || update.status === "error";
  const checkedAt = Date.parse(String(update.checkedAt || update.checkStartedAt || ""));
  const downloadActivityAt = Date.parse(String(update.downloadSubmittedAt || update.downloadStartedAt || ""));
  const failedCheckIsNewer = checkFailed
    && Number.isFinite(checkedAt)
    && (!Number.isFinite(downloadActivityAt) || checkedAt >= downloadActivityAt);
  if (failedCheckIsNewer) return "error";
  if (update.downloadPhase === "submitted") return "submitted";
  if (update.downloadPhase === "failed") return "download-error";
  if (checkFailed || update.ok === false) return "error";
  if (isUpdateAvailableForCurrentBuild(update)) return "available";
  if (["cached", "success"].includes(String(update.checkPhase || "")) || update.status === "latest" || update.ok === true) return "latest";
  return "idle";
}

/**
 * 后台是更新判断的权威来源，但界面仍按当前打包常量复核一次。
 * 这是覆盖升级后的最后一道防线：旧缓存即使残留 updateAvailable=true，
 * 只要远端 version/build 没有高于当前安装，就不能点亮徽标或自动弹窗。
 */
export function isUpdateAvailableForCurrentBuild(update?: RepositoryUpdateState | null) {
  if (!update?.updateAvailable) return false;
  const remote = update.updateManifest || update.remote || {};
  return updateCore.shouldUpdate(remote, APP_VERSION, APP_BUILD);
}

const STATUS_LABEL: Record<UpdateUiStatus, string> = {
  idle: "等待检测",
  checking: "正在检测",
  latest: "已是最新",
  available: "发现新版本",
  error: "检测失败",
  validating: "正在验证完整包",
  saving: "等待安全保存",
  submitted: "下载已提交",
  "download-error": "完整包获取失败"
};

function statusSummary(status: UpdateUiStatus, update: RepositoryUpdateState | null, compareHint: string) {
  const remote = update?.remote || null;
  if (status === "checking") return "正在并发获取更新清单，并验证清单签名、版本、构建号与发布来源。";
  if (status === "validating") return "正在下载并验证完整 CRX3 包：核对完整包大小、SHA-256、正式扩展 ID 与 CRX3 包签名。";
  if (status === "saving") return "CRX3 已通过校验并写入扩展 OPFS；请在安全保存页点击按钮，由浏览器打开系统保存流程。";
  if (status === "submitted") {
    if (update?.downloadSaveVia === "extension-save-page") {
      return "CRX3 完整包验证通过，并已由扩展安全保存页写入设备。";
    }
    const suffix = update?.downloadId ? `（浏览器下载编号 ${update.downloadId}）` : "";
    return `CRX3 完整包验证通过，已拉起浏览器下载${suffix}。`;
  }
  if (status === "download-error") return "未能从候选镜像取得可用安装包，请查看错误后重试。";
  if (status === "error") return "本次更新检测没有完成，请查看错误后重新检测。";
  if (status === "available") {
    const version = remote?.version ? ` v${String(remote.version).replace(/^v/i, "")}` : "";
    return `签名清单确认存在新版本${version}，查看更新内容后可下载并验证正式 CRX3 安装包。`;
  }
  if (status === "latest") {
    return compareHint ? `当前已是最新版本（${compareHint}）。` : "当前已是最新版本，可继续使用。";
  }
  return "点击“检查更新”可获取远程版本、镜像健康情况与经过校验的 CRX 下载入口。";
}

function statusHint(status: UpdateUiStatus) {
  if (status === "available") return "可下载 CRX，浏览器不会静默安装";
  if (status === "latest") return "本地版本与远程版本一致";
  if (status === "checking") return "手动检查始终绕过成功缓存";
  if (status === "validating") return "完整包验证全部通过后才会拉起浏览器下载";
  if (status === "saving") return "一次性令牌只能由一个标签领取，关闭后可重新生成";
  if (status === "submitted") return "已把验签文件交给浏览器，完成后需手动安装";
  if (status === "download-error") return "可重试下载，系统会重新验证全部镜像";
  if (status === "error") return "可重新检测，或前往项目主页核对发布状态";
  return "自动检查复用 15 分钟成功缓存";
}

export function buildUpdateViewModel(state: BridgeState): UpdateViewModel {
  const update = state.repositoryUpdate || null;
  const remote = update?.remote || null;
  const status = deriveUpdateStatus(update);
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
  const cacheHit = Boolean(update?.cacheHit || update?.checkPhase === "cached");
  const cacheAgeMs = Number(update?.cacheAgeMs || 0);
  const mirrorSources = Array.isArray(update?.probe?.sources)
    ? update.probe.sources
    : (Array.isArray(remote?.probeSources) ? remote.probeSources : []);
  const mirrorOk = mirrorSources.filter((item) => item.ok).length;
  const mirrorFailed = mirrorSources.length - mirrorOk;
  const packageProbe = update?.packageProbe || null;
  const packageProbeAttempts = Array.isArray(update?.packageProbeAttempts) ? update.packageProbeAttempts : [];
  const shortExtensionId = packageProbe?.extensionId
    ? `${packageProbe.extensionId.slice(0, 8)}…${packageProbe.extensionId.slice(-4)}`
    : "";
  const packageProbeLabel = packageProbe?.ok
    ? `CRX${packageProbe.crxVersion || 3} · 完整包与 SHA-256 通过${shortExtensionId ? ` · ID ${shortExtensionId}` : ""}`
    : status === "validating"
      ? "正在验证候选镜像…"
      : packageProbeAttempts.length
        ? `已尝试 ${packageProbeAttempts.length} 个镜像，尚无可用安装包`
        : "尚未执行完整包验证";
  const baseSummary = statusSummary(status, update, compareHint);
  const summaryParts = [baseSummary];
  if (cacheHit && ["latest", "available"].includes(status)) summaryParts.push(`本次使用成功缓存（${formatCacheAge(cacheAgeMs)}）；点击“实时检查”可绕过缓存。`);

  const progressMap: Record<UpdateUiStatus, number> = {
    idle: -1,
    checking: 0,
    error: 0,
    latest: 1,
    available: 1,
    validating: 2,
    saving: 3,
    "download-error": 2,
    submitted: 3
  };
  const busy = status === "checking" || status === "validating";
  const canDownload = !busy && (["latest", "available", "saving", "submitted", "download-error"] as UpdateUiStatus[]).includes(status);

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    statusHint: statusHint(status),
    busy,
    localVersion: APP_VERSION_LABEL,
    localBuild: APP_BUILD,
    remoteVersion: remote?.version ? `v${String(remote.version).replace(/^v/i, "")}` : "未检测",
    remoteBuild: remote?.build || "未检测",
    releasedAt: remote?.releasedAt || "",
    checkedAt: update?.checkedAt || "",
    checkedRelative: update?.checkedAt ? formatRelativeTime(update.checkedAt) : "未检测",
    sourceLabel: remote?.detectionSource || (update?.source === "signed-update.json"
      ? "签名更新清单（多源最新）"
      : update?.source === "update.json"
        ? "远程版本清单（兼容来源）"
        : update?.source || "未检测"),
    checkMode: update?.checkMode || "自动检测",
    checkPhase: update?.checkPhase || "idle",
    downloadPhase: update?.downloadPhase || "idle",
    summary: summaryParts.join("\n"),
    title: remote?.title || STATUS_LABEL[status],
    downloadUrl,
    candidates,
    attemptUrls,
    downloadStatus: update?.downloadStatus || "",
    downloadError: update?.downloadError || (status === "error" ? update?.error || "" : ""),
    downloadId: Number(update?.downloadId || 0),
    downloadSaveVia: String(update?.downloadSaveVia || ""),
    manifestUrl: update?.manifestUrl || "",
    repositoryUrl: update?.repositoryUrl || "https://github.com/lsy5920/tangxin-zhizhe-extension",
    changelog,
    updateId: String(remote?.id || [remote?.version, remote?.build].filter(Boolean).join("|")),
    // 只有成功签名清单派生出的状态才提供主下载动作；checkedAt 只代表尝试过检测，不能作为信任依据。
    canDownload,
    progressStep: progressMap[status],
    progressError: status === "error" || status === "download-error",
    cacheHit,
    cacheAgeMs,
    cacheLabel: cacheHit ? `成功缓存 · ${formatCacheAge(cacheAgeMs)}` : update?.checkedAt ? `${update?.checkMode || "本次检测"}结果` : "尚无检测结果",
    mirrorSources,
    mirrorHealthLabel: mirrorSources.length
      ? `${mirrorOk}/${mirrorSources.length} 可用${mirrorFailed ? ` · ${mirrorFailed} 个失败` : ""}${update?.probe?.staleCount ? ` · ${update.probe.staleCount} 个旧版本源` : ""}`
      : "尚未探测镜像",
    packageProbe,
    packageProbeAttempts,
    packageProbeLabel,
    installationHint: "扩展受浏览器安全边界限制，升级系统只能验证并下载 CRX，不能静默完成安装。下载结束后请打开扩展管理页，手动安装或覆盖更新。",
    raw: update
  };
}

export function updateDownloadActionLabel(status: UpdateUiStatus, compact = false) {
  if (status === "validating") return compact ? "验证中…" : "验证完整包中…";
  if (status === "saving") return compact ? "重开保存页" : "重新验证并打开保存页";
  if (status === "submitted") return compact ? "再次下载" : "再次下载 CRX";
  if (status === "download-error") return compact ? "重试下载" : "重新验证并下载";
  if (status === "available") return compact ? "下载 CRX" : "下载最新 CRX";
  return compact ? "下载 CRX" : "下载当前 CRX";
}

export function updateCheckPhaseLabel(phase: UpdateCheckPhase) {
  return ({ idle: "未开始", checking: "检测中", cached: "使用成功缓存", success: "检测成功", error: "检测失败" } as const)[phase] || phase;
}

export function updateDownloadPhaseLabel(phase: UpdateDownloadPhase) {
  return ({ idle: "未开始", validating: "验证完整包", saving: "安全保存页已打开", submitted: "已提交浏览器保存", failed: "完整包获取失败" } as const)[phase] || phase;
}

export function updateAttemptPhaseLabel(phase?: string) {
  const labels: Record<string, string> = {
    validating: "校验中",
    validated: "校验通过",
    "save-page-opened": "安全保存页已打开",
    "client-save-required": "切换页面保存",
    submitted: "已提交",
    rejected: "已拒绝",
    "validation-failed": "校验失败",
    "submit-failed": "提交失败"
  };
  return labels[String(phase || "")] || phase || "未知";
}

export function buildUpdateCopyText(vm: UpdateViewModel) {
  return [
    "糖心志者 · 升级系统 v8 报告",
    `状态：${vm.statusLabel}`,
    `检测阶段：${updateCheckPhaseLabel(vm.checkPhase)}（${vm.checkPhase}）`,
    `下载阶段：${updateDownloadPhaseLabel(vm.downloadPhase)}（${vm.downloadPhase}）`,
    `本地版本：${vm.localVersion}`,
    `本地构建：${vm.localBuild}`,
    `远程版本：${vm.remoteVersion}`,
    `远程构建：${vm.remoteBuild}`,
    `发布时间：${vm.releasedAt || "未检测"}`,
    `检测时间：${vm.checkedAt || "未检测"}`,
    `检测模式：${vm.checkMode}`,
    `缓存：${vm.cacheLabel}`,
    `检测来源：${vm.sourceLabel}`,
    `镜像健康：${vm.mirrorHealthLabel}`,
    `清单地址：${vm.manifestUrl || "未检测"}`,
    `下载地址：${vm.downloadUrl || "未检测"}`,
    `候选地址：${vm.candidates.length ? vm.candidates.join(" | ") : "无"}`,
    `实际尝试：${vm.attemptUrls.length ? vm.attemptUrls.join(" | ") : "未开始"}`,
    `完整包验证：${vm.packageProbeLabel}`,
    `浏览器下载编号：${vm.downloadId || (vm.downloadSaveVia?.startsWith("extension-save-page") ? "安全保存页无 API 编号" : "未提交")}`,
    `下载交付方式：${vm.downloadSaveVia || "未提交"}`,
    `下载状态：${vm.downloadStatus || "未开始"}`,
    `错误信息：${vm.downloadError || "无"}`,
    `更新说明：${vm.summary}`,
    `安装边界：${vm.installationHint}`,
    ...(vm.changelog.length
      ? ["", "最近更新：", ...vm.changelog.map((item, index) => `${index + 1}. 【${item.type || "更新"}】${item.title || item.detail || item.id || "记录"}`)]
      : [])
  ].join("\n");
}

export function updateStatusTone(status: UpdateUiStatus) {
  if (status === "error" || status === "download-error") {
    return {
      badge: "bg-danger-50 text-danger-600",
      soft: "from-danger-50 to-white",
      solid: "from-danger-500 to-danger-600",
      ring: "ring-danger-100",
      border: "border-danger-100",
      text: "text-danger-600",
      bar: "bg-danger-500"
    };
  }
  if (status === "available" || status === "saving" || status === "submitted") {
    return {
      badge: "bg-warning-50 text-warning-600",
      soft: "from-warning-50 to-white",
      solid: "from-warning-500 to-warning-600",
      ring: "ring-warning-100",
      border: "border-warning-100",
      text: "text-warning-600",
      bar: "bg-warning-500"
    };
  }
  if (status === "checking" || status === "validating") {
    return {
      badge: "bg-info-50 text-info-600",
      soft: "from-info-50 to-white",
      solid: "from-info-500 to-info-600",
      ring: "ring-info-100",
      border: "border-info-100",
      text: "text-info-600",
      bar: "bg-info-500"
    };
  }
  if (status === "latest") {
    return {
      badge: "bg-success-50 text-success-600",
      soft: "from-success-50 to-white",
      solid: "from-success-500 to-success-600",
      ring: "ring-success-100",
      border: "border-success-100",
      text: "text-success-600",
      bar: "bg-success-500"
    };
  }
  return {
    badge: "bg-brand-50 text-brand-700",
    soft: "from-brand-50 to-white",
    solid: "from-brand-500 to-brand-700",
    ring: "ring-brand-100",
    border: "border-brand-100",
    text: "text-brand-700",
    bar: "bg-brand-500"
  };
}

export function changelogTypeLabel(type?: string) {
  const raw = String(type || "").replace(/[【】]/g, "");
  return raw || "更新";
}

export { APP_VERSION, APP_BUILD, APP_VERSION_LABEL };
