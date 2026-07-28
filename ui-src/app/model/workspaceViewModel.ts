import type { BridgeState, DownloadTask } from "../types";
import { buildUpdateViewModel } from "../update/helpers";

export type NoticeTone = "success" | "warning" | "danger" | "info";

export type WorkspaceViewModel = {
  activeDownloads: number;
  remote: {
    connected: boolean;
    tone: NoticeTone;
    label: string;
    detail: string;
  };
  update: ReturnType<typeof buildUpdateViewModel> & {
    available: boolean;
    needsModal: boolean;
    badgeLabel: string;
  };
};

const ACTIVE_DOWNLOAD_STAGES = new Set(["queued", "playlist", "segments", "segment", "ready"]);

function isActiveDownload(task: DownloadTask | null | undefined) {
  return Boolean(task && ACTIVE_DOWNLOAD_STAGES.has(String(task.stage || "")));
}

function updateBadgeLabel(status: ReturnType<typeof buildUpdateViewModel>["status"]) {
  if (status === "idle") return "检查更新";
  if (status === "available") return "发现新版本";
  if (status === "checking") return "正在检查";
  if (status === "validating") return "正在校验";
  if (status === "submitted") return "安装包已准备";
  if (status === "download-error" || status === "error") return "升级需要处理";
  return "已经是最新版";
}

/**
 * 把跨页面状态压缩成壳层所需的展示模型。
 * 壳层不再理解下载阶段、远端连接条件或升级状态机，业务规则只在这里维护。
 */
export function buildWorkspaceViewModel(state: BridgeState): WorkspaceViewModel {
  const update = buildUpdateViewModel(state);
  const remoteConnected = Boolean(state.remote?.lastSyncAt && !state.remote?.lastError);
  const remoteTone: NoticeTone = state.remote?.lastError
    ? "danger"
    : remoteConnected
      ? "success"
      : "warning";

  return {
    activeDownloads: Object.values(state.downloadTasks || {}).filter(isActiveDownload).length,
    remote: {
      connected: remoteConnected,
      tone: remoteTone,
      label: state.remote?.lastError ? "云端需要照看" : remoteConnected ? "云端状态很好" : "等待首次同步",
      detail: state.remote?.lastError || (remoteConnected ? "账号小屋已保持同步" : "前往账号小屋完成连接")
    },
    update: {
      ...update,
      available: update.status === "available",
      needsModal: ["available", "validating", "submitted", "download-error"].includes(update.status),
      badgeLabel: updateBadgeLabel(update.status)
    }
  };
}
