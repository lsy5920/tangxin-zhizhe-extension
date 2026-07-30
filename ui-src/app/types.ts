import type { ScreeningState } from "./playback/types";
import type { CinemaCatalogState, CinemaCollectionState } from "./cinema/types";

export type Page = "overview" | "cinema" | "accounts" | "playback" | "downloads" | "settings";

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

export type UpdateCheckPhase = "idle" | "checking" | "cached" | "success" | "error";
export type UpdateDownloadPhase = "idle" | "validating" | "saving" | "submitted" | "failed";

/** 对同一份完整 CRX3 字节执行大小、哈希、身份、结构与包签名校验后的结果。 */
export type UpdatePackageProbe = {
  ok?: boolean;
  format?: "crx" | "zip" | string;
  crxVersion?: number;
  headerSize?: number;
  zipOffset?: number;
  extensionId?: string;
  sha256?: string;
  publicKeyLength?: number;
  signatureLength?: number;
  status?: number;
  contentType?: string;
  contentLength?: number;
  totalSize?: number;
  bytesChecked?: number;
  finalUrl?: string;
  verifiedAt?: string;
};

/** 单个镜像的校验/下载提交结果，失败时用于准确定位问题源。 */
export type UpdatePackageProbeAttempt = {
  url?: string;
  displayUrl?: string;
  format?: string;
  ok?: boolean;
  phase?: "validating" | "validated" | "submitted" | "rejected" | "validation-failed" | "submit-failed" | string;
  error?: string;
  downloadId?: number;
  packageProbe?: UpdatePackageProbe | null;
};

