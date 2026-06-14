export type Page = "overview" | "accounts" | "playback" | "downloads" | "settings";

export type FlowItem = {
  title?: string;
  detail?: string;
  level?: "ok" | "error" | "info" | "running";
  ts?: string;
};

export type FullDetail = {
  movieId?: string;
  movieTitle?: string;
  title?: string;
  accountLabel?: string;
  accountUser?: string;
  action?: string;
  playLink?: string;
  backupLink?: string;
  fullStat?: {
    segments?: number;
    duration?: number;
    error?: string;
  };
  hasBuy?: string | boolean;
};

export type DownloadTask = {
  taskId?: string;
  movieId?: string;
  movieTitle?: string;
  titleSnippet?: string;
  filename?: string;
  format?: string;
  mode?: string;
  stage?: string;
  current?: number;
  total?: number;
  bytes?: number;
  updatedAt?: string;
  error?: string;
  transmuxError?: string;
  url?: string;
};

export type AccountItem = {
  id?: string;
  label?: string;
  nickname?: string;
  username?: string;
  source?: string;
  cloud?: boolean;
  cloudReadonly?: boolean;
  isCloud?: boolean;
  remoteId?: string;
  cloudId?: string;
  status?: string;
  available?: boolean;
  reason?: string;
  tokenMasked?: string;
  qrcodeMasked?: string;
  passwordMasked?: string;
  hasToken?: boolean;
  deviceId?: string;
  userInfo?: {
    id?: string | number;
    nickname?: string;
    account_name?: string;
    name?: string;
    is_vip?: string | boolean;
    is_dark_vip?: string | boolean;
    coin?: string | number;
    gold?: string | number;
    balance?: string | number;
  } | null;
};

export type BridgeState = {
  expanded?: boolean;
  role?: string;
  displayPatchApplied?: boolean;
  lastDisplayPatchAt?: string;
  session?: {
    userId?: string;
    nickname?: string;
    tokenMasked?: string;
    hasToken?: boolean;
    deviceId?: string;
  } | null;
  flow?: FlowItem[];
  accountPool?: AccountItem[];
  selectedFullAccountId?: string;
  fullDetails?: FullDetail[];
  downloadTasks?: Record<string, DownloadTask>;
  downloadSnapshots?: unknown[];
  remote?: {
    baseUrl?: string;
    accountSourceMode?: string;
    lastSyncAt?: string;
    lastError?: string;
  } | null;
  repositoryUpdate?: {
    updateAvailable?: boolean;
    remote?: {
      version?: string;
      build?: string;
      notes?: string;
    };
  } | null;
  publishedAt?: string;
};

export type UiActionPayload = {
  action: string;
  payload?: Record<string, unknown>;
};
