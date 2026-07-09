export type Page = "overview" | "accounts" | "playback" | "downloads" | "settings";

/** 远程版本清单中的单条更新记录 */
export type UpdateChangelogItem = {
  id?: string;
  type?: string;
  title?: string;
  detail?: string;
  notes?: string;
  line?: string;
  releasedAt?: string;
};

/** 升级系统统一状态（background → content → React） */
export type RepositoryUpdateState = {
  ok?: boolean;
  source?: string;
  checkedAt?: string;
  checkMode?: string;
  error?: string;
  repositoryUrl?: string;
  manifestUrl?: string;
  downloadUrl?: string;
  downloadCandidates?: string[];
  downloadAttemptUrls?: string[];
  downloadStatus?: string;
  downloadError?: string;
  updateAvailable?: boolean;
  shouldNotify?: boolean;
  status?: string;
  compareHint?: string;
  updateSystem?: {
    schemaVersion?: string;
    cacheTtlMs?: number;
    ignoredLegacyCache?: boolean;
    cachePolicy?: string;
    downloadPolicy?: string;
    engine?: string;
  };
  local?: {
    version?: string;
    build?: string;
  };
  remote?: {
    id?: string;
    version?: string;
    build?: string;
    releasedAt?: string;
    title?: string;
    detail?: string;
    notes?: string;
    line?: string;
    text?: string;
    type?: string;
    archiveUrl?: string;
    downloadCandidates?: string[];
    detectionSource?: string;
    compareHint?: string;
    changelog?: UpdateChangelogItem[];
  };
};

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
    url?: string;
    status?: number;
    segments?: number;
    duration?: number;
    error?: string;
    pending?: boolean;
  };
  backupStat?: {
    url?: string;
    status?: number;
    segments?: number;
    duration?: number;
    error?: string;
    pending?: boolean;
  };
  hasBuy?: string | boolean;
  fetchedAt?: string;
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

export type WorkerDiagnostics = {
  level?: "ok" | "warn" | "error" | "info";
  score?: number;
  summary?: string;
  checkedAt?: string;
  checks?: {
    key?: string;
    label?: string;
    level?: "ok" | "warn" | "error" | "info";
    message?: string;
  }[];
  suggestions?: string[];
  nextActions?: {
    id?: string;
    label?: string;
    priority?: "high" | "medium" | "low" | string;
    detail?: string;
  }[];
  accountsSummary?: {
    total?: number;
    enabled?: number;
    ok?: number;
    error?: number;
    unverified?: number;
    avgCoin?: number | null;
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
  repositoryUpdate?: RepositoryUpdateState | null;
  adCleaner?: {
    enabled?: boolean;
    version?: string;
    removed?: number;
    hidden?: number;
    blockedClicks?: number;
    total?: number;
    lastRunAt?: string;
    lastReason?: string;
    lastMatched?: string;
    selectors?: number;
    splashHits?: number;
    countdownHits?: number;
    bootActive?: boolean;
  };
  publishedAt?: string;
};

export type UiActionPayload = {
  action: string;
  payload?: Record<string, unknown>;
};

export type AccountsPageIntent = {
  showInvalid?: boolean;
  openAdd?: boolean;
};