/** 升级系统统一状态（background → content → React） */
export type RepositoryUpdateState = {
  ok?: boolean;
  source?: string;
  checkedAt?: string;
  checkStartedAt?: string;
  checkMode?: string;
  checkPhase?: UpdateCheckPhase;
  cacheHit?: boolean;
  cacheAgeMs?: number;
  cacheServedAt?: string;
  error?: string;
  repositoryUrl?: string;
  manifestUrl?: string;
  downloadUrl?: string;
  downloadCandidates?: string[];
  downloadAttemptUrls?: string[];
  downloadStatus?: string;
  downloadError?: string;
  downloadPhase?: UpdateDownloadPhase;
  downloadStartedAt?: string;
  downloadSubmittedAt?: string;
  downloadId?: number;
  downloadSaveVia?: string;
  packageProbe?: UpdatePackageProbe | null;
  packageProbeAttempts?: UpdatePackageProbeAttempt[];
  updateAvailable?: boolean;
  shouldNotify?: boolean;
  reminderDismissed?: boolean;
  status?: string;
  compareHint?: string;
  updateManifest?: {
    version?: string;
    build?: string;
  };
  probe?: {
    totalCount?: number;
    okCount?: number;
    failCount?: number;
    staleCount?: number;
    pickedHost?: string;
    pickedVersion?: string;
    pickedBuild?: string;
    summary?: string;
    sources?: Array<{
      host?: string;
      ok?: boolean;
      version?: string;
      build?: string;
      error?: string;
      url?: string;
    }>;
  };
  updateSystem?: {
    schemaVersion?: string;
    cacheTtlMs?: number;
    ignoredLegacyCache?: boolean;
    cachePolicy?: string;
    downloadPolicy?: string;
    engine?: string;
    mirrorCount?: number;
    packageFormat?: string;
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
    probeSummary?: string;
    probeSources?: Array<{
      host?: string;
      ok?: boolean;
      version?: string;
      build?: string;
      error?: string;
      url?: string;
    }>;
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
    latencyMs?: number;
    score?: number;
    ok?: boolean;
  };
  backupStat?: {
    url?: string;
    status?: number;
    segments?: number;
    duration?: number;
    error?: string;
    pending?: boolean;
    latencyMs?: number;
    score?: number;
    ok?: boolean;
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
  attemptId?: string;
  sequence?: number;
  stage?: "queued" | "probing" | "downloading" | "paused" | "recovering" | "assembling" | "ready" | "saving" | "complete" | "cancelled" | "stale" | "error" | string;
  current?: number;
  total?: number;
  bytes?: number;
  totalBytes?: number;
  speedBps?: number;
  percent?: number;
  lineKey?: string;
  updatedAt?: string;
  error?: string;
  transmuxError?: string;
  url?: string;
  container?: "mp4" | "ts" | string;
  networkMode?: "data-saver" | "balanced" | "high-quality" | string;
  qualityHeight?: number;
  objectReady?: boolean;
  saveVia?: string;
  plan?: DownloadPlan | null;
  priority?: "high" | "normal" | "low" | string;
  notBefore?: string;
  pauseReason?: string;
  resumeRequested?: boolean;
  createdAt?: string;
  viewportHeight?: number;
  estimatedBytes?: number;
};

export type LibraryEntry = {
  movieId: string;
  title?: string;
  posterUrl?: string;
  creator?: string;
  durationSeconds?: number;
  durationLabel?: string;
  orientation?: "landscape" | "portrait" | "square";
  access?: "free" | "vip" | "coin";
  price?: number;
  isCollection?: boolean;
  favorite?: boolean;
  watchLater?: boolean;
  tags?: string[];
  note?: string;
  addedAt?: string;
  updatedAt?: string;
  lastPlayedAt?: string;
  watchedAt?: string;
};

export type PlaybackBookmark = {
  id: string;
  movieId: string;
  title?: string;
  label?: string;
  note?: string;
  startSeconds: number;
  endSeconds?: number | null;
  durationSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AccountHealthRecord = {
  accountId: string;
  state?: "unknown" | "healthy" | "degraded" | "cooling" | "needs_attention" | string;
  consecutiveFailures?: number;
  lastCheckedAt?: string;
  cooldownUntil?: string;
  lastReason?: string;
  history?: Array<{ checkedAt?: string; ok?: boolean; category?: string; reason?: string }>;
};

export type ExperienceAlert = {
  id: string;
  key?: string;
  category?: string;
  level?: "info" | "warning" | "error" | "success" | string;
  title?: string;
  detail?: string;
  createdAt?: string;
  readAt?: string;
  count?: number;
};

export type StorageAuditEntry = {
  taskId: string;
  attemptId: string;
  movieId?: string;
  filename?: string;
  category?: "active" | "artifact" | "resumable" | "residue" | "orphan" | "duplicate" | string;
  bytes?: number;
  protected?: boolean;
  duplicateGroup?: string;
  updatedAt?: string;
};

export type ExperienceState = {
  schemaVersion?: number;
  library?: Record<string, LibraryEntry>;
  bookmarks?: Record<string, PlaybackBookmark[]>;
  downloadPolicy?: {
    maxConcurrent?: number;
    queuePaused?: boolean;
    windowEnabled?: boolean;
    windowStart?: string;
    windowEnd?: string;
    autoCleanup?: boolean;
  };
  accountPatrol?: {
    enabled?: boolean;
    intervalHours?: number;
    lastRunAt?: string;
    records?: Record<string, AccountHealthRecord>;
  };
  notificationsEnabled?: boolean;
  storageAudit?: {
    checkedAt?: string;
    storage?: { known?: boolean; quota?: number; usage?: number; available?: number };
    managedBytes?: number;
    lowSpace?: boolean;
    entries?: StorageAuditEntry[];
  } | null;
  alerts?: ExperienceAlert[];
};

export type DownloadVariant = {
  id?: string;
  url?: string;
  bandwidth?: number;
  averageBandwidth?: number;
  width?: number;
  height?: number;
  codecs?: string;
  separateAudio?: boolean;
};

export type DownloadPlan = {
  playlistUrl?: string;
  selectedVariant?: DownloadVariant | null;
  variants?: DownloadVariant[];
  durationSeconds?: number;
  container?: string;
  audioMode?: string;
  segmentCount?: number;
  estimatedBytes?: number;
  requiredBytes?: number;
  storage?: { known?: boolean; quota?: number; usage?: number; available?: number };
  blockedReason?: string;
  compatibleContainers?: string[];
};

export type DownloadPlannerState = {
  open?: boolean;
  phase?: "probing" | "ready" | "error";
  error?: string;
  movieId?: string;
  movieTitle?: string;
  taskId?: string;
  lineKey?: string;
  mode?: string;
  filename?: string;
  source?: { id?: string; label?: string; protocol?: string; media?: Record<string, unknown> | null };
  sources?: Array<{ id?: string; label?: string; role?: string; protocol?: string; health?: Record<string, unknown>; media?: Record<string, unknown> }>;
  plan?: DownloadPlan | null;
};

export type PurchaseReconciliationItem = {
  origin?: "cloud" | "local" | string;
  attemptId?: string;
  requestId?: string;
  movieId?: string;
  status?: "pending" | "charged" | "uncertain" | string;
  price?: number;
  account?: { id?: string; label?: string; coin?: number };
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  canReconcile?: boolean;
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
  notes?: string;
  lastVerifiedAt?: string;
  tokenMasked?: string;
  qrcodeMasked?: string;
  passwordMasked?: string;
  hasPassword?: boolean;
  hasQrcode?: boolean;
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

/** 后台代为执行云端体检后的脱敏结果。 */
export type CloudDiagnosticsResponse = {
  ok?: boolean;
  endpoint?: string;
  diagnostics?: WorkerDiagnostics | null;
  status?: Record<string, unknown> | null;
  baseUrl?: string;
  error?: string;
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
  screening?: ScreeningState;
  cinemaCatalog?: CinemaCatalogState;
  cinemaCollection?: CinemaCollectionState;
  downloadTasks?: Record<string, DownloadTask>;
  downloadSnapshots?: unknown[];
  downloadPlanner?: DownloadPlannerState | null;
  purchaseReconciliation?: {
    items?: PurchaseReconciliationItem[];
    loading?: boolean;
    cloudError?: string;
    checkedAt?: string;
  } | null;
  experience?: ExperienceState;
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

export type SettingsSection = "service" | "experience" | "updates" | "data";

/** 从全局更新入口进入设置页时，明确定位到升级中心，而不是回到默认服务分区。 */
export type SettingsPageIntent = {
  section?: SettingsSection;
};
