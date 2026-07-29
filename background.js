"use strict";

importScripts("state_mutation_core.js", "experience_core.js", "update_core.js");

const stateMutationCore = globalThis.TxzzStateMutationCore;
const experienceCore = globalThis.TxzzExperienceCore;
const updateCore = globalThis.TxzzUpdateCore;
if (!stateMutationCore) throw new Error("状态变更核心未加载");
if (!experienceCore) throw new Error("体验状态核心未加载");
if (!updateCore) throw new Error("更新决策核心未加载");

const EXPERIENCE_STORAGE_KEY = "txzzExperienceV1";
const DOWNLOAD_SCHEDULER_ALARM = "txzz-download-scheduler";
const DOWNLOAD_NEXT_ALARM = "txzz-download-next";
const ACCOUNT_PATROL_ALARM = "txzz-account-patrol";
const STORAGE_AUDIT_ALARM = "txzz-storage-audit";

const API_CONFIG = {
  baseUrl: "https://txh068.com",
  version: "4.76",
  source: "Apple Computer, Inc.",
  aesKey: "fd14f9f8e38808fa"
};

const STORAGE_SCHEMA_VERSION = "2026-07-27-screening-v3-completeness";
// v8：在 v7 签名信任链上增加本地版本指纹，禁止升级后复用旧的“有更新”缓存。
const UPDATE_STATE_SCHEMA_VERSION = "2026-07-29-update-system-v8-local-fingerprint";
const UPDATE_MANIFEST_SCHEMA_VERSION = 3;
const EXPECTED_EXTENSION_ID = "ddefadnhgebdclpkabeobjidjllkdkhm";
const UPDATE_SIGNATURE_ALGORITHM = "RSASSA-PKCS1-v1_5-SHA-256";
const UPDATE_PUBLIC_KEY_SHA256 = "334503d764132bfa014e19839bba3a7cd4d906c74d7c6399c4bfe48975b22f16";
const UPDATE_PUBLIC_KEY_ID = `sha256:${UPDATE_PUBLIC_KEY_SHA256}`;
const UPDATE_PUBLIC_KEY_SPKI_BASE64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAscmukzGVUcjGOVpaoAKPaNtwf6mRUhZmrcsSQuewQgs2Qi9UmEE8jQMkbL56u+zxvWpDUWroUjzVhZ0WV6tcoH+Z85VbnNx6ErN6vpG/Hklda4k7odfLum+iQcPoS0t39t7XSuV3nqohhnAN8jmeh12crWyq0IM6pkc/2dKEkmKYX81lqtU+ZxvQQWkywAbV6ceBg0sw4PwZEsIbH3jMhtgBRYEpuaTrfMP63Uyfv8oTISCzpTHYY1wNwu3fJMf52VB95Ocqy2pKxEwlBDEtjG6aO5/olU7k20Mkbd0u8l+FjQgvYp8PTeagxtH1G5tO38MxK9qegttaI8Xgo/IjqwIDAQAB";
const LEGACY_REMOTE_BASE_URLS = [
  "https://txzz.lsy20.top",
  "https://txzz-secure-pool.3199912548.workers.dev"
];

const REMOTE_CONFIG = {
  baseUrl: "https://txzzsecure.lsy20.top",
  enabled: true,
  accountSourceMode: "cloud",
  fallbackLocal: true
};

// 内置服务访问密钥：与 Worker 中的同名常量保持一致，用户只需填写服务地址。
const BUILT_IN_REMOTE_ACCESS_TOKEN = "txzz_builtin_5b8d0ce4a7f341d99e6c2f183b704ad6_7c15f8a2";

const REPOSITORY_CONFIG = {
  owner: "lsy5920",
  repo: "tangxin-zhizhe-extension",
  url: "https://github.com/lsy5920/tangxin-zhizhe-extension",
  // 正式分发只接受固定仓库路径下的 CRX3，地址与安装包哈希都由签名清单约束。
  packageFormat: "crx",
  crxFileName: "tangxin-zhizhe-latest.crx",
  archiveUrls: [
    "https://github.com/lsy5920/tangxin-zhizhe-extension/raw/main/releases/tangxin-zhizhe-latest.crx",
    "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/releases/tangxin-zhizhe-latest.crx",
    "https://cdn.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/releases/tangxin-zhizhe-latest.crx",
    "https://fastly.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/releases/tangxin-zhizhe-latest.crx",
    "https://ghproxy.net/https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/releases/tangxin-zhizhe-latest.crx"
  ],
  /*
    更新清单多源策略（升级系统 v8）：
    1) 并发请求全部候选源，不要「第一个成功就返回」——jsDelivr @main 常强缓存旧版。
    2) 在所有成功响应中，按 version → build 取最新；同版本优先 GitHub raw / gitmirror。
    3) 国内 raw.githubusercontent 可能失败，gitmirror / jsDelivr 作兜底。
  */
  updateManifestUrls: [
    "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/update.json",
    "https://raw.gitmirror.com/lsy5920/tangxin-zhizhe-extension/main/update.json",
    "https://ghproxy.net/https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/update.json",
    "https://fastly.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/update.json",
    "https://cdn.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/update.json",
    "https://gcore.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/update.json",
    "https://cdn.jsdmirror.com/gh/lsy5920/tangxin-zhizhe-extension@main/update.json"
  ],
  updateManifestUrl: "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/update.json",
  // 自动检查命中 15 分钟成功缓存；用户手动检查与下载前检查始终实时执行。
  checkIntervalMs: 15 * 60 * 1000,
  timeoutMs: 8000,
  // 五个镜像串行兜底，单源 18 秒可把最坏总耗时控制在内容脚本 120 秒消息预算内。
  packageDownloadTimeoutMs: 18000,
  maxPackageBytes: 32 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024
};

// 不同调用契约分别去重：自动缓存、手动实时与“必须取得签名清单”的下载前检测不能互相冒充。
const repositoryUpdateCheckTasks = new Map();
// 同一时间只允许一个正式安装包任务，跨标签和重复消息共享完整检测、验证与下载提交结果。
let repositoryArchiveDownloadInFlight = null;
// 所有升级状态变更通过同一队列串行执行，防止检测结果覆盖并发写入的忽略 ID 或下载状态。
let repositoryUpdateStateWriteQueue = Promise.resolve();
// 所有 txzzState 写入共享同一条队列；配合三方合并，避免不同业务先读后写时整对象互相覆盖。
let stateMutationQueue = Promise.resolve();
const stateSnapshotByObject = new WeakMap();
const downloadProgressBuffer = new Map();
const downloadProgressTimers = new Map();
const downloadObservedStage = new Map();
const saveTokens = new Map();
let saveTokenMutationQueue = Promise.resolve();
let updateVerificationKeyPromise = null;
const localPurchaseLocks = new Set();
let latestPlaybackRequest = null;
let experienceMutationQueue = Promise.resolve();
let experienceSnapshot = experienceCore.defaultExperienceState();
let downloadDispatchTimer = null;
const downloadStartInFlight = new Set();
let accountPatrolInFlight = null;
let persistedDownloadsReconciled = false;
let persistedDownloadRecoveryInFlight = null;

const LOCAL_UPDATE_BUILD = "2026-07-30-0014";

const DEFAULT_STATE = {
  role: "guest",
    lastFullTrace: null,
    lastGuestTrace: null,
    notes: [],
    selectedFullAccountId: "",
    accountPool: [],
    fullplayEnabled: true,
    remote: REMOTE_CONFIG,
    fullDetails: [],
    screening: {
      schemaVersion: 2,
      activeSession: null,
      history: [],
      request: { phase: "idle" }
    },
    // 本地账号模式也使用持久化账本；该字段不会通过 sanitizeState 暴露给页面。
    localPurchaseLedger: {},
    fullDetailCache: {},
    downloadTasks: {},
    downloadSnapshots: [],
    downloadDeletedTaskIds: []
  };

const enc = new TextEncoder();
const dec = new TextDecoder();

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toBase64(bytes) {
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(parts.join(""));
}

function fromBase64(text) {
  const bin = atob(String(text).trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pkcs7(data) {
  let pad = 16 - (data.length % 16);
  if (pad === 0) pad = 16;
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  out.fill(pad, data.length);
  return out;
}

function unpkcs7(data) {
  const pad = data[data.length - 1];
  if (!pad || pad > 16) return data;
  return data.slice(0, data.length - pad);
}

async function importAesKey(keyText = API_CONFIG.aesKey) {
  return crypto.subtle.importKey("raw", enc.encode(keyText), "AES-CBC", false, ["encrypt", "decrypt"]);
}

async function encryptBlock(key, block, iv = new Uint8Array(16)) {
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, block));
  return out.slice(0, 16);
}

async function decryptBlock(key, block) {
  const padBlock = new Uint8Array(16);
  padBlock.fill(16);
  const encryptedPad = await encryptBlock(key, padBlock, block);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, key, concatBytes(block, encryptedPad))
  );
}

async function encryptJson(obj) {
  const key = await importAesKey();
  const plain = pkcs7(enc.encode(JSON.stringify(obj)));
  let out = new Uint8Array();
  for (let i = 0; i < plain.length; i += 16) {
    out = concatBytes(out, await encryptBlock(key, plain.slice(i, i + 16)));
  }
  return toBase64(out);
}

async function decryptText(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const key = await importAesKey();
    const bytes = fromBase64(text);
    let out = new Uint8Array();
    for (let i = 0; i < bytes.length; i += 16) {
      out = concatBytes(out, await decryptBlock(key, bytes.slice(i, i + 16)));
    }
    return JSON.parse(dec.decode(unpkcs7(out)));
  }
}

function makeDeviceId() {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return `web_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 13)}`;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function nowIso() {
  return new Date().toISOString();
}

function mask(value, head = 10, tail = 6) {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= head + tail + 3) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function accountName(info) {
  return String(info?.account_name || info?.username || info?.nickname || "");
}

function firstFilled(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function toFiniteNumber(value) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function coinValueFromInfo(info = {}) {
  const value = firstFilled(info, ["coin", "gold", "balance", "balance_income", "money", "amount", "wallet", "ticket"]);
  return toFiniteNumber(value);
}

function accountCoinValue(account = {}, fallback = Number.POSITIVE_INFINITY) {
  const value = coinValueFromInfo(account.userInfo || account.user_info || {});
  return value === null ? fallback : value;
}

function compareByCoinThenName(a, b) {
  const av = accountCoinValue(a);
  const bv = accountCoinValue(b);
  if (av !== bv) return av - bv;
  return String(a.label || a.username || a.id || "").localeCompare(String(b.label || b.username || b.id || ""), "zh-CN");
}

function sortAccountsByCoin(rows = []) {
  return [...rows].sort(compareByCoinThenName);
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function lowestCoinRandomOrder(rows = []) {
  const remaining = [...rows];
  const out = [];
  while (remaining.length) {
    const minCoin = Math.min(...remaining.map((row) => accountCoinValue(row)));
    const group = shuffle(remaining.filter((row) => accountCoinValue(row) === minCoin));
    out.push(...group);
    for (const row of group) {
      const index = remaining.findIndex((item) => item.id === row.id);
      if (index >= 0) remaining.splice(index, 1);
    }
  }
  return out;
}

function summarizeUserInfo(info) {
  if (!info) return null;
  return {
    id: info.id,
    username: info.username,
    account_name: info.account_name,
    nickname: info.nickname,
    balance: info.balance,
    balance_income: info.balance_income,
    coin: info.coin,
    gold: info.gold,
    money: info.money,
    amount: info.amount,
    wallet: info.wallet,
    is_vip: info.is_vip,
    is_dark_vip: info.is_dark_vip,
    vip: info.vip,
    dark_vip: info.dark_vip,
    has_vip: info.has_vip,
    has_dark_vip: info.has_dark_vip,
    vip_end_time: info.vip_end_time,
    dark_vip_end_time: info.dark_vip_end_time,
    group_name: info.group_name,
    group_end_time: info.group_end_time,
    ticket: info.ticket
  };
}

/** 为无法直接转成英文编号的文本生成稳定短哈希，避免中文账号编号冲突。 */
function shortStableHash(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || "")) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function slug(value) {
  const normalized = String(value || "").trim().normalize("NFKC").toLowerCase();
  const ascii = normalized
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return ascii || (normalized ? `u-${shortStableHash(normalized)}` : "");
}

function normalizeAccount(raw = {}) {
  const username = String(raw.username || raw.account_name || "").trim();
  const id = String(raw.id || (username ? `full-${slug(username)}` : `full-${Date.now()}`));
  const hasPassword = raw.hasPassword !== undefined ? Boolean(raw.hasPassword) : Boolean(raw.password);
  const hasQrcode = raw.hasQrcode !== undefined ? Boolean(raw.hasQrcode) : Boolean(raw.qrcode);
  const hasToken = raw.hasToken !== undefined ? Boolean(raw.hasToken) : Boolean(raw.userToken || raw.token);
  const source = String(raw.source || (raw.cloudReadonly || raw.isCloud || raw.remoteId || raw.cloudId ? "remote" : "manual"));
  return {
    id,
    label: String(raw.label || username || id || "账号池账号").trim(),
    username,
    password: String(raw.password || ""),
    qrcode: String(raw.qrcode || ""),
    role: "full",
    enabled: raw.enabled !== false,
    source,
    cloudReadonly: Boolean(raw.cloudReadonly || raw.isCloud || raw.remoteId || raw.cloudId || ["remote", "qrcode"].includes(source)),
    remoteId: String(raw.remoteId || raw.cloudId || ""),
    deviceId: String(raw.deviceId || ""),
    userToken: String(raw.userToken || raw.token || ""),
    notes: String(raw.notes || ""),
    userInfo: raw.userInfo || raw.user_info || null,
    lastVerifiedAt: raw.lastVerifiedAt || "",
    lastError: raw.lastError || "",
    status: raw.status || "idle",
    hasPassword,
    hasQrcode,
    hasToken,
    passwordMasked: raw.passwordMasked || (hasPassword ? "********" : ""),
    qrcodeMasked: raw.qrcodeMasked || "",
    tokenMasked: raw.tokenMasked || ""
  };
}

function publicAccount(account) {
  const item = normalizeAccount(account);
  return {
    ...item,
    password: "",
    qrcode: "",
    deviceId: "",
    userToken: "",
    hasPassword: Boolean(item.hasPassword || item.password),
    hasQrcode: Boolean(item.hasQrcode || item.qrcode),
    hasToken: Boolean(item.hasToken || item.userToken),
    passwordMasked: item.passwordMasked || (item.password ? "********" : ""),
    qrcodeMasked: item.qrcodeMasked || (item.qrcode ? mask(item.qrcode, 8, 6) : ""),
    tokenMasked: item.tokenMasked || (item.userToken ? mask(item.userToken, 12, 8) : ""),
    userInfo: summarizeUserInfo(item.userInfo)
  };
}

function normalizeRemoteConfig(remote = {}) {
  const mode = ["cloud", "local", "cloud-first"].includes(remote?.accountSourceMode)
    ? remote.accountSourceMode
    : REMOTE_CONFIG.accountSourceMode;
  const cleanRemote = { ...(remote || {}) };
  // 地址直连模式不再保存服务访问密钥，同时清理早期版本遗留字段。
  const legacyRemoteKeys = [
    "accessToken",
    "hasAccessToken",
    "accessTokenMasked",
    "clearAccessToken",
    "clientToken",
    ...["client", "admin"].flatMap((name) => [
    `${name}Token`,
    `has${name[0].toUpperCase()}${name.slice(1)}Token`,
    `${name}TokenMasked`
    ])
  ];
  for (const key of legacyRemoteKeys) {
    delete cleanRemote[key];
  }
  return {
    ...REMOTE_CONFIG,
    ...cleanRemote,
    baseUrl: String(remote?.baseUrl || REMOTE_CONFIG.baseUrl || "").replace(/\/+$/, ""),
    enabled: remote?.enabled !== false,
    accountSourceMode: mode,
    fixedAccountId: "",
    fallbackLocal: remote?.fallbackLocal !== false
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isLegacyRemoteBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  return !normalized || LEGACY_REMOTE_BASE_URLS.some((item) => normalizeBaseUrl(item) === normalized);
}

function isRemoteAccount(account = {}) {
  const source = String(account.source || "");
  return Boolean(account.cloudReadonly || account.isCloud || account.remoteId || account.cloudId)
    || source === "remote" || source === "qrcode";
}

function isCloudAccount(account = {}) {
  return isRemoteAccount(account);
}

function isHealthyAccount(account = {}) {
  const record = experienceSnapshot.accountPatrol?.records?.[String(account?.id || "")];
  return account?.enabled !== false
    && String(account?.status || "") !== "error"
    && String(record?.state || "") !== "needs_attention"
    && !experienceCore.accountIsCooling(record);
}

function playbackProtocol(url = "") {
  const value = String(url || "").toLowerCase();
  if (value.includes("m3u8")) return "hls";
  if (/\.(?:mp4|webm|m4v)(?:[?#]|$)/i.test(value)) return "progressive";
  return "unknown";
}

function sourceHealthFromLegacy(stat = null) {
  if (!stat) return { state: "unknown" };
  return {
    state: stat.error ? "failed" : stat.pending ? "probing" : stat.ok === false ? "degraded" : "healthy",
    status: stat.status,
    latencyMs: stat.latencyMs,
    segments: stat.segments,
    duration: stat.duration,
    score: stat.score,
    error: stat.error,
    checkedAt: stat.checkedAt
  };
}

function playbackSourceScore(source = null) {
  if (!source?.url || source.health?.state === "failed" || source.health?.error) return -10000;
  const explicit = Number(source.health?.score);
  if (Number.isFinite(explicit)) return explicit;
  let score = source.health?.state === "healthy" ? 160 : source.health?.state === "degraded" ? 80 : source.health?.state === "probing" ? 35 : 20;
  const status = Number(source.health?.status || 0);
  if (status >= 200 && status < 400) score += 40;
  else if (status > 0) score -= 80;
  const latency = Number(source.health?.latencyMs || 0);
  if (latency > 0) score -= Math.min(30, latency / 100);
  return score;
}

function playbackSourceDuration(source = null) {
  const duration = Number(source?.health?.duration || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function isMeaningfullyLongerSource(candidate = null, baseline = null) {
  const candidateDuration = playbackSourceDuration(candidate);
  const baselineDuration = playbackSourceDuration(baseline);
  if (!candidateDuration || !baselineDuration || candidateDuration <= baselineDuration) return false;
  return candidateDuration - baselineDuration >= Math.max(90, baselineDuration * 0.08);
}

function comparePlaybackSources(left, right) {
  const leftScore = playbackSourceScore(left);
  const rightScore = playbackSourceScore(right);
  const leftUsable = leftScore > -10000;
  const rightUsable = rightScore > -10000;
  if (leftUsable !== rightUsable) return leftUsable ? -1 : 1;
  if (leftUsable && rightUsable) {
    if (isMeaningfullyLongerSource(left, right)) return -1;
    if (isMeaningfullyLongerSource(right, left)) return 1;
  }
  const scoreDiff = rightScore - leftScore;
  if (scoreDiff) return scoreDiff;
  if (left.id === "primary") return -1;
  if (right.id === "primary") return 1;
  return String(left.id).localeCompare(String(right.id));
}

function recommendedPlaybackSource(sources = []) {
  return [...sources].sort(comparePlaybackSources)[0] || null;
}

function playbackReasonCodes(recommended, sources = []) {
  if (!recommended) return ["no-playable-source"];
  const completeness = sources.some((source) => (
    source.id !== recommended.id && isMeaningfullyLongerSource(recommended, source)
  ));
  return [
    ...(completeness ? ["longer-playlist-duration"] : []),
    recommended.health?.state === "healthy" ? "healthy-source" : "best-available-source"
  ];
}

function legacyDetailToPlaybackSession(detail = {}, summary = {}, account = null, options = {}) {
  const movieId = String(options.movieId || summary.movieId || detail.id || "").trim();
  const normalizedDetail = normalizeFullDetail({ ...summary, ...detail }) || {};
  const rows = [
    { id: "primary", label: "主线路", url: normalizedDetail.play_link || "", stat: summary.fullStat },
    { id: "backup", label: "备用线路", url: normalizedDetail.backup_link || "", stat: summary.backupStat }
  ];
  const sources = rows
    .map((row) => ({
      id: row.id,
      label: row.label,
      url: absoluteUrl(row.url),
      protocol: playbackProtocol(row.url),
      health: sourceHealthFromLegacy(row.stat)
    }))
    .filter((source) => Boolean(source.url));
  const recommended = recommendedPlaybackSource(sources);
  const fetchedAt = String(summary.fetchedAt || nowIso());
  return {
    id: String(options.sessionId || crypto.randomUUID()),
    movieId,
    title: String(options.movieTitle || summary.movieTitle || summary.title || detail.title || `视频 ${movieId}`),
    phase: "ready",
    sources,
    decision: {
      recommendedSourceId: recommended?.id || sources[0]?.id || "",
      reasonCodes: playbackReasonCodes(recommended, sources),
      failoverAllowed: sources.length > 1
    },
    account: account ? { id: account.id, label: account.label } : undefined,
    acquisition: options.acquisition || {
      mode: "legacy",
      attempts: Number(summary.rotation?.tried || 1),
      failed: (summary.rotation?.failed || []).map((item) => ({ ...item, message: item.message || item.error || "未知错误" }))
    },
    fetchedAt,
    expiresAt: String(options.expiresAt || new Date(Date.parse(fetchedAt) + 10 * 60 * 1000).toISOString())
  };
}

function normalizeStoredPlaybackSession(session = null) {
  if (!session?.movieId || !Array.isArray(session.sources)) return null;
  const sources = session.sources
    .map((source, index) => ({
      ...source,
      id: String(source?.id || (index === 0 ? "primary" : `source-${index + 1}`)),
      label: String(source?.label || (index === 0 ? "主线路" : `线路 ${index + 1}`)),
      url: absoluteUrl(source?.url || ""),
      protocol: source?.protocol || playbackProtocol(source?.url),
      health: source?.health && typeof source.health === "object" ? source.health : { state: "unknown" }
    }))
    .filter((source) => hasReturnedPlayLink(source.url));
  const requested = sources.find((source) => source.id === String(session.decision?.recommendedSourceId || ""));
  const ranked = recommendedPlaybackSource(sources);
  // 保留服务端有效决定；但旧会话若明确选中了显著更短的线路，升级后立即纠正。
  const recommended = !requested || requested.health?.state === "failed" || (ranked && isMeaningfullyLongerSource(ranked, requested))
    ? ranked
    : requested;
  return {
    ...session,
    movieId: String(session.movieId),
    sources,
    decision: {
      ...(session.decision || {}),
      recommendedSourceId: recommended?.id || "",
      reasonCodes: recommended?.id !== requested?.id
        ? playbackReasonCodes(recommended, sources)
        : Array.isArray(session.decision?.reasonCodes) ? session.decision.reasonCodes : ["stored-session"],
      failoverAllowed: sources.length > 1
    }
  };
}

function playbackSessionSummary(session = {}, detail = {}) {
  const recommended = (session.sources || []).find((source) => source.id === session.decision?.recommendedSourceId && source.url)
    || recommendedPlaybackSource(session.sources || []);
  const backup = [...(session.sources || [])]
    .filter((source) => source.url && source.id !== recommended?.id)
    .sort(comparePlaybackSources)[0];
  const toLegacyStat = (source) => source ? {
    url: source.url,
    status: source.health?.status,
    latencyMs: source.health?.latencyMs,
    segments: source.health?.segments,
    duration: source.health?.duration,
    score: source.health?.score,
    error: source.health?.error,
    pending: source.health?.state === "probing",
    ok: source.health?.state === "healthy"
  } : null;
  return {
    movieId: session.movieId,
    movieTitle: session.title,
    title: session.title,
    accountId: session.account?.id,
    accountLabel: session.account?.label,
    action: session.acquisition?.mode === "purchased" ? "buy_then_full_detail" : "direct_full_detail",
    hasBuy: detail?.has_buy,
    playLink: recommended?.url || "",
    backupLink: backup?.url || "",
    recommendedPlayLink: recommended?.url || "",
    recommendedSourceId: recommended?.id || "",
    fullStat: toLegacyStat(recommended),
    recommendedStat: toLegacyStat(recommended),
    backupStat: toLegacyStat(backup),
    fetchedAt: session.fetchedAt,
    rotation: {
      tried: session.acquisition?.attempts || 1,
      failed: session.acquisition?.failed || [],
      coinSort: true
    }
  };
}

function normalizeScreeningState(screening = null, legacyDetails = []) {
  const byMovieId = new Map();
  for (const raw of Array.isArray(screening?.history) ? screening.history : []) {
    const session = normalizeStoredPlaybackSession(raw);
    if (session) byMovieId.set(session.movieId, session);
  }
  for (const item of Array.isArray(legacyDetails) ? legacyDetails : []) {
    const legacy = legacyDetailToPlaybackSession(item, item, null, {
      movieId: item?.movieId,
      movieTitle: item?.movieTitle || item?.title
    });
    const existing = byMovieId.get(String(legacy.movieId));
    // 早期 5.0 预构建可能先写入了空 sources；后续抓到真实链接时必须修复，而不是永久沿用空会话。
    if (legacy.movieId && legacy.sources.length && (!existing || !existing.sources.length)) {
      byMovieId.set(String(legacy.movieId), legacy);
    }
  }
  const history = [...byMovieId.values()];
  const rawActive = normalizeStoredPlaybackSession(screening?.activeSession);
  const activeFromHistory = rawActive?.movieId ? byMovieId.get(String(rawActive.movieId)) : null;
  const activeSession = activeFromHistory?.sources.length
    ? activeFromHistory
    : rawActive?.sources.length
      ? rawActive
      : [...history].reverse().find((item) => item.sources.length) || rawActive || history[history.length - 1] || null;
  return {
    schemaVersion: 2,
    activeSession,
    history: history.slice(-50),
    request: screening?.request && typeof screening.request === "object" ? screening.request : { phase: "idle" }
  };
}

function mergeScreeningSession(screening, session) {
  const normalized = normalizeScreeningState(screening);
  const history = normalized.history.filter((item) => String(item.movieId) !== String(session.movieId));
  return {
    schemaVersion: 2,
    activeSession: session,
    history: [...history, session].slice(-50),
    request: { phase: "idle", requestId: "", movieId: session.movieId, error: "" }
  };
}

function buildAutoCleanState(storedState = {}) {
  const previousRemote = normalizeRemoteConfig(storedState.remote || {});
  const legacyDetails = Array.isArray(storedState.fullDetails) ? storedState.fullDetails : [];
  return {
    ...DEFAULT_STATE,
    ...storedState,
    role: storedState.role || DEFAULT_STATE.role,
    selectedFullAccountId: storedState.selectedFullAccountId || "",
    accountPool: Array.isArray(storedState.accountPool) ? storedState.accountPool : [],
    remote: {
      ...REMOTE_CONFIG,
      accountSourceMode: REMOTE_CONFIG.accountSourceMode,
      fixedAccountId: "",
      fallbackLocal: true,
      lastAutoCleanAt: nowIso(),
      lastAutoCleanReason: isLegacyRemoteBaseUrl(previousRemote.baseUrl)
        ? "检测到旧 Worker 地址或空地址，已自动切换到当前默认 Worker；账号池和下载记录均已保留"
        : "播放线路完整度探测已升级；旧片源缓存已清理，账号池、历史和下载记录均已保留"
    },
    fullDetails: legacyDetails.slice(-80),
    screening: normalizeScreeningState(storedState.screening, legacyDetails),
    fullDetailCache: {},
    lastFullTrace: null,
    lastGuestTrace: null,
    notes: [],
    downloadTasks: storedState.downloadTasks && typeof storedState.downloadTasks === "object" ? storedState.downloadTasks : {},
    downloadSnapshots: Array.isArray(storedState.downloadSnapshots) ? storedState.downloadSnapshots : [],
    downloadDeletedTaskIds: Array.isArray(storedState.downloadDeletedTaskIds) ? storedState.downloadDeletedTaskIds : [],
    localPurchaseLedger: storedState.localPurchaseLedger && typeof storedState.localPurchaseLedger === "object" ? storedState.localPurchaseLedger : {},
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    autoCleanedAt: nowIso()
  };
}

function shouldAutoCleanStoredState(storedState = {}) {
  if (!storedState || typeof storedState !== "object") return true;
  if (storedState.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) return true;
  if (isLegacyRemoteBaseUrl(storedState.remote?.baseUrl)) return true;
  return false;
}

function publicRemoteConfig(remote = {}) {
  return normalizeRemoteConfig(remote);
}

async function remoteRequest(state, endpoint, options = {}) {
  const remote = normalizeRemoteConfig(state.remote);
  if (!remote.enabled || !remote.baseUrl) throw new Error("remote worker is not configured");
  const { allowErrorPayload = false, timeoutMs = endpoint.includes("full-detail") ? 60000 : 15000, ...fetchOptions } = options;
  const res = await fetch(`${remote.baseUrl}${endpoint}`, {
    ...fetchOptions,
    signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      ...(fetchOptions.headers || {}),
      // 内置鉴权头最后写入，避免内部调用参数意外覆盖配套密钥。
      Authorization: `Bearer ${BUILT_IN_REMOTE_ACCESS_TOKEN}`
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  if (!res.ok || (data?.ok === false && !allowErrorPayload)) {
    const error = new Error(data?.error || `云端接口 ${endpoint} 请求失败：HTTP ${res.status}`);
    error.status = res.status;
    error.code = data?.code || "";
    throw error;
  }
  return data;
}

async function syncRemoteAccounts(state) {
  const remote = normalizeRemoteConfig(state.remote);
  state.remote = remote;
  if (!remote.enabled || !remote.baseUrl) return state;
  try {
    const data = await remoteRequest(state, "/v1/accounts");
    if (Array.isArray(data.accounts)) {
      const merged = new Map();
      for (const account of state.accountPool || []) {
        const normalized = normalizeAccount(account);
        if (normalized.source !== "remote" && normalized.source !== "qrcode" && normalized.source !== "remote-seed") {
          merged.set(normalized.id, normalized);
        }
      }
      for (const account of data.accounts) {
        merged.set(account.id, normalizeAccount({
          ...account,
          source: account.source || "remote",
          cloudReadonly: true,
          remoteId: account.remoteId || account.id
        }));
      }
      state.accountPool = Array.from(merged.values());
      state.remote.lastSyncAt = nowIso();
      state.remote.lastError = "";
      if (!state.selectedFullAccountId || !state.accountPool.some((item) => item.id === state.selectedFullAccountId) || !isHealthyAccount(state.accountPool.find((item) => item.id === state.selectedFullAccountId))) {
        const healthy = data.accounts.find(isHealthyAccount) || state.accountPool.find(isHealthyAccount);
        state.selectedFullAccountId = healthy?.id || data.accounts[0]?.id || state.accountPool[0]?.id || "";
      }
      await saveState(state);
    }
  } catch (err) {
    state.remote.lastError = err?.message || String(err);
    await saveState(state);
  }
  return state;
}

/**
 * 体验状态独立于高频 txzzState 写入；读取和修改都经过自己的串行队列，
 * 防止下载进度更新覆盖收藏、书签或巡检记录。
 */
async function getExperienceInternal() {
  await experienceMutationQueue.catch(() => {});
  const stored = await chrome.storage.local.get(EXPERIENCE_STORAGE_KEY);
  const normalized = experienceCore.normalizeExperienceState(stored[EXPERIENCE_STORAGE_KEY] || {});
  experienceSnapshot = normalized;
  return structuredClone(normalized);
}

async function mutateExperience(mutator) {
  const task = experienceMutationQueue.then(async () => {
    const stored = await chrome.storage.local.get(EXPERIENCE_STORAGE_KEY);
    const current = experienceCore.normalizeExperienceState(stored[EXPERIENCE_STORAGE_KEY] || {});
    const mutated = await mutator(structuredClone(current));
    const normalized = experienceCore.normalizeExperienceState(mutated || current);
    await chrome.storage.local.set({ [EXPERIENCE_STORAGE_KEY]: normalized });
    experienceSnapshot = normalized;
    return structuredClone(normalized);
  });
  experienceMutationQueue = task.catch(() => {});
  return task;
}

function publicExperienceState() {
  return experienceCore.normalizeExperienceState(experienceSnapshot);
}

async function getStateInternal() {
  await stateMutationQueue.catch(() => {});
  await getExperienceInternal();
  const stored = await chrome.storage.local.get("txzzState");
  const storedState = stored.txzzState || {};
  const removedRemoteAccessConfig = [
    "accessToken",
    "hasAccessToken",
    "accessTokenMasked",
    "clearAccessToken",
    "clientToken",
    "hasClientToken",
    "clientTokenMasked",
    "adminToken",
    "hasAdminToken",
    "adminTokenMasked"
  ].some((key) => Object.prototype.hasOwnProperty.call(storedState.remote || {}, key));
  const autoCleaned = shouldAutoCleanStoredState(storedState);
  const state = autoCleaned ? buildAutoCleanState(storedState) : { ...DEFAULT_STATE, ...storedState };
  state.remote = normalizeRemoteConfig(state.remote);
  state.storageSchemaVersion = STORAGE_SCHEMA_VERSION;
  state.autoCleanedThisLoad = Boolean(autoCleaned);
  const merged = new Map();
  for (const account of Array.isArray(state.accountPool) ? state.accountPool : []) {
    const normalized = normalizeAccount(account);
    if (normalized.id === "full-lsyhook" || normalized.source === "seed" || normalized.source === "remote-seed") continue;
    const seeded = merged.get(normalized.id);
    merged.set(normalized.id, { ...(seeded || {}), ...normalized });
  }
  state.accountPool = Array.from(merged.values());
  if (!state.selectedFullAccountId || !state.accountPool.some((item) => item.id === state.selectedFullAccountId)) {
    state.selectedFullAccountId = state.accountPool[0]?.id || "";
  }
  state.fullDetails = Array.isArray(state.fullDetails) ? state.fullDetails.slice(-80) : [];
  state.screening = normalizeScreeningState(state.screening, state.fullDetails);
  state.fullDetailCache = state.fullDetailCache && typeof state.fullDetailCache === "object" ? state.fullDetailCache : {};
  state.localPurchaseLedger = state.localPurchaseLedger && typeof state.localPurchaseLedger === "object" ? state.localPurchaseLedger : {};
  state.downloadTasks = compactDownloadTasks(state.downloadTasks && typeof state.downloadTasks === "object" ? state.downloadTasks : {});
  state.downloadSnapshots = Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots.slice(-30) : [];
  state.downloadDeletedTaskIds = Array.isArray(state.downloadDeletedTaskIds) ? state.downloadDeletedTaskIds.slice(-120).map(String) : [];
  if (autoCleaned) {
    await chrome.storage.local.remove(["txzzUpdateState", "txzzLastWorkerDiagnostics"]);
    await saveState({ ...state, autoCleanedThisLoad: false });
  } else if (removedRemoteAccessConfig) {
    // 覆盖升级时主动删除旧密钥字段，避免已取消的配置继续残留在本地存储。
    await saveState(state);
  }
  stateSnapshotByObject.set(state, structuredClone(state));
  return state;
}

function sanitizeState(state) {
  const {
    localPurchaseLedger: _localPurchaseLedger,
    fullDetailCache: _fullDetailCache,
    downloadDeletedTaskIds: _downloadDeletedTaskIds,
    ...publicState
  } = state || {};
  return {
    ...publicState,
    remote: publicRemoteConfig(state.remote),
    accountPool: (state.accountPool || []).map(publicAccount),
    fullDetails: (state.fullDetails || []).slice(-80),
    screening: normalizeScreeningState(state.screening, state.fullDetails),
    downloadTasks: state.downloadTasks && typeof state.downloadTasks === "object" ? state.downloadTasks : {},
    downloadSnapshots: Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots.slice(-30) : [],
    experience: publicExperienceState()
  };
}

function mergeConcurrentState(base, incoming, current) {
  return stateMutationCore.mergeConcurrentState(base, incoming, current);
}

async function saveState(state) {
  const incoming = { ...state, storageSchemaVersion: STORAGE_SCHEMA_VERSION };
  const base = stateSnapshotByObject.get(state) || null;
  const writeTask = stateMutationQueue.then(async () => {
    const stored = await chrome.storage.local.get("txzzState");
    const current = stored.txzzState || {};
    const nextState = base
      ? mergeConcurrentState(base, incoming, current)
      : { ...current, ...incoming };
    nextState.storageSchemaVersion = STORAGE_SCHEMA_VERSION;
    await chrome.storage.local.set({ txzzState: nextState });
    stateSnapshotByObject.set(nextState, structuredClone(nextState));
    return nextState;
  });
  stateMutationQueue = writeTask.catch(() => {});
  return writeTask;
}

async function resetAllLocalData() {
  await chrome.storage.local.clear();
  experienceSnapshot = experienceCore.defaultExperienceState();
  await chrome.storage.local.set({ [EXPERIENCE_STORAGE_KEY]: experienceSnapshot });
  const state = {
    ...DEFAULT_STATE,
    accountPool: [],
    remote: { ...REMOTE_CONFIG },
    fullDetails: [],
    screening: normalizeScreeningState(null, []),
    localPurchaseLedger: {},
    fullDetailCache: {},
    downloadTasks: {},
    downloadSnapshots: [],
    downloadDeletedTaskIds: [],
    lastFullTrace: null,
    lastGuestTrace: null,
    notes: []
  };
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

async function stateResponseWithExperience(extra = {}) {
  const state = await getStateInternal();
  return { ok: true, ...extra, state: sanitizeState(state), experience: publicExperienceState() };
}

async function updateLibraryExperience(message = {}) {
  const patch = {
    movieId: message.movieId,
    title: message.title || message.movieTitle
  };
  // 只传递调用方真正提供的字段；把 undefined 写入会误清另一项收藏标记或已有备注。
  for (const key of ["favorite", "watchLater", "tags", "note", "lastPlayedAt", "watchedAt"]) {
    if (Object.prototype.hasOwnProperty.call(message, key)) patch[key] = message[key];
  }
  await mutateExperience((experience) => experienceCore.updateLibraryEntry(experience, patch));
  return stateResponseWithExperience();
}

async function markLibraryPlayback(message = {}) {
  const movieId = String(message.movieId || "").trim();
  if (!movieId) return stateResponseWithExperience();
  await mutateExperience((experience) => {
    const current = experience.library?.[movieId];
    if (!current) return experience;
    return experienceCore.updateLibraryEntry(experience, {
      ...current,
      movieId,
      title: message.title || current.title,
      lastPlayedAt: nowIso(),
      watchedAt: message.ended === true ? nowIso() : current.watchedAt
    });
  });
  return stateResponseWithExperience();
}

async function savePlaybackBookmark(message = {}) {
  const bookmark = {
    id: String(message.id || `bookmark_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`),
    movieId: String(message.movieId || "").trim(),
    title: String(message.title || message.movieTitle || "").trim(),
    label: String(message.label || "").trim(),
    note: String(message.note || "").trim(),
    startSeconds: Number(message.startSeconds ?? message.positionSeconds ?? 0),
    endSeconds: message.endSeconds === null || message.endSeconds === undefined ? null : Number(message.endSeconds),
    durationSeconds: Number(message.durationSeconds || 0)
  };
  await mutateExperience((experience) => experienceCore.addBookmark(experience, bookmark));
  return stateResponseWithExperience({ bookmark });
}

async function deletePlaybackBookmark(message = {}) {
  await mutateExperience((experience) => experienceCore.removeBookmark(
    experience,
    String(message.movieId || ""),
    String(message.bookmarkId || message.id || "")
  ));
  return stateResponseWithExperience();
}

async function markExperienceAlert(message = {}) {
  await mutateExperience((experience) => {
    const next = experienceCore.normalizeExperienceState(experience);
    const id = String(message.alertId || "");
    next.alerts = next.alerts.map((item) => item.id === id ? { ...item, readAt: nowIso() } : item);
    return next;
  });
  return stateResponseWithExperience();
}

async function clearExperienceAlerts() {
  await mutateExperience((experience) => ({ ...experience, alerts: [] }));
  return stateResponseWithExperience();
}

async function notificationsPermissionGranted() {
  if (!chrome.notifications?.create || !chrome.permissions?.contains) return false;
  try {
    return await chrome.permissions.contains({ permissions: ["notifications"] });
  } catch (_) {
    return false;
  }
}

async function emitExperienceAlert(alert) {
  const experience = await mutateExperience((current) => experienceCore.pushAlert(current, alert));
  if (!experience.notificationsEnabled || !await notificationsPermissionGranted()) return experience;
  const latest = experience.alerts.find((item) => item.key === String(alert.key || "")) || experience.alerts.at(-1);
  if (!latest) return experience;
  await chrome.notifications.create(`txzz-${latest.id}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/notification.svg"),
    title: latest.title || "糖心志者",
    message: latest.detail || latest.title || "有一条新提醒",
    priority: latest.level === "error" ? 2 : 0
  }).catch(() => {});
  return experience;
}

async function setNotificationsEnabled(enabled) {
  const requested = enabled === true;
  if (requested) {
    if (!chrome.permissions?.request) throw new Error("当前浏览器不支持可选通知权限");
    const granted = await chrome.permissions.request({ permissions: ["notifications"] });
    if (!granted) throw new Error("系统通知权限未授予；插件内提醒仍可正常使用");
  } else if (chrome.permissions?.remove) {
    await chrome.permissions.remove({ permissions: ["notifications"] }).catch(() => false);
  }
  await mutateExperience((experience) => ({ ...experience, notificationsEnabled: requested }));
  return stateResponseWithExperience({ granted: requested });
}

async function saveExperienceSettings(message = {}) {
  await mutateExperience((experience) => ({
    ...experience,
    downloadPolicy: {
      ...experience.downloadPolicy,
      ...(message.downloadPolicy && typeof message.downloadPolicy === "object" ? message.downloadPolicy : {})
    },
    accountPatrol: {
      ...experience.accountPatrol,
      ...(message.accountPatrol && typeof message.accountPatrol === "object" ? message.accountPatrol : {}),
      records: experience.accountPatrol?.records || {}
    }
  }));
  await ensureAutomationAlarms();
  scheduleDownloadDispatch(0);
  return stateResponseWithExperience();
}

async function apiRequestRaw(endpoint, data, session = {}) {
  const payload = {
    data: data ?? "",
    token: session.userToken || session.token || "",
    deviceId: session.deviceId || "",
    device: "Win32",
    source: API_CONFIG.source,
    driver: true
  };
  const body = await encryptJson(payload);
  const res = await fetch(`${API_CONFIG.baseUrl.replace(/\/+$/, "")}/h5${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Accept": "application/json, text/plain, */*",
      "deviceType": "web",
      "time": String(Math.round(Date.now() / 1000)),
      "version": API_CONFIG.version
    },
    body
  });
  const raw = await res.text();
  const parsed = await decryptText(raw);
  return { httpStatus: res.status, endpoint, data, response: parsed };
}

async function apiRequest(endpoint, data, session = {}) {
  const result = await apiRequestRaw(endpoint, data, session);
  const response = result.response || {};
  if (!result.httpStatus || result.httpStatus >= 400 || response.status !== "y") {
    const msg = response.error || response.msg || response.message || JSON.stringify(response).slice(0, 240);
    const error = new Error(`${endpoint} failed: ${msg}`);
    error.httpStatus = result.httpStatus;
    error.upstreamRejected = result.httpStatus > 0 && result.httpStatus < 400 && response.status !== "y";
    throw error;
  }
  return response.data;
}

function buildFullToken(data) {
  if (!data?.token || !data?.user_id) return "";
  return `${data.token}_${data.user_id}`;
}

async function createVisitorSession(deviceId) {
  const session = { deviceId, userToken: "" };
  await apiRequest("/system/info", {}, session);
  const menu = await apiRequest("/system/menu", { channel_code: "", share_code: "" }, session);
  const userToken = buildFullToken(menu);
  if (!userToken) throw new Error(`/system/menu did not return visitor token for ${deviceId}`);
  return { deviceId, userToken, menu };
}

function validateExpectedAccount(account, userInfo) {
  const expected = String(account.username || "").trim().toLowerCase();
  const candidates = [userInfo?.account_name, userInfo?.username, userInfo?.nickname]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (expected && candidates.length && !candidates.includes(expected)) {
    throw new Error(`账号身份不匹配：期望 ${account.username}，实际 ${accountName(userInfo) || candidates.join("/")}`);
  }
}

async function verifySessionForAccount(account, session) {
  const info = await apiRequest("/user/info", {}, session);
  validateExpectedAccount(account, info);
  return {
    deviceId: session.deviceId,
    userToken: session.userToken,
    userInfo: summarizeUserInfo(info)
  };
}

function normalizeBootstrapSession(session = {}) {
  const userToken = String(session.userToken || session.token || "");
  const deviceId = String(session.deviceId || "");
  return userToken && deviceId ? { userToken, deviceId } : null;
}

async function loginByAccount(account, bootstrapSession = null) {
  const attempts = [];
  const bootstrap = normalizeBootstrapSession(bootstrapSession);
  if (bootstrap) {
    try {
      const data = await apiRequest(
        "/user/findByAccount",
        {
          account_name: account.username,
          account_password: account.password,
          type: "login"
        },
        bootstrap
      );
      const userToken = buildFullToken(data);
      if (!userToken) throw new Error("/user/findByAccount did not return token/user_id");
      return await verifySessionForAccount(account, { deviceId: bootstrap.deviceId, userToken });
    } catch (err) {
      attempts.push({ deviceId: bootstrap.deviceId, step: "bootstrap-login", error: err?.message || String(err) });
    }
  }

  const candidateDeviceIds = unique([
    account.deviceId,
    "web_8c204a9995314",
    makeDeviceId(),
    makeDeviceId(),
    makeDeviceId(),
    makeDeviceId(),
    makeDeviceId(),
    makeDeviceId(),
    makeDeviceId(),
    makeDeviceId()
  ]);
  for (const deviceId of candidateDeviceIds) {
    try {
      const visitor = await createVisitorSession(deviceId);
      const data = await apiRequest(
        "/user/findByAccount",
        {
          account_name: account.username,
          account_password: account.password,
          type: "login"
        },
        visitor
      );
      const userToken = buildFullToken(data);
      if (!userToken) throw new Error("/user/findByAccount did not return token/user_id");
      return await verifySessionForAccount(account, { deviceId, userToken });
    } catch (err) {
      attempts.push({ deviceId, error: err?.message || String(err) });
    }
  }
  throw new Error(`账号密码登录失败：${JSON.stringify(attempts.slice(-4))}`);
}

async function restoreByQrcode(account, bootstrapSession = null) {
  const attempts = [];
  const bootstrap = normalizeBootstrapSession(bootstrapSession);
  if (bootstrap) {
    try {
      const data = await apiRequest("/user/findQrcode", { code: account.qrcode }, bootstrap);
      const userToken = buildFullToken(data);
      if (!userToken) throw new Error("/user/findQrcode did not return token/user_id");
      return await verifySessionForAccount(account, { deviceId: bootstrap.deviceId, userToken });
    } catch (err) {
      attempts.push({ deviceId: bootstrap.deviceId, step: "bootstrap-qrcode", error: err?.message || String(err) });
    }
  }

  const candidateDeviceIds = unique([account.deviceId, "web_8c204a9995314", makeDeviceId(), makeDeviceId(), makeDeviceId(), makeDeviceId()]);
  for (const deviceId of candidateDeviceIds) {
    try {
      const visitor = await createVisitorSession(deviceId);
      const data = await apiRequest("/user/findQrcode", { code: account.qrcode }, visitor);
      const userToken = buildFullToken(data);
      if (!userToken) throw new Error("/user/findQrcode did not return token/user_id");
      return await verifySessionForAccount(account, { deviceId, userToken });
    } catch (err) {
      attempts.push({ deviceId, error: err?.message || String(err) });
    }
  }
  throw new Error(`账号凭证找回失败：${JSON.stringify(attempts.slice(-4))}`);
}

async function acquireAccountSession(account, bootstrapSession = null) {
  const errors = [];
  if (account.userToken && account.deviceId) {
    try {
      return await verifySessionForAccount(account, { deviceId: account.deviceId, userToken: account.userToken });
    } catch (err) {
      errors.push(`已保存 token 无效：${err?.message || err}`);
    }
  }
  if (account.username && account.password) {
    try {
      return await loginByAccount(account, bootstrapSession);
    } catch (err) {
      errors.push(err?.message || String(err));
    }
  }
  if (account.qrcode) {
    try {
      return await restoreByQrcode(account, bootstrapSession);
    } catch (err) {
      errors.push(err?.message || String(err));
    }
  }
  throw new Error(errors.join("; ") || "账号没有可用凭据");
}

async function updateAccountSession(accountId, bootstrapSession = null) {
  const state = await getStateInternal();
  const index = state.accountPool.findIndex((item) => item.id === accountId);
  if (index < 0) throw new Error(`未找到账号：${accountId}`);
  const account = normalizeAccount(state.accountPool[index]);
  if (isCloudAccount(account)) {
    try {
      const response = await remoteRequest(state, "/v1/accounts/verify", {
        method: "POST",
        body: JSON.stringify({ accountId: account.id, bootstrapSession })
      });
      const synced = await syncRemoteAccounts(await getStateInternal());
      return { state: sanitizeState(synced), account: response.account, session: response.session || null };
    } catch (err) {
      state.accountPool[index] = { ...account, lastError: err?.message || String(err), status: "error" };
      await saveState(state);
      throw err;
    }
  }
  try {
    const session = await acquireAccountSession(account, bootstrapSession);
    state.accountPool[index] = {
      ...account,
      deviceId: session.deviceId,
      userToken: session.userToken,
      userInfo: session.userInfo,
      lastVerifiedAt: nowIso(),
      lastError: "",
      status: "ok"
    };
    state.selectedFullAccountId = account.id;
    await saveState(state);
    return { state: sanitizeState(state), account: publicAccount(state.accountPool[index]), session };
  } catch (err) {
    state.accountPool[index] = { ...account, lastError: err?.message || String(err), status: "error" };
    await saveState(state);
    throw err;
  }
}

function absoluteUrl(link) {
  const value = String(link || "").trim();
  if (!value) return "";
  try {
    if (value.startsWith("//")) return `https:${value}`;
    return new URL(value, API_CONFIG.baseUrl).href;
  } catch (_) {
    return value;
  }
}

function safeFileName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function displayMovieTitle(detail = {}, summary = {}, fallback = "") {
  return String(
    detail.title ||
    detail.name ||
    detail.movie_title ||
    detail.movieTitle ||
    detail.video_title ||
    detail.videoTitle ||
    detail.mv_name ||
    detail.desc ||
    summary.title ||
    summary.name ||
    fallback ||
    ""
  ).trim();
}

function downloadTitleSnippet(title = "", movieId = "") {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return `视频_${movieId || Date.now()}`;
  return clean.length > 14 ? clean.slice(0, 14) : clean;
}

function downloadFileName(movieId, ext = "mp4", title = "") {
  const snippet = safeFileName(downloadTitleSnippet(title, movieId));
  const idPart = safeFileName(movieId || Date.now());
  return `糖心志者/${snippet}_${idPart}.${ext}`;
}

function downloadTaskId(movieId) {
  return `txzz_download_movie_${safeFileName(movieId || "unknown")}`;
}

function downloadAttemptId() {
  return `attempt_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function normalizeDownloadStage(stage = "") {
  return stateMutationCore.normalizeDownloadStage(stage);
}

function isDownloadRunning(task = {}) {
  return ["queued", "probing", "downloading", "recovering", "assembling", "saving"].includes(normalizeDownloadStage(task.stage));
}

function isDownloadReady(task = {}) {
  return ["ready", "complete"].includes(String(task.stage || "")) || Boolean(task.objectReady);
}

function compactDownloadTasks(tasks = {}) {
  const grouped = new Map();
  for (const [key, rawTask] of Object.entries(tasks || {})) {
    if (!rawTask || typeof rawTask !== "object") continue;
    const task = {
      ...rawTask,
      stage: normalizeDownloadStage(rawTask.stage),
      priority: experienceCore.normalizePriority(rawTask.priority),
      notBefore: String(rawTask.notBefore || ""),
      pauseReason: String(rawTask.pauseReason || ""),
      createdAt: String(rawTask.createdAt || rawTask.updatedAt || nowIso())
    };
    const groupKey = String(task.movieId || key || "");
    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, { key, task });
      continue;
    }
    const currentRunning = isDownloadRunning(task);
    const existingRunning = isDownloadRunning(existing.task);
    const newer = String(task.updatedAt || "") >= String(existing.task.updatedAt || "");
    if ((currentRunning && !existingRunning) || (currentRunning === existingRunning && newer)) {
      grouped.set(groupKey, { key, task });
    }
  }
  return Object.fromEntries(Array.from(grouped.values()).map((item) => [item.key, item.task]));
}

function linkExtension(link) {
  const url = String(link || "").split("?")[0].toLowerCase();
  if (url.endsWith(".mp4")) return "mp4";
  if (url.endsWith(".m3u8")) return "m3u8";
  return "ts";
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) throw new Error("当前浏览器不支持离屏下载，请升级 Chrome 或 Edge");
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
    reasons: ["BLOBS"],
    justification: "用于把媒体分片和已验证 CRX 持久化到 OPFS，并安全组装成品"
  });
}

function looksPlayableLink(value) {
  const text = String(value || "").trim();
  return /(?:\.m3u8|\.mp4|\/m3u8\/|\/h5\/m3u8\/|\/vod\/|\/video\/|\/media\/|\/link\/)/i.test(text);
}

/**
 * 判断明确的播放字段是否已经返回内容。
 * VIP 线路可能是无扩展名签名地址；为避免误扣金币，只排除空值与常见占位值。
 */
function hasReturnedPlayLink(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return Boolean(text && !/^(?:null|undefined|false|none|nil|0|n|no|暂无|无|未购买|未解锁)$/i.test(text));
}

function collectPlayableLinks(value, bucket = [], trail = []) {
  // 详情对象里可能先出现封面、作者视频等媒体字段，16 条上限会让靠后的
  // lines/sourceList 完整线路永远进不了探测队列；64 条仍足够小，同时能覆盖真实响应。
  if (!value || bucket.length >= 64) return bucket;
  if (typeof value === "string") {
    const keyHint = trail.join(".").toLowerCase();
    const explicitPlaybackField = /play|backup|m3u8|mp4|video|media|source|src|link|file/.test(keyHint);
    const genericUrlField = /url/.test(keyHint);
    // 嵌套线路也可能是无扩展名签名地址；普通 url 字段仍要求具备明确视频特征，避免把封面当成线路。
    if ((explicitPlaybackField && hasReturnedPlayLink(value)) || (genericUrlField && looksPlayableLink(value))) {
      bucket.push({ key: keyHint, url: value.trim() });
    }
    return bucket;
  }
  if (Array.isArray(value)) {
    value.slice(0, 48).forEach((item, index) => collectPlayableLinks(item, bucket, [...trail, String(index)]));
    return bucket;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (bucket.length >= 64) break;
      collectPlayableLinks(item, bucket, [...trail, key]);
    }
  }
  return bucket;
}

function playbackCandidatePriority(key = "") {
  const hint = String(key || "").toLowerCase();
  let score = 0;
  if (/play[_-]?link|playurl|main|primary/.test(hint)) score += 120;
  if (/backup|second|spare|mirror|line/.test(hint)) score += 90;
  if (/m3u8|mp4|video|media|source|src|link|file/.test(hint)) score += 40;
  if (/preview|trailer|sample|clip|trial|试看|片段/.test(hint)) score -= 180;
  return score;
}

function collectPlaybackCandidates(detail = {}, summary = {}) {
  const rows = collectPlayableLinks({ ...detail, summary });
  const seen = new Set();
  return rows
    .map((row) => ({ ...row, priority: playbackCandidatePriority(row.key) }))
    .filter((row) => {
      const url = String(row.url || "").trim();
      if (!hasReturnedPlayLink(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .sort((left, right) => right.priority - left.priority);
}

function normalizeFullDetail(detail = null) {
  if (!detail || typeof detail !== "object") return detail;
  const links = collectPlayableLinks(detail);
  const directPlay = [
    detail.play_link,
    detail.playLink,
    detail.play_url,
    detail.playUrl,
    detail.m3u8,
    detail.m3u8_url,
    detail.m3u8Url,
    detail.video_url,
    detail.videoUrl,
    detail.media_url,
    detail.mediaUrl,
    looksPlayableLink(detail.url) ? detail.url : "",
    detail.src,
    detail.source,
    detail.file
  ].find(hasReturnedPlayLink);
  const directBackup = [
    detail.backup_link,
    detail.backupLink,
    detail.backup_url,
    detail.backupUrl,
    detail.second_play_link,
    detail.secondPlayLink
  ].find(hasReturnedPlayLink);
  // 必须先使用通过有效性判断的字段，不能让 "null" 等真值占位字符串覆盖其他真实线路。
  const playLink = directPlay || links.find((item) => /play|m3u8|mp4|video|media|source|src|url|link|file/.test(item.key))?.url || "";
  const backupLink = directBackup || links.find((item) => /backup|second|spare|mirror/.test(item.key))?.url || "";
  return {
    ...detail,
    play_link: playLink,
    backup_link: backupLink
  };
}

function normalizeFullDetailResponse(response = {}) {
  const detail = normalizeFullDetail(response.detail || response.data || null);
  if (!detail) return response;
  const summary = {
    ...(response.summary || {}),
    playLink: hasReturnedPlayLink(response.summary?.playLink) ? response.summary.playLink : detail.play_link || "",
    backupLink: hasReturnedPlayLink(response.summary?.backupLink) ? response.summary.backupLink : detail.backup_link || ""
  };
  return {
    ...response,
    detail,
    data: detail,
    summary
  };
}

function playableDetailReady(detail = null) {
  const normalized = normalizeFullDetail(detail);
  return Boolean(hasReturnedPlayLink(normalized?.play_link) || hasReturnedPlayLink(normalized?.backup_link));
}

function hasPotentialPlaybackEntitlement(detail = null) {
  if (!detail || typeof detail !== "object") return false;
  const keys = [
    "play_link", "playLink", "play_url", "playUrl", "m3u8", "m3u8_url", "m3u8Url",
    "video_url", "videoUrl", "media_url", "mediaUrl", "backup_link", "backupLink",
    "backup_url", "backupUrl", "second_play_link", "secondPlayLink", "url", "src", "source", "file"
  ];
  return keys.some((key) => hasReturnedPlayLink(detail[key])) || collectPlayableLinks(detail).length > 0;
}

function isLockedCoinVideo(detail = null) {
  const normalized = normalizeFullDetail(detail);
  // VIP 等账号可能在未标记购买时已直接返回播放地址；有地址就直接播放，严禁误扣金币。
  if (playableDetailReady(normalized) || hasPotentialPlaybackEntitlement(detail)) return false;
  return normalized?.has_buy !== "y" && normalized?.layer_type === "money" && Number(normalized?.money || 0) > 0;
}

/** 通过扩展后台按已保存的服务地址执行云端体检。 */
async function checkRemoteDiagnostics() {
  const state = await getStateInternal();
  const endpoints = ["/v1/diagnostics", "/v1/status", "/v1/health"];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const data = await remoteRequest(state, endpoint, { allowErrorPayload: true });
      const diagnostics = data?.diagnostics || data?.status?.diagnostics || null;
      return {
        ok: data?.ok !== false,
        endpoint,
        diagnostics,
        status: data?.status || data,
        baseUrl: normalizeRemoteConfig(state.remote).baseUrl
      };
    } catch (err) {
      lastError = err;
      // 鉴权或服务配置错误无需继续探测旧接口，直接向用户说明。
      if ([401, 403, 503].includes(Number(err?.status || 0))) break;
    }
  }
  throw lastError || new Error("云端服务体检失败");
}

function hlsDurations(text = "") {
  return [...String(text).matchAll(/#EXTINF:([0-9.]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

function sanitizeLedgerError(value = "") {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "[链接已脱敏]")
    .replace(/(token|authorization|cookie)\s*[:=]\s*\S+/gi, "$1=[已脱敏]")
    .slice(0, 180);
}

async function listPurchaseReconciliation() {
  let state = await expireStaleLocalLedger(await getStateInternal());
  const accountMap = new Map((state.accountPool || []).map((account) => [account.id, {
    id: account.id,
    label: account.label || account.username || "原购买账号",
    coin: accountCoinValue(account, 0)
  }]));
  const local = Object.values(state.localPurchaseLedger || {})
    .filter((attempt) => ["pending", "charged", "uncertain"].includes(String(attempt?.status || "")))
    .sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))
    .slice(0, 100)
    .map((attempt) => ({
      origin: "local",
      attemptId: String(attempt.attemptId || ""),
      requestId: String(attempt.requestId || ""),
      movieId: String(attempt.movieId || ""),
      status: String(attempt.status || ""),
      price: Number(attempt.price || 0),
      account: accountMap.get(attempt.accountId) || { id: attempt.accountId, label: "原购买账号" },
      error: sanitizeLedgerError(attempt.error),
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      canReconcile: ["charged", "uncertain"].includes(String(attempt.status || ""))
    }));
  let cloud = [];
  let cloudError = "";
  const remote = normalizeRemoteConfig(state.remote);
  if (remote.enabled && remote.baseUrl) {
    try {
      const response = await remoteRequest(state, "/v2/purchases/reconciliation", { method: "GET" });
      cloud = (response.items || []).map((attempt) => ({ ...attempt, origin: "cloud" }));
    } catch (error) {
      cloudError = error?.message || String(error);
    }
  }
  return { ok: !cloudError, items: [...cloud, ...local], cloudError, state: sanitizeState(state) };
}

async function reconcilePurchaseRecord(message = {}) {
  const attemptId = String(message.attemptId || "").trim();
  const origin = String(message.origin || "cloud");
  if (!attemptId) throw new Error("缺少对账 attemptId");
  const reconciliationId = String(message.reconciliationId || crypto.randomUUID());
  if (origin === "cloud") {
    const state = await getStateInternal();
    const response = await remoteRequest(state, "/v2/purchases/reconcile", {
      method: "POST",
      timeoutMs: 60_000,
      body: JSON.stringify({ attemptId, reconciliationId })
    });
    if (response.session && response.detail) {
      const account = (state.accountPool || []).find((item) => item.id === response.session.account?.id)
        || response.account
        || response.session.account;
      return finishPlaybackSession({
        movieId: response.session.movieId,
        movieTitle: response.session.title,
        detail: response.detail,
        account,
        suppliedSession: response.session,
        session: response.session,
        acquisition: response.session.acquisition
      });
    }
    return response;
  }
  const state = await expireStaleLocalLedger(await getStateInternal());
  const attempt = Object.values(state.localPurchaseLedger || {}).find((row) => row?.attemptId === attemptId);
  if (!attempt) throw new Error("本地对账记录不存在");
  if (!["charged", "uncertain"].includes(String(attempt.status || ""))) throw new Error("该记录当前不能执行对账");
  return reconcileLocalPurchase({
    movieId: attempt.movieId,
    movieTitle: message.movieTitle || "",
    requestId: reconciliationId,
    contextKey: `reconcile:${attemptId}`,
    bootstrapSession: message.bootstrapSession || null
  }, attempt, []);
}

function hlsVariantUrls(text = "", baseUrl = "") {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF")) continue;
    const candidate = lines.slice(index + 1).find((line) => line && !line.startsWith("#"));
    if (!candidate) continue;
    try {
      variants.push(new URL(candidate, baseUrl).href);
    } catch (_) {}
  }
  return [...new Set(variants)].slice(0, 4);
}

function buildM3u8Stat(url, response, text, latencyMs = 0) {
  const durations = hlsDurations(text);
  const segments = durations.length;
  const duration = Number(durations.reduce((sum, item) => sum + (Number.isFinite(item) ? item : 0), 0).toFixed(3));
  const status = Number(response?.status || 0);
  // 时长不再在十几分钟处过早饱和，避免短预览线凭低延迟压过完整版。
  let score = 100;
  if (status >= 200 && status < 400) score += 60;
  else if (status > 0) score -= 40;
  score += Math.min(120, segments / 3);
  score += Math.min(360, duration / 10);
  if (latencyMs > 0) score += Math.max(0, 50 - Math.min(50, latencyMs / 80));
  if (segments <= 0 && duration <= 0) score -= 20;
  return {
    url,
    status,
    segments,
    duration,
    latencyMs: Math.max(0, Math.round(latencyMs || 0)),
    score: Math.round(score),
    protocol: "hls",
    ok: status >= 200 && status < 400 && segments > 0
  };
}

async function fetchPlaybackProbe(url, signal) {
  const urlLooksHls = /m3u8|mpegurl/i.test(String(url || ""));
  const headers = {
    accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain, */*;q=0.1",
    // HLS 清单是文本，必须读取完整内容；Range 只用于未知格式/渐进式媒体，
    // 否则长视频的后半段会被误判为不存在。
    ...(urlLooksHls ? {} : { range: "bytes=0-524287" })
  };
  let response = await fetch(url, {
    ...(signal ? { signal } : {}),
    headers
  });
  if (!response.ok && urlLooksHls) {
    await response.body?.cancel().catch(() => {});
    response = await fetch(url, {
      ...(signal ? { signal } : {}),
      headers: { accept: headers.accept }
    });
  }
  if (urlLooksHls && (response.status === 206 || response.headers.get("content-range"))) {
    await response.body?.cancel().catch(() => {});
    response = await fetch(url, {
      ...(signal ? { signal } : {}),
      headers: { accept: headers.accept }
    });
  }
  let contentType = String(response.headers.get("content-type") || "").toLowerCase();
  let contentLength = Number(response.headers.get("content-length") || 0);
  const definitelyLargeBinary = /video\/(?:mp4|webm|quicktime)|application\/mp4/.test(contentType)
    || (response.status !== 206 && contentLength > 8 * 1024 * 1024 && !urlLooksHls && !/mpegurl/.test(contentType));
  if (definitelyLargeBinary) {
    await response.body?.cancel().catch(() => {});
    return { response, text: "", binaryBodySkipped: true };
  }
  let text = await response.text();
  const partialManifest = (response.status === 206 || response.headers.get("content-range"))
    && (/mpegurl/.test(contentType) || String(text).includes("#EXTM3U"));
  if (partialManifest) {
    // 签名地址不一定带 .m3u8。只有读取响应头/正文后才能知道它是 HLS；
    // 一旦确认是被 Range 截断的清单，必须无 Range 重取，否则长视频会稳定误报为前半段时长。
    response = await fetch(url, {
      ...(signal ? { signal } : {}),
      headers: { accept: headers.accept }
    });
    contentType = String(response.headers.get("content-type") || "").toLowerCase();
    contentLength = Number(response.headers.get("content-length") || 0);
    // 此分支只会在正文已经确认含 #EXTM3U 后进入；即使 CDN 错报
    // application/octet-stream，也不能再按“大二进制”丢弃完整清单。
    if (/video\/(?:mp4|webm|quicktime)|application\/mp4/.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      return { response, text: "" };
    }
    text = await response.text();
  }
  return { response, text, binaryBodySkipped: false };
}

async function statM3u8Quick(link, timeoutMs = 10000) {
  if (!link) return null;
  const url = absoluteUrl(link);
  const started = Date.now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { response, text, binaryBodySkipped } = await fetchPlaybackProbe(url, controller?.signal);
    const direct = buildM3u8Stat(url, response, text, Date.now() - started);
    if (!String(text).includes("#EXTM3U") || direct.duration > 0) {
      if (String(text).includes("#EXTM3U")) return direct;
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const progressiveByType = /^video\//.test(contentType) || /application\/(?:mp4|x-mp4|webm)/.test(contentType);
      const progressiveByBinary = /application\/(?:octet-stream|binary)/.test(contentType)
        && (binaryBodySkipped || response.status === 206 || /\.(?:mp4|webm|m4v)(?:[?#]|$)/i.test(url));
      const progressiveByUrl = !contentType && /\.(?:mp4|webm|m4v)(?:[?#]|$)/i.test(url);
      if (!response.ok || (!progressiveByType && !progressiveByBinary && !progressiveByUrl)) {
        return {
          ...direct,
          ok: false,
          error: `响应不是可播放媒体（${contentType || "unknown content-type"}）`,
          protocol: "unknown",
          segments: 0,
          duration: 0
        };
      }
      return { ...direct, ok: true, protocol: "progressive", segments: 0, duration: 0 };
    }
    const variants = hlsVariantUrls(text, url);
    const rows = await Promise.allSettled(variants.map(async (variantUrl) => {
      const variant = await fetchPlaybackProbe(variantUrl, controller?.signal);
      return buildM3u8Stat(variantUrl, variant.response, variant.text, Date.now() - started);
    }));
    const best = rows
      .filter((row) => row.status === "fulfilled")
      .map((row) => row.value)
      .sort((left, right) => right.duration - left.duration || right.segments - left.segments)[0];
    return best ? { ...best, url, resolvedPlaylistUrl: best.url, masterPlaylist: true } : direct;
  } catch (err) {
    return {
      url,
      error: err?.name === "AbortError" ? `timeout ${timeoutMs}ms` : err?.message || String(err),
      latencyMs: Date.now() - started,
      score: -800,
      ok: false
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolvePlaybackDetail(detail = {}, summary = {}, suppliedSession = null) {
  const candidateRows = collectPlaybackCandidates(detail, summary);
  for (const source of suppliedSession?.sources || []) {
    if (!source?.url || candidateRows.some((row) => row.url === source.url)) continue;
    candidateRows.push({
      key: `session.${source.id || "source"}`,
      url: source.url,
      priority: source.id === "primary" ? 120 : 90,
      declaredProtocol: source.protocol,
      declaredHealth: source.health
    });
  }
  const candidates = candidateRows.slice(0, 12).map((candidate) => ({
    ...candidate,
    url: absoluteUrl(candidate.url)
  })).filter((candidate) => candidate.url);
  const probed = await Promise.all(candidates.map(async (candidate) => ({
    ...candidate,
    stat: await statM3u8Quick(candidate.url)
  })));
  const confirmed = probed.filter((candidate) => (
    (candidate.stat?.ok === true && ["hls", "progressive"].includes(candidate.stat?.protocol))
    || (
      ["hls", "progressive"].includes(candidate.declaredProtocol)
      && ["healthy", "degraded", "probing"].includes(candidate.declaredHealth?.state)
    )
  ));
  if (!confirmed.length) {
    const error = playbackBusinessError("发现疑似播放权益字段，但响应不是可播放媒体", "PLAYBACK_SOURCE_UNCONFIRMED", 502);
    error.preventPurchase = true;
    throw error;
  }
  const ranked = [...confirmed].sort((left, right) => {
    const leftDuration = Number(left.stat?.duration || 0);
    const rightDuration = Number(right.stat?.duration || 0);
    if (leftDuration > 0 && rightDuration > 0 && leftDuration !== rightDuration) {
      const difference = Math.abs(leftDuration - rightDuration);
      if (difference >= Math.max(90, Math.min(leftDuration, rightDuration) * 0.08)) return rightDuration - leftDuration;
    }
    return (Number(right.stat?.score || 0) + Number(right.priority || 0))
      - (Number(left.stat?.score || 0) + Number(left.priority || 0));
  });
  // 统一把实际探测后最完整的线路提升为 play_link；字段名不能压过覆盖时长。
  const primary = ranked[0] || null;
  // backup 字段也可能只是第二条试看线。备用位应承载探测后最完整的不同线路，
  // 而不是无条件服从字段名；显式 backup 已通过 priority 参与同分排序。
  const backup = ranked.find((candidate) => candidate.url !== primary?.url) || null;
  const resolvedDetail = normalizeFullDetail({
    ...detail,
    play_link: primary?.url || detail?.play_link || "",
    backup_link: backup?.url || detail?.backup_link || ""
  });
  return {
    detail: resolvedDetail,
    summary: {
      ...summary,
      playLink: resolvedDetail.play_link,
      backupLink: resolvedDetail.backup_link,
      fullStat: primary?.stat || summary.fullStat || null,
      backupStat: backup?.stat || summary.backupStat || null
    }
  };
}

function resolveDownloadLink(detail = {}, summary = {}, message = {}, session = null) {
  const lineKey = String(message.lineKey || message.line || "auto").trim().toLowerCase();
  const preferredUrl = absoluteUrl(message.url || message.downloadUrl || "");
  if (preferredUrl) return { url: preferredUrl, lineKey: lineKey || "custom" };
  const sessionSources = Array.isArray(session?.sources) ? session.sources.filter((source) => source?.url) : [];
  const requestedSource = sessionSources.find((source) => source.id === String(message.sourceId || lineKey));
  const recommendedSource = sessionSources.find((source) => source.id === session?.decision?.recommendedSourceId);
  if (requestedSource) return { url: absoluteUrl(requestedSource.url), lineKey: requestedSource.id, source: requestedSource };
  if (lineKey === "auto" && recommendedSource) {
    return { url: absoluteUrl(recommendedSource.url), lineKey: recommendedSource.id, source: recommendedSource };
  }
  const play = absoluteUrl(detail.play_link || summary.playLink || "");
  const backup = absoluteUrl(detail.backup_link || summary.backupLink || "");
  if (lineKey === "play" || lineKey === "main" || lineKey === "primary") {
    return { url: play || backup, lineKey: "play" };
  }
  if (lineKey === "backup" || lineKey === "spare") {
    return { url: backup || play, lineKey: "backup" };
  }
  // auto：用探测分选择更好线路，不再写死主线优先。
  const fullStat = summary.fullStat || null;
  const backupStat = summary.backupStat || null;
  const recommended = recommendedPlaybackSource([
    { id: "primary", url: play, health: sourceHealthFromLegacy(fullStat) },
    { id: "backup", url: backup, health: sourceHealthFromLegacy(backupStat) }
  ].filter((source) => source.url));
  if (recommended?.id === "backup") return { url: backup, lineKey: "backup" };
  if (recommended?.id === "primary") return { url: play, lineKey: "play" };
  return { url: play || backup, lineKey: play ? "play" : backup ? "backup" : "auto" };
}

function playbackBusinessError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function confirmedBeforeChargeFailure(error) {
  if (error?.upstreamRejected !== true) return false;
  return /余额不足|金币不足|insufficient|not enough|视频.*下架|参数.*(?:错误|无效)|invalid parameter/i
    .test(error?.message || String(error));
}

function localLedgerBlockingEntry(state, movieId) {
  return Object.values(state.localPurchaseLedger || {})
    .filter((row) => String(row?.movieId) === String(movieId) && ["pending", "charged", "resolved", "uncertain"].includes(row?.status))
    .sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))[0] || null;
}

async function writeLocalLedger(movieId, accountId, patch) {
  const fresh = await getStateInternal();
  const entries = Object.entries(fresh.localPurchaseLedger || {});
  let key = "";
  let previous = {};
  if (patch.attemptId) {
    const hit = entries.find(([, row]) => row?.attemptId === patch.attemptId);
    if (hit) [key, previous] = hit;
  }
  if (!key && patch.status !== "pending") {
    const hit = entries
      .filter(([, row]) => String(row?.movieId) === String(movieId) && String(row?.accountId) === String(accountId))
      .sort((left, right) => Date.parse(right[1]?.updatedAt || "") - Date.parse(left[1]?.updatedAt || ""))[0];
    if (hit) [key, previous] = hit;
  }
  const attemptId = String(patch.attemptId || previous.attemptId || crypto.randomUUID());
  key ||= attemptId;
  const allowed = {
    pending: ["charged", "failed_before_charge", "uncertain"],
    charged: ["resolved", "uncertain"],
    uncertain: ["resolved", "uncertain"]
  };
  if (previous.status && patch.status !== previous.status && !(allowed[previous.status] || []).includes(patch.status)) {
    throw new Error(`非法本地购买账本迁移：${previous.status} → ${patch.status}`);
  }
  fresh.localPurchaseLedger = {
    ...(fresh.localPurchaseLedger || {}),
    [key]: {
      ...previous,
      ...patch,
      attemptId,
      movieId,
      accountId,
      createdAt: previous.createdAt || nowIso(),
      updatedAt: nowIso()
    }
  };
  await saveState(fresh);
  return fresh.localPurchaseLedger[key];
}

async function expireStaleLocalLedger(state, movieId = "") {
  let changed = false;
  const now = Date.now();
  const next = { ...(state.localPurchaseLedger || {}) };
  for (const [key, row] of Object.entries(next)) {
    if (row?.status !== "pending" || (movieId && String(row.movieId) !== String(movieId))) continue;
    const updatedAt = Date.parse(row.updatedAt || row.createdAt || "");
    if (!Number.isFinite(updatedAt) || now - updatedAt <= 90_000) continue;
    next[key] = {
      ...row,
      status: "uncertain",
      error: row.error || "pending 超过 90 秒，扣费结果需要原账号对账",
      updatedAt: nowIso()
    };
    changed = true;
  }
  if (changed) {
    state.localPurchaseLedger = next;
    await saveState(state);
  }
  return state;
}

async function ensurePlaybackSessionCompleteness(session = null) {
  const normalized = normalizeStoredPlaybackSession(session);
  if (!normalized || normalized.sources.length < 2) return normalized;
  const shouldProbe = normalized.sources.some((source) => (
    source.url
    && source.protocol !== "progressive"
    && Number(source.health?.duration || 0) <= 0
  ));
  if (!shouldProbe) return normalizeStoredPlaybackSession(normalized);

  const stats = await Promise.all(normalized.sources.map((source) => (
    source.protocol === "progressive" ? Promise.resolve(null) : statM3u8Quick(source.url)
  )));
  const sources = normalized.sources.map((source, index) => ({
    ...source,
    health: stats[index] ? sourceHealthFromLegacy(stats[index]) : source.health
  }));
  return normalizeStoredPlaybackSession({ ...normalized, sources });
}

function playbackRequestMatches(state, requestId = "", contextKey = "") {
  if (!requestId) return true;
  if (latestPlaybackRequest?.requestId && String(latestPlaybackRequest.requestId) !== String(requestId)) return false;
  if (latestPlaybackRequest?.contextKey && contextKey && String(latestPlaybackRequest.contextKey) !== String(contextKey)) return false;
  const current = state?.screening?.request || {};
  if (String(current.requestId || "") !== String(requestId)) return false;
  if (contextKey && current.contextKey && String(current.contextKey) !== String(contextKey)) return false;
  return true;
}

async function finishPlaybackSession(options = {}) {
  const {
    movieId,
    movieTitle,
    detail,
    account,
    acquisition,
    cacheKey = `${account?.id || "default"}:${movieId}`,
    session: suppliedSession = null,
    requestId = "",
    contextKey = ""
  } = options;
  const resolved = await resolvePlaybackDetail(detail || {}, options.summary || {}, suppliedSession);
  const normalizedDetail = normalizeFullDetail(resolved.detail) || {};
  const constructed = legacyDetailToPlaybackSession(normalizedDetail, resolved.summary, account, { movieId, movieTitle, acquisition });
  const mergedSources = suppliedSession
    ? [
      ...constructed.sources,
      ...(suppliedSession.sources || []).filter((source) => !["primary", "backup"].includes(String(source.id || "")))
    ]
    : constructed.sources;
  const baseSession = suppliedSession
    ? normalizeStoredPlaybackSession({ ...suppliedSession, sources: mergedSources })
    : constructed;
  const session = await ensurePlaybackSessionCompleteness(baseSession);
  if (!session) throw new Error("播放会话缺少有效线路");
  const summary = playbackSessionSummary(session, normalizedDetail);
  const fresh = await getStateInternal();
  const canCommit = playbackRequestMatches(fresh, requestId, contextKey);
  if (!canCommit) {
    // 旧请求仍可把结果返回给发起方，但绝不能覆盖当前页面的 active session、
    // 详情缓存或 screening 请求状态。
    return {
      ok: true,
      stale: true,
      session,
      detail: normalizedDetail,
      data: normalizedDetail,
      summary,
      account: account ? publicAccount(account) : null,
      state: sanitizeState(fresh)
    };
  }
  fresh.selectedFullAccountId = account?.id || fresh.selectedFullAccountId;
  fresh.screening = mergeScreeningSession(fresh.screening, session);
  fresh.fullDetails = upsertFullDetailList(fresh.fullDetails, summary);
  fresh.fullDetailCache = {
    ...(fresh.fullDetailCache || {}),
    [cacheKey]: {
      schemaVersion: 3,
      cachedAt: Date.now(),
      expiresAt: Date.parse(session.expiresAt || "") || Date.now() + 10 * 60 * 1000,
      detail: normalizedDetail,
      summary: { ...summary, session },
      account: account ? publicAccount(account) : null
    }
  };
  const entries = Object.entries(fresh.fullDetailCache);
  if (entries.length > 120) fresh.fullDetailCache = Object.fromEntries(entries.slice(-120));
  await saveState(fresh);
  return {
    ok: true,
    session,
    detail: normalizedDetail,
    data: normalizedDetail,
    summary,
    account: account ? publicAccount(account) : null,
    state: sanitizeState(fresh)
  };
}

async function reconcileLocalPurchase(message, blocking, errors) {
  const state = await getStateInternal();
  const account = (state.accountPool || []).find((item) => item.id === blocking.accountId);
  if (!account) throw playbackBusinessError("本地购买账本对应账号不存在，需要人工核对", "PURCHASE_RECONCILIATION_REQUIRED", 409);
  if (blocking.status === "pending") {
    throw playbackBusinessError("该视频正在解锁，请稍后重试", "PURCHASE_IN_PROGRESS", 409);
  }
  if (blocking.status === "resolved" && playableDetailReady(blocking.detail)) {
    return finishPlaybackSession({
      movieId: message.movieId,
      movieTitle: message.movieTitle,
      requestId: message.requestId,
      contextKey: message.contextKey,
      detail: normalizeFullDetail(blocking.detail),
      account,
      acquisition: {
        mode: "purchased",
        attempts: errors.length + 1,
        failed: errors,
        purchase: { status: "resolved", accountId: account.id, price: Number(blocking.price || 0) }
      }
    });
  }
  try {
    const verified = await updateAccountSession(account.id, message.bootstrapSession || message.session || null);
    const detail = normalizeFullDetail(await apiRequest("/movie/detail", { id: message.movieId }, verified.session));
    if (!playableDetailReady(detail)) throw new Error("原购买账号尚未返回可播放线路");
    const playbackResult = await finishPlaybackSession({
      movieId: message.movieId,
      movieTitle: message.movieTitle,
      requestId: message.requestId,
      contextKey: message.contextKey,
      detail,
      account,
      acquisition: {
        mode: "purchased",
        attempts: errors.length + 1,
        failed: errors,
        purchase: { status: "resolved", accountId: account.id, price: Number(blocking.price || 0) }
      }
    });
    if (blocking.status !== "resolved") {
      await writeLocalLedger(message.movieId, account.id, { attemptId: blocking.attemptId, status: "resolved", detail, error: "" });
    }
    return playbackResult;
  } catch (error) {
    if (blocking.status !== "resolved") {
      await writeLocalLedger(message.movieId, account.id, { attemptId: blocking.attemptId, status: "uncertain", error: error?.message || String(error) });
    }
    throw playbackBusinessError("该视频存在已扣费或待核对记录，已阻止再次购买", "PURCHASE_RECONCILIATION_REQUIRED", 409);
  }
}

async function createPlaybackSession(message = {}) {
  const movieId = String(message.movieId || message.id || "").trim();
  if (!movieId) throw playbackBusinessError("缺少视频编号 movieId", "MOVIE_ID_REQUIRED", 400);
  const requestId = String(message.requestId || crypto.randomUUID());
  const pageKey = String(message.pageKey || "");
  const pageEpoch = Number.isFinite(Number(message.pageEpoch)) ? Number(message.pageEpoch) : 0;
  const contextKey = String(message.contextKey || `${pageKey || "background"}#${pageEpoch}:${movieId}`);
  const requestContext = { requestId, contextKey };
  latestPlaybackRequest = { requestId, contextKey, movieId };
  const movieTitle = String(message.movieTitle || "");
  let state = await getStateInternal();
  state.screening = {
    ...normalizeScreeningState(state.screening, state.fullDetails),
    request: { phase: "resolving", requestId, movieId, pageKey, pageEpoch, contextKey, startedAt: nowIso(), error: "" }
  };
  await saveState(state);

  try {
    const remote = normalizeRemoteConfig(state.remote);
    const sourceMode = remote.accountSourceMode || "cloud";
    let remoteError = null;
    if (sourceMode !== "local" && remote.enabled && remote.baseUrl) {
      try {
        const response = await remoteRequest(state, "/v2/playback/session", {
          method: "POST",
          timeoutMs: 60000,
          body: JSON.stringify({
            movieId,
            movieTitle,
            requestId,
            forceRefresh: Boolean(message.forceRefresh),
            bootstrapSession: message.bootstrapSession || message.session || null
          })
        });
        if (!response?.session?.movieId || !Array.isArray(response.session.sources)) {
          throw new Error("云端 v2 播放接口返回结构不完整");
        }
        const fresh = await getStateInternal();
        if (response.state?.accountPool) fresh.accountPool = response.state.accountPool.map(normalizeAccount);
        if (response.state?.selectedFullAccountId) fresh.selectedFullAccountId = response.state.selectedFullAccountId;
        fresh.remote = { ...normalizeRemoteConfig(fresh.remote), lastFullDetailAt: nowIso(), lastError: "" };
        const account = response.account || response.session.account || null;
        return await finishPlaybackSession({
          movieId,
          movieTitle,
          ...requestContext,
          detail: normalizeFullDetail(response.detail || {}),
          account,
          suppliedSession: response.session,
          session: response.session
        });
      } catch (error) {
        remoteError = error;
        state = await getStateInternal();
        state.remote = { ...normalizeRemoteConfig(state.remote), lastError: error?.message || String(error) };
        await saveState(state);
        if (sourceMode !== "cloud-first" && !remote.fallbackLocal) throw error;
      }
    }

    state = await expireStaleLocalLedger(await getStateInternal(), movieId);
    const cached = Object.values(state.fullDetailCache || {}).find((row) => (
      row?.detail
      && String(row?.summary?.movieId || row?.summary?.session?.movieId || "") === movieId
      && playableDetailReady(row.detail)
      && Number(row.expiresAt || Number(row.cachedAt || 0) + 10 * 60 * 1000) > Date.now()
    ));
    if (cached) {
      const session = cached.summary?.session || legacyDetailToPlaybackSession(cached.detail, cached.summary, cached.account, {
        movieId,
        movieTitle,
        acquisition: { mode: "cache", attempts: 1 }
      });
      session.acquisition = { ...session.acquisition, mode: "cache" };
      return finishPlaybackSession({ movieId, movieTitle, ...requestContext, detail: cached.detail, account: cached.account, session });
    }

    const localAccounts = sortAccountsByCoin((state.accountPool || []).filter((item) => !isCloudAccount(item) && isHealthyAccount(item)));
    const selected = localAccounts.find((item) => item.id === (message.accountId || state.selectedFullAccountId));
    const candidates = selected ? [selected, ...localAccounts.filter((item) => item.id !== selected.id)] : localAccounts;
    if (!candidates.length) {
      const prefix = remoteError ? `远程账号池失败：${remoteError?.message || remoteError}；` : "";
      throw playbackBusinessError(`${prefix}本地账号池为空，无法获取播放详情`, "ACCOUNT_POOL_EMPTY", 409);
    }

    const errors = [];
    const lockedCandidates = [];
    let potentialEntitlementFound = false;
    for (const candidate of candidates) {
      try {
        const verified = await updateAccountSession(candidate.id, message.bootstrapSession || message.session || null);
        const latest = await getStateInternal();
        const account = latest.accountPool.find((item) => item.id === candidate.id) || candidate;
        const rawDetail = await apiRequest("/movie/detail", { id: movieId }, verified.session);
        const detail = normalizeFullDetail(rawDetail);
        if (isLockedCoinVideo(rawDetail)) {
          lockedCandidates.push({ account, session: verified.session, detail });
          continue;
        }
        if (!playableDetailReady(detail)) {
          potentialEntitlementFound ||= hasPotentialPlaybackEntitlement(rawDetail);
          throw new Error("发现疑似播放权益字段，但尚未确认可播放媒体");
        }
        return await finishPlaybackSession({
          movieId,
          movieTitle,
          ...requestContext,
          detail,
          account,
          acquisition: { mode: "direct", attempts: errors.length + 1, failed: errors }
        });
      } catch (error) {
        potentialEntitlementFound ||= error?.preventPurchase === true;
        errors.push({ accountId: candidate.id, label: candidate.label, stage: "detail", message: error?.message || String(error) });
      }
    }
    if (!lockedCandidates.length || potentialEntitlementFound) throw playbackBusinessError("所有本地账号均未取得可播放线路", "PLAYBACK_UNAVAILABLE", 502);

    state = await getStateInternal();
    const blocking = localLedgerBlockingEntry(state, movieId);
    if (blocking) return reconcileLocalPurchase({ ...message, movieId, movieTitle }, blocking, errors);
    if (localPurchaseLocks.has(movieId)) throw playbackBusinessError("该视频正在解锁，请稍后重试", "PURCHASE_IN_PROGRESS", 409);

    localPurchaseLocks.add(movieId);
    try {
      const afterLockState = await expireStaleLocalLedger(await getStateInternal(), movieId);
      const racedBlocking = localLedgerBlockingEntry(afterLockState, movieId);
      if (racedBlocking) return reconcileLocalPurchase({ ...message, movieId, movieTitle }, racedBlocking, errors);
      const ordered = lowestCoinRandomOrder(lockedCandidates.map((entry) => entry.account))
        .map((account) => lockedCandidates.find((entry) => entry.account.id === account.id))
        .filter(Boolean);
      for (const item of ordered) {
        const price = Number(item.detail?.money || 0);
        const attempt = await writeLocalLedger(movieId, item.account.id, { requestId, status: "pending", price, error: "" });
        try {
          await apiRequest("/movie/doBuy", { id: movieId }, item.session);
        } catch (error) {
          if (confirmedBeforeChargeFailure(error)) {
            errors.push({ accountId: item.account.id, label: item.account.label, stage: "buy_before_charge", message: error?.message || String(error) });
            await writeLocalLedger(movieId, item.account.id, { attemptId: attempt.attemptId, status: "failed_before_charge", error: error?.message || String(error) });
            continue;
          }
          await writeLocalLedger(movieId, item.account.id, { attemptId: attempt.attemptId, status: "uncertain", error: error?.message || String(error) });
          throw playbackBusinessError("购买请求结果不确定，已阻止再次扣费", "PURCHASE_RECONCILIATION_REQUIRED", 409);
        }
        await writeLocalLedger(movieId, item.account.id, { attemptId: attempt.attemptId, status: "charged", error: "" });
        let purchasedDetail;
        let playbackResult;
        try {
          purchasedDetail = normalizeFullDetail(await apiRequest("/movie/detail", { id: movieId }, item.session));
          if (isLockedCoinVideo(purchasedDetail) || !playableDetailReady(purchasedDetail)) throw new Error("扣费后尚未取得可播放线路");
          playbackResult = await finishPlaybackSession({
            movieId,
            movieTitle,
            ...requestContext,
            detail: purchasedDetail,
            account: item.account,
            acquisition: {
              mode: "purchased",
              attempts: candidates.length,
              failed: errors,
              purchase: { status: "resolved", accountId: item.account.id, price }
            }
          });
          await writeLocalLedger(movieId, item.account.id, { attemptId: attempt.attemptId, status: "resolved", detail: purchasedDetail, error: "" });
        } catch (error) {
          await writeLocalLedger(movieId, item.account.id, { attemptId: attempt.attemptId, status: "uncertain", error: error?.message || String(error) });
          throw playbackBusinessError("已完成扣费但详情需要核对，已阻止二次购买", "PURCHASE_RECONCILIATION_REQUIRED", 409);
        }
        // resolved 是终态；会话与账本都已确认后，后续不得回退为 uncertain。
        return playbackResult;
      }
      throw playbackBusinessError("没有本地账号能够完成视频解锁", "PLAYBACK_UNAVAILABLE", 502);
    } finally {
      localPurchaseLocks.delete(movieId);
    }
  } catch (error) {
    const fresh = await getStateInternal();
    if (!playbackRequestMatches(fresh, requestId, contextKey)) throw error;
    fresh.screening = {
      ...normalizeScreeningState(fresh.screening, fresh.fullDetails),
      request: { phase: "error", requestId, movieId, pageKey, pageEpoch, contextKey, error: error?.message || String(error), startedAt: fresh.screening?.request?.startedAt || nowIso() }
    };
    await saveState(fresh);
    throw error;
  }
}

// v1 兼容入口与下载流程都复用同一 v2 会话服务，不保留第二套购买逻辑。
async function getFullDetail(message = {}) {
  const result = await createPlaybackSession(message);
  return {
    ...result,
    summary: result.summary || playbackSessionSummary(result.session, result.detail),
    data: result.detail
  };
}

/** 同一 movieId 合并为一条最新记录，避免刷新/下载重复堆叠。 */
function upsertFullDetailList(list = [], summary = {}) {
  const movieId = String(summary?.movieId || "").trim();
  const prev = Array.isArray(list) ? list.slice() : [];
  if (!movieId) return [...prev, summary].slice(-80);
  const index = prev.findIndex((item) => String(item?.movieId || "").trim() === movieId);
  if (index >= 0) {
    const old = prev[index] || {};
    prev[index] = {
      ...old,
      ...summary,
      movieId,
      // 合并主备链接，防止后一次只带主线时冲掉备用。
      playLink: summary.playLink || old.playLink || "",
      backupLink: summary.backupLink || old.backupLink || "",
      fullStat: summary.fullStat || old.fullStat || null,
      backupStat: summary.backupStat || old.backupStat || null,
      movieTitle: summary.movieTitle || old.movieTitle || summary.title || old.title || "",
      title: summary.title || old.title || summary.movieTitle || old.movieTitle || ""
    };
    return prev.slice(-80);
  }
  return [...prev, summary].slice(-80);
}

async function prepareDownloadSource(message = {}) {
  const movieId = String(message.movieId || message.id || "").trim();
  if (!movieId) throw new Error("缺少视频编号 movieId");
  const full = await getFullDetail(message);
  const detail = normalizeFullDetail(full.detail || full.data || {});
  // 用最新探测结果参与选线，避免写死主线。
  const stateNow = await getStateInternal();
  const latestSummary = (stateNow.fullDetails || []).slice().reverse().find((item) => String(item?.movieId || "") === movieId) || full.summary || {};
  const summary = {
    ...(full.summary || {}),
    ...latestSummary,
    playLink: full.summary?.playLink || latestSummary.playLink || detail.play_link || "",
    backupLink: full.summary?.backupLink || latestSummary.backupLink || detail.backup_link || "",
    fullStat: latestSummary.fullStat || full.summary?.fullStat || null,
    backupStat: latestSummary.backupStat || full.summary?.backupStat || null
  };
  const picked = resolveDownloadLink(detail, summary, message, full.session);
  const link = picked.url || "";
  if (!link) throw new Error("播放详情没有返回可下载播放链接");
  const url = absoluteUrl(link);
  const lineKey = picked.lineKey || "auto";
  const ext = linkExtension(url);
  const title = displayMovieTitle(detail, summary, message.title || message.movieTitle || "");
  const titleSnippet = downloadTitleSnippet(title, movieId);
  const protocol = String(picked.source?.protocol || "");
  const mode = protocol === "progressive" || ext === "mp4" ? "progressive-opfs" : "hls-opfs";
  const filename = downloadFileName(movieId, String(message.container || "mp4") === "ts" ? "ts" : "mp4", title);
  const taskId = downloadTaskId(movieId);
  return {
    movieId,
    full,
    detail,
    summary,
    picked,
    url,
    lineKey,
    ext,
    title,
    titleSnippet,
    mode,
    filename,
    taskId
  };
}

async function planFullVideoDownload(message = {}) {
  const source = await prepareDownloadSource(message);
  await ensureOffscreenDocument();
  const result = await chrome.runtime.sendMessage({
    type: "offscreenPlanDownload",
    taskId: `${source.taskId}_plan`,
    movieId: source.movieId,
    url: source.url,
    mode: source.mode,
    networkMode: String(message.networkMode || "balanced"),
    qualityHeight: Number(message.qualityHeight || 0),
    viewportHeight: Number(message.viewportHeight || 720),
    durationSeconds: Number(source.picked.source?.media?.durationSeconds || 0)
  });
  if (result?.ok === false) throw new Error(result.error || "下载规划失败");
  return {
    ok: true,
    movieId: source.movieId,
    movieTitle: source.title,
    taskId: source.taskId,
    lineKey: source.lineKey,
    mode: source.mode,
    filename: source.filename,
    source: {
      id: source.picked.source?.id || source.lineKey,
      label: source.picked.source?.label || source.lineKey,
      protocol: source.picked.source?.protocol || (source.mode === "progressive-opfs" ? "progressive" : "hls"),
      media: source.picked.source?.media || null
    },
    sources: (source.full.session?.sources || []).filter((item) => item?.url).map((item) => ({
      id: item.id,
      label: item.label,
      role: item.role,
      protocol: item.protocol,
      health: item.health,
      media: item.media
    })),
    plan: result.plan
  };
}

async function persistDownloadTaskPatch(taskId, attemptId, patch) {
  const state = await getStateInternal();
  const current = state.downloadTasks?.[taskId];
  if (!current || (attemptId && String(current.attemptId || "") !== String(attemptId))) return null;
  state.downloadTasks = {
    ...(state.downloadTasks || {}),
    [taskId]: { ...current, ...patch, updatedAt: nowIso() }
  };
  await saveState(state);
  return state.downloadTasks[taskId];
}

async function markScheduledDownloadBlocked(task, error, pauseReason = "source-stale") {
  const reason = String(error?.message || error || "保存的片源已失效，请重新规划");
  const stage = pauseReason === "insufficient-storage" ? "paused" : "stale";
  await persistDownloadTaskPatch(task.taskId, task.attemptId, {
    stage,
    pauseReason,
    error: reason
  });
  await emitExperienceAlert({
    key: `download:${task.taskId}:${pauseReason}`,
    category: pauseReason === "insufficient-storage" ? "storage" : "download",
    level: "warning",
    title: pauseReason === "insufficient-storage" ? "下载空间不足" : "下载片源需要重新规划",
    detail: `${task.movieTitle || task.movieId || "视频"}：${reason}`
  });
}

/**
 * 调度器只消费任务内已经确认过的 URL；重新探测失败时进入 stale，绝不调用取源或购买接口。
 */
async function startStoredDownloadTask(rawTask = {}) {
  const taskId = String(rawTask.taskId || "");
  const attemptId = String(rawTask.attemptId || "");
  if (!taskId || !attemptId || downloadStartInFlight.has(taskId)) return { ok: false, ignored: true };
  downloadStartInFlight.add(taskId);
  try {
    const task = await persistDownloadTaskPatch(taskId, attemptId, { stage: "recovering", pauseReason: "", error: "" });
    if (!task) return { ok: false, ignored: true };
    await ensureOffscreenDocument();

    if (task.resumeRequested) {
      const resumed = await chrome.runtime.sendMessage({
        type: "offscreenResumeDownload",
        taskId,
        attemptId
      }).catch(() => ({ ok: false }));
      if (resumed?.ok !== false) {
        await persistDownloadTaskPatch(taskId, attemptId, { resumeRequested: false });
        return { ok: true, resumed: true };
      }
    }

    let planResult;
    try {
      planResult = await chrome.runtime.sendMessage({
        type: "offscreenPlanDownload",
        taskId: `${taskId}_scheduled_plan`,
        movieId: task.movieId,
        url: task.url,
        mode: task.mode,
        networkMode: task.networkMode || "balanced",
        qualityHeight: Number(task.qualityHeight || 0),
        viewportHeight: Number(task.viewportHeight || 720),
        durationSeconds: Number(task.plan?.durationSeconds || 0)
      });
    } catch (error) {
      await markScheduledDownloadBlocked(task, error, "source-stale");
      return { ok: false, stale: true };
    }
    if (planResult?.ok === false) {
      await markScheduledDownloadBlocked(task, planResult.error || "片源探测失败", "source-stale");
      return { ok: false, stale: true };
    }
    if (planResult?.plan?.blockedReason) {
      await markScheduledDownloadBlocked(task, planResult.plan.blockedReason, "insufficient-storage");
      return { ok: false, blocked: true };
    }
    await persistDownloadTaskPatch(taskId, attemptId, {
      plan: planResult.plan || task.plan || null,
      estimatedBytes: Number(planResult?.plan?.estimatedBytes || task.estimatedBytes || 0),
      resumeRequested: false
    });
    const startResult = await chrome.runtime.sendMessage({
      ...task,
      type: task.mode === "progressive-opfs" ? "offscreenDownloadProgressive" : "offscreenDownloadM3u8",
      sequence: Number(task.sequence || 0),
      estimatedBytes: Number(planResult?.plan?.estimatedBytes || task.estimatedBytes || 0)
    });
    if (startResult?.ok === false) {
      await markScheduledDownloadBlocked(task, startResult.error || "视频下载启动失败", "source-stale");
      return { ok: false, stale: true };
    }
    return { ok: true, started: true };
  } finally {
    downloadStartInFlight.delete(taskId);
  }
}

async function scheduleNextDownloadAlarm(state = null) {
  if (!chrome.alarms?.create) return;
  const current = state || await getStateInternal();
  const experience = await getExperienceInternal();
  const wakeAt = experienceCore.nextDownloadAlarmAt(
    current.downloadTasks || {},
    experience.downloadPolicy || {},
    Date.now()
  );
  await chrome.alarms.clear(DOWNLOAD_NEXT_ALARM).catch(() => false);
  if (wakeAt > Date.now()) chrome.alarms.create(DOWNLOAD_NEXT_ALARM, { when: Math.max(Date.now() + 1000, wakeAt) });
}

async function runDownloadScheduler() {
  if (!persistedDownloadsReconciled) await ensurePersistedDownloadsReconciled();
  const state = await getStateInternal();
  const experience = await getExperienceInternal();
  const due = experienceCore.selectDueDownloads(state.downloadTasks || {}, experience.downloadPolicy || {}, Date.now());
  await Promise.all(due.map((task) => startStoredDownloadTask(task)));
  await scheduleNextDownloadAlarm(await getStateInternal());
  return { ok: true, started: due.length };
}

function scheduleDownloadDispatch(delayMs = 120) {
  if (downloadDispatchTimer) clearTimeout(downloadDispatchTimer);
  downloadDispatchTimer = setTimeout(() => {
    downloadDispatchTimer = null;
    runDownloadScheduler().catch(() => {});
  }, Math.max(0, delayMs));
}

async function configureDownloadTask(message = {}) {
  const taskId = String(message.taskId || "");
  const state = await getStateInternal();
  const task = state.downloadTasks?.[taskId];
  if (!task) throw new Error("未找到下载任务");
  const notBefore = message.notBefore ? new Date(message.notBefore).toISOString() : "";
  state.downloadTasks = {
    ...(state.downloadTasks || {}),
    [taskId]: {
      ...task,
      priority: experienceCore.normalizePriority(message.priority),
      notBefore,
      updatedAt: nowIso()
    }
  };
  await saveState(state);
  await scheduleNextDownloadAlarm(state);
  scheduleDownloadDispatch(0);
  return { ok: true, state: sanitizeState(state) };
}

async function pauseDownloadQueue() {
  await mutateExperience((experience) => ({
    ...experience,
    downloadPolicy: { ...experience.downloadPolicy, queuePaused: true }
  }));
  const state = await getStateInternal();
  const active = Object.values(state.downloadTasks || {}).filter((task) => ["probing", "downloading", "recovering", "assembling"].includes(String(task.stage || "")));
  for (const task of active) {
    await controlDownloadTask(String(task.taskId || ""), "pause").catch(() => {});
    await persistDownloadTaskPatch(task.taskId, task.attemptId, { pauseReason: "queue-paused" });
  }
  return stateResponseWithExperience();
}

async function resumeDownloadQueue() {
  await mutateExperience((experience) => ({
    ...experience,
    downloadPolicy: { ...experience.downloadPolicy, queuePaused: false }
  }));
  const state = await getStateInternal();
  for (const [taskId, task] of Object.entries(state.downloadTasks || {})) {
    if (task.stage !== "paused" || task.pauseReason !== "queue-paused") continue;
    state.downloadTasks[taskId] = {
      ...task,
      stage: "queued",
      pauseReason: "",
      resumeRequested: true,
      updatedAt: nowIso()
    };
  }
  await saveState(state);
  scheduleDownloadDispatch(0);
  return stateResponseWithExperience();
}

function downloadTasksForStorageAudit(state) {
  return Object.values(state.downloadTasks || {}).map((task) => ({
    taskId: String(task.taskId || ""),
    attemptId: String(task.attemptId || ""),
    movieId: String(task.movieId || ""),
    filename: String(task.filename || ""),
    stage: String(task.stage || ""),
    container: String(task.container || task.format || ""),
    qualityHeight: Number(task.qualityHeight || 0)
  })).filter((task) => task.taskId && task.attemptId);
}

async function runStorageAudit({ allowAutoCleanup = true } = {}) {
  const state = await getStateInternal();
  await ensureOffscreenDocument();
  const result = await chrome.runtime.sendMessage({
    type: "offscreenAuditStorage",
    knownTasks: downloadTasksForStorageAudit(state)
  });
  if (result?.ok === false || !result?.audit) throw new Error(result?.error || "OPFS 存储扫描失败");
  await mutateExperience((experience) => ({ ...experience, storageAudit: result.audit }));
  if (result.audit.lowSpace) {
    await emitExperienceAlert({
      key: "storage:low-space",
      category: "storage",
      level: "warning",
      title: "收纳空间偏低",
      detail: "可用空间低于 1 GiB 或总配额的 15%，新任务会在空间不足时暂停。"
    });
  }
  const experience = await getExperienceInternal();
  if (allowAutoCleanup && experience.downloadPolicy?.autoCleanup) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const targets = result.audit.entries
      .filter((entry) => ["orphan", "residue"].includes(entry.category) && !entry.protected)
      .filter((entry) => (Date.parse(entry.updatedAt || "") || 0) < cutoff)
      .map((entry) => `${entry.taskId}:${entry.attemptId}`);
    if (targets.length) return cleanupOpfsStorage(targets, true);
  }
  return stateResponseWithExperience({ audit: result.audit });
}

async function cleanupOpfsStorage(targets = [], automatic = false) {
  const state = await getStateInternal();
  await ensureOffscreenDocument();
  const result = await chrome.runtime.sendMessage({
    type: "offscreenCleanupStorage",
    knownTasks: downloadTasksForStorageAudit(state),
    targets: Array.isArray(targets) ? targets.map(String) : []
  });
  if (result?.ok === false) throw new Error(result?.error || "OPFS 清理失败");
  const deletedKeys = new Set((result.deletedKeys || []).map(String));
  if (deletedKeys.size) {
    const deletedTaskIds = new Set((state.downloadDeletedTaskIds || []).map(String));
    for (const [taskId, task] of Object.entries(state.downloadTasks || {})) {
      if (!deletedKeys.has(`${taskId}:${task.attemptId}`)) continue;
      deletedTaskIds.add(taskId);
      delete state.downloadTasks[taskId];
      downloadProgressBuffer.delete(taskId);
      downloadObservedStage.delete(taskId);
      const timer = downloadProgressTimers.get(taskId);
      if (timer) clearTimeout(timer);
      downloadProgressTimers.delete(taskId);
    }
    state.downloadDeletedTaskIds = Array.from(deletedTaskIds).slice(-120);
    await saveState(state);
  }
  await mutateExperience((experience) => ({ ...experience, storageAudit: result.audit || null }));
  if (automatic && Number(result.deleted || 0) > 0) {
    await emitExperienceAlert({
      key: "storage:auto-cleanup",
      category: "storage",
      level: "success",
      title: "已完成安全空间整理",
      detail: `自动清理了 ${result.deleted} 组超过 7 天的孤儿或失败残留。`
    });
  }
  return stateResponseWithExperience({ deleted: Number(result.deleted || 0), audit: result.audit || null });
}

async function downloadFullVideo(message = {}) {
  const source = await prepareDownloadSource(message);
  const {
    movieId, summary, url, lineKey, title, titleSnippet, mode, filename, taskId
  } = source;
  const existingState = await getStateInternal();
  const existingTask = existingState.downloadTasks?.[taskId];
  if (isDownloadRunning(existingTask) || normalizeDownloadStage(existingTask?.stage) === "paused") {
    return {
      ok: true,
      reused: true,
      mode: existingTask.mode || mode,
      url: existingTask.url || url,
      filename: existingTask.filename || filename,
      taskId,
      lineKey: existingTask.lineKey || lineKey,
      summary,
      state: sanitizeState(existingState)
    };
  }
  await ensureOffscreenDocument();
  const planResult = await chrome.runtime.sendMessage({
    type: "offscreenPlanDownload",
    taskId: `${taskId}_plan`,
    movieId,
    url,
    mode,
    networkMode: String(message.networkMode || "balanced"),
    qualityHeight: Number(message.qualityHeight || 0),
    viewportHeight: Number(message.viewportHeight || 720),
    durationSeconds: Number(source.picked.source?.media?.durationSeconds || 0)
  });
  if (planResult?.ok === false) throw new Error(planResult.error || "下载规划失败");
  if (planResult?.plan?.blockedReason) throw new Error(planResult.plan.blockedReason);
  const requestedContainer = String(message.container || "mp4") === "ts" ? "ts" : "mp4";
  if (Array.isArray(planResult?.plan?.compatibleContainers) && !planResult.plan.compatibleContainers.includes(requestedContainer)) {
    throw new Error(`所选片源不支持 ${requestedContainer.toUpperCase()} 容器`);
  }
  if (existingTask?.attemptId) {
    await chrome.runtime.sendMessage({
      type: "offscreenDeleteDownloadTask",
      taskId,
      attemptId: existingTask.attemptId
    }).catch(() => {});
  }
  const attemptId = downloadAttemptId();
  const requestedNotBefore = Date.parse(String(message.notBefore || ""));
  const notBefore = Number.isFinite(requestedNotBefore) && requestedNotBefore > Date.now()
    ? new Date(requestedNotBefore).toISOString()
    : "";
  const queued = await getStateInternal();
  queued.downloadDeletedTaskIds = (queued.downloadDeletedTaskIds || []).filter((id) => id !== taskId);
  queued.downloadTasks = {
    ...(queued.downloadTasks || {}),
    [taskId]: {
      ...(queued.downloadTasks?.[taskId] || {}),
      taskId,
      movieId,
      movieTitle: title,
      titleSnippet,
      mode,
      attemptId,
      sequence: 0,
      stage: "queued",
      priority: experienceCore.normalizePriority(message.priority),
      notBefore,
      pauseReason: "",
      resumeRequested: false,
      current: 0,
      total: 0,
      percent: 0,
      bytes: 0,
      totalBytes: 0,
      speedBps: 0,
      lineKey,
      filename,
      url,
      container: requestedContainer,
      networkMode: String(message.networkMode || "balanced"),
      qualityHeight: Number(message.qualityHeight || 0),
      viewportHeight: Number(message.viewportHeight || 720),
      estimatedBytes: Number(planResult?.plan?.estimatedBytes || 0),
      plan: planResult.plan || null,
      objectReady: false,
      error: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  };
  await saveState(queued);
  await scheduleNextDownloadAlarm(queued);
  await runDownloadScheduler();
  const latest = await getStateInternal();
  return {
    ok: true,
    mode,
    queued: true,
    url,
    filename,
    taskId,
    attemptId,
    lineKey,
    plan: planResult.plan,
    summary,
    notBefore,
    state: sanitizeState(latest)
  };
}

async function applyDownloadProgress(message = {}) {
  const state = await getStateInternal();
  const taskId = String(message.taskId || "");
  if (!taskId) return { ok: true };
  if ((state.downloadDeletedTaskIds || []).includes(taskId)) return { ok: true, ignored: true };
  const existing = state.downloadTasks?.[taskId];
  // 进度只能更新后台已经创建的任务；未知任务一律忽略，避免清空后被离屏页重新写回。
  const validation = stateMutationCore.validateDownloadEvent(existing, message, state.downloadDeletedTaskIds || []);
  if (!validation.accepted) return { ok: true, ignored: true, reason: validation.reason };
  const attemptId = String(message.attemptId || "");
  const sequence = validation.sequence;
  const stage = validation.stage;
  state.downloadTasks = {
    ...(state.downloadTasks || {}),
    [taskId]: {
      ...existing,
      type: message.mode === "progressive-opfs" ? "offscreenDownloadProgressive" : "offscreenDownloadM3u8",
      taskId,
      attemptId,
      sequence,
      movieId: String(message.movieId || existing.movieId || ""),
      mode: String(message.mode || existing.mode || "hls-opfs"),
      stage,
      current: Math.max(Number(existing.current || 0), Number(message.current || 0)),
      total: Math.max(Number(existing.total || 0), Number(message.total || 0)),
      movieTitle: String(message.movieTitle || existing.movieTitle || ""),
      titleSnippet: String(message.titleSnippet || existing.titleSnippet || ""),
      filename: String(message.filename || existing.filename || ""),
      url: String(message.url || existing.url || ""),
      error: stage === "error" ? String(message.error || existing.error || "下载失败") : "",
      downloadId: message.downloadId || existing.downloadId || null,
      bytes: Math.max(Number(existing.bytes || 0), Number(message.bytes ?? 0)),
      totalBytes: Math.max(Number(existing.totalBytes || 0), Number(message.totalBytes ?? 0)),
      speedBps: Number(message.speedBps ?? existing.speedBps ?? 0),
      percent: Math.max(Number(existing.percent || 0), Number(message.percent ?? 0)),
      lineKey: String(message.lineKey || existing.lineKey || ""),
      objectReady: ["ready", "complete"].includes(stage) && Boolean(message.objectReady ?? true),
      saveVia: String(message.saveVia || existing.saveVia || ""),
      format: String(message.format || existing.format || ""),
      transmuxError: String(message.transmuxError || existing.transmuxError || ""),
      updatedAt: nowIso()
    }
  };
  const entries = Object.entries(state.downloadTasks);
  if (entries.length > 40) state.downloadTasks = Object.fromEntries(entries.slice(-40));
  state.downloadTasks = compactDownloadTasks(state.downloadTasks);
  await saveState(state);
  if (["paused", "ready", "complete", "cancelled", "stale", "error"].includes(stage)) {
    scheduleDownloadDispatch(150);
  }
  if (["ready", "complete"].includes(stage)) {
    emitExperienceAlert({
      key: `download:${taskId}:ready`,
      category: "download",
      level: "success",
      title: "视频已经收纳完成",
      detail: state.downloadTasks[taskId]?.movieTitle || state.downloadTasks[taskId]?.filename || taskId
    }).catch(() => {});
  } else if (stage === "error") {
    emitExperienceAlert({
      key: `download:${taskId}:error`,
      category: "download",
      level: "error",
      title: "下载任务失败",
      detail: state.downloadTasks[taskId]?.error || "请打开收纳篮查看详情"
    }).catch(() => {});
  }
  return { ok: true };
}

async function recordDownloadProgress(message = {}, force = false) {
  const taskId = String(message.taskId || "");
  if (!taskId) return { ok: true };
  const sequence = Number(message.sequence || 0);
  const buffered = downloadProgressBuffer.get(taskId);
  if (stateMutationCore.bufferedDownloadEventIsStale(buffered, message)) return { ok: true, ignored: true };
  const stage = normalizeDownloadStage(message.stage);
  const attemptId = String(message.attemptId || "");
  const stageChanged = stateMutationCore.downloadEventStageChanged(downloadObservedStage.get(taskId), { ...message, stage });
  const immediate = force || stageChanged || ["paused", "ready", "complete", "cancelled", "stale", "error"].includes(stage);
  if (immediate) {
    const result = await applyDownloadProgress({ ...message, stage });
    if (!result?.ignored) {
      const timer = downloadProgressTimers.get(taskId);
      if (timer) clearTimeout(timer);
      downloadProgressTimers.delete(taskId);
      downloadProgressBuffer.delete(taskId);
      downloadObservedStage.set(taskId, { attemptId, stage });
    }
    return result;
  }
  downloadProgressBuffer.set(taskId, { ...message, stage });
  downloadObservedStage.set(taskId, { attemptId, stage });
  if (!downloadProgressTimers.has(taskId)) {
    downloadProgressTimers.set(taskId, setTimeout(() => {
      downloadProgressTimers.delete(taskId);
      const latest = downloadProgressBuffer.get(taskId);
      downloadProgressBuffer.delete(taskId);
      if (latest) applyDownloadProgress(latest).catch(() => {});
    }, 1000));
  }
  return { ok: true, buffered: true };
}

function saveTokenStorageKey(token) {
  return `txzzSaveToken_${token}`;
}

function saveTokenStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

function saveTokenClaimant(sender = {}) {
  return String(sender.tab?.id ?? sender.documentId ?? "unknown");
}

function saveTokenClaimantTabId(sender = {}) {
  const tabId = Number(sender.tab?.id);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

async function saveTokenPreviousClaimIsActive(record = {}) {
  const tabId = Number(record.claimedTabId);
  if (!Number.isInteger(tabId) || tabId < 0 || !chrome.tabs?.get) {
    // 旧记录缺少 tab id 时无法安全证明领取者已离开，因此保持单标签阻断。
    return Boolean(record.claimedBy);
  }
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (_) {
    return false;
  }
}

async function createSavePageToken(payload) {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const record = {
    ...payload,
    token,
    status: "issued",
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
    claimedBy: "",
    claimedTabId: null
  };
  saveTokens.set(token, record);
  await saveTokenStorageArea().set({ [saveTokenStorageKey(token)]: record });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`save.html#token=${encodeURIComponent(token)}`), active: true });
  return record;
}

async function claimSavePageToken(token, sender = {}) {
  const claimTask = saveTokenMutationQueue.then(async () => {
    const key = saveTokenStorageKey(token);
    const stored = await saveTokenStorageArea().get(key);
    const record = saveTokens.get(token) || stored[key];
    if (!record || record.expiresAt <= Date.now()) {
      await saveTokenStorageArea().remove(key);
      saveTokens.delete(token);
      throw new Error("保存令牌不存在或已过期，请返回插件重新点击保存");
    }
    const claimant = saveTokenClaimant(sender);
    const previousClaimantActive = record.claimedBy && record.claimedBy !== claimant
      ? await saveTokenPreviousClaimIsActive(record)
      : false;
    if (!stateMutationCore.canTakeSaveTokenClaim(record, claimant, previousClaimantActive)) {
      throw new Error("该保存令牌已被另一个仍打开的标签领取");
    }
    const transferring = Boolean(record.claimedBy && record.claimedBy !== claimant);
    const claimed = {
      ...record,
      status: "claimed",
      claimedBy: claimant,
      claimedTabId: saveTokenClaimantTabId(sender),
      claimedAt: transferring ? Date.now() : record.claimedAt || Date.now()
    };
    saveTokens.set(token, claimed);
    await saveTokenStorageArea().set({ [key]: claimed });
    return {
      ok: true,
      token: claimed.token,
      kind: claimed.kind,
      taskId: claimed.taskId || "",
      attemptId: claimed.attemptId || "",
      artifact: claimed.artifact,
      expectedSize: Number(claimed.expectedSize || claimed.artifact?.bytes || 0),
      expectedSha256: String(claimed.expectedSha256 || ""),
      filename: String(claimed.filename || claimed.artifact?.filename || "")
    };
  });
  saveTokenMutationQueue = claimTask.catch(() => {});
  return claimTask;
}

async function completeSavePageToken(token, sender = {}, result = {}) {
  const completeTask = saveTokenMutationQueue.then(async () => {
    const key = saveTokenStorageKey(token);
    const stored = await saveTokenStorageArea().get(key);
    const record = saveTokens.get(token) || stored[key];
    if (!record || record.expiresAt <= Date.now()) throw new Error("保存令牌已失效，请返回插件重新打开保存页");
    if (record.claimedBy !== saveTokenClaimant(sender)) throw new Error("当前标签没有领取该保存令牌");
    if (result.saved !== true) throw new Error("浏览器尚未确认文件保存，保存票不会被核销");
    if (record.kind === "video" && record.taskId) {
      const state = await getStateInternal();
      const task = state.downloadTasks?.[record.taskId];
      if (task && task.attemptId === record.attemptId) {
        state.downloadTasks = {
          ...(state.downloadTasks || {}),
          [record.taskId]: {
            ...task,
            stage: "complete",
            saveVia: "extension-save-page",
            savedAt: nowIso(),
            updatedAt: nowIso()
          }
        };
        await saveState(state);
      }
    }
    if (record.kind === "crx" && record.completionResult) {
      await recordRepositoryArchiveDownload({
        ...record.completionResult,
        ok: true,
        downloadState: "submitted",
        downloadPhase: "submitted",
        downloadStatus: "已通过扩展安全保存页提交完整校验后的 CRX3",
        saveVia: "extension-save-page",
        downloadSubmittedAt: nowIso()
      });
    }
    // 业务状态成功落盘后才删除令牌；如果状态持久化失败，原标签仍可重试确认。
    saveTokens.delete(token);
    await saveTokenStorageArea().remove(key);
    return { ok: true, saved: Boolean(result.saved), kind: record.kind };
  });
  saveTokenMutationQueue = completeTask.catch(() => {});
  return completeTask;
}

async function saveDownloadToDevice(taskId = "") {
  const state = await getStateInternal();
  const task = state.downloadTasks?.[taskId];
  if (!task) throw new Error("未找到下载任务");
  if (task.stage === "error") throw new Error(task.error || "该任务失败，不能保存");
  if (task.stage !== "saving" && isDownloadRunning(task)) throw new Error("任务仍在下载或合并中，请等待显示可保存后再操作");
  if (!isDownloadReady(task) || !task.attemptId) throw new Error("下载成品尚未准备完成");
  await ensureOffscreenDocument();
  const result = await chrome.runtime.sendMessage({
    type: "offscreenGetDownloadArtifact",
    taskId,
    attemptId: task.attemptId
  });
  if (result?.ok === false) throw new Error(result.error || "下载成品不存在，请恢复或重试任务");
  await createSavePageToken({
    kind: "video",
    taskId,
    attemptId: task.attemptId,
    artifact: result.artifact,
    expectedSize: result.artifact?.bytes,
    filename: result.artifact?.filename
  });
  const fresh = await getStateInternal();
  const current = fresh.downloadTasks?.[taskId];
  if (current?.attemptId === task.attemptId) {
    fresh.downloadTasks = {
      ...(fresh.downloadTasks || {}),
      [taskId]: { ...current, stage: "saving", updatedAt: nowIso() }
    };
    await saveState(fresh);
  }
  return { ok: true, savePageOpened: true, state: sanitizeState(fresh) };
}

async function controlDownloadTask(taskId = "", action = "") {
  const state = await getStateInternal();
  const task = state.downloadTasks?.[taskId];
  if (!task) throw new Error("未找到下载任务");
  if (!task.attemptId) throw new Error("旧下载任务缺少恢复标识，请重新创建任务");
  if (action === "resume") {
    state.downloadTasks = {
      ...(state.downloadTasks || {}),
      [taskId]: {
        ...task,
        stage: "queued",
        pauseReason: "",
        resumeRequested: true,
        notBefore: "",
        updatedAt: nowIso()
      }
    };
    await saveState(state);
    scheduleDownloadDispatch(0);
    return { ok: true, action, queued: true, state: sanitizeState(state) };
  }
  if (action === "pause" && String(task.stage || "") === "queued") {
    state.downloadTasks = {
      ...(state.downloadTasks || {}),
      [taskId]: { ...task, stage: "paused", pauseReason: "manual", updatedAt: nowIso() }
    };
    await saveState(state);
    return { ok: true, action, state: sanitizeState(state) };
  }
  await ensureOffscreenDocument();
  const messageType = {
    pause: "offscreenPauseDownload",
    resume: "offscreenResumeDownload",
    cancel: "offscreenCancelDownload"
  }[action];
  if (!messageType) throw new Error(`未知下载控制动作：${action}`);
  let result = await chrome.runtime.sendMessage({
    type: messageType,
    taskId,
    attemptId: task.attemptId
  });
  if (result?.ok === false) throw new Error(result.error || `下载任务${action}失败`);
  const fresh = await getStateInternal();
  const current = fresh.downloadTasks?.[taskId];
  if (current?.attemptId === task.attemptId) {
    const stage = action === "pause" ? "paused" : "cancelled";
    fresh.downloadTasks = {
      ...(fresh.downloadTasks || {}),
      [taskId]: { ...current, stage, pauseReason: action === "pause" ? "manual" : "", updatedAt: nowIso() }
    };
    await saveState(fresh);
  }
  return { ok: true, action, state: sanitizeState(fresh) };
}

async function removeDownloadTask(taskId = "", movieId = "") {
  const state = await getStateInternal();
  const targetMovieId = String(movieId || state.downloadTasks?.[taskId]?.movieId || "");
  const deletedIds = new Set((state.downloadDeletedTaskIds || []).map(String));
  const deleting = [];
  for (const [key, task] of Object.entries(state.downloadTasks || {})) {
    if (key === taskId || (targetMovieId && String(task.movieId || "") === targetMovieId)) {
      deletedIds.add(key);
      deleting.push({ key, attemptId: String(task.attemptId || "") });
    }
  }
  if (deleting.length) {
    await ensureOffscreenDocument().catch(() => {});
    for (const item of deleting) {
      await chrome.runtime.sendMessage({
        type: "offscreenCancelDownload",
        taskId: item.key,
        attemptId: item.attemptId
      }).catch(() => {});
      await chrome.runtime.sendMessage({
        type: "offscreenDeleteDownloadTask",
        taskId: item.key,
        attemptId: item.attemptId
      }).catch(() => {});
      delete state.downloadTasks[item.key];
      downloadProgressBuffer.delete(item.key);
      downloadObservedStage.delete(item.key);
      const timer = downloadProgressTimers.get(item.key);
      if (timer) clearTimeout(timer);
      downloadProgressTimers.delete(item.key);
    }
  }
  state.downloadDeletedTaskIds = Array.from(deletedIds).slice(-120);
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

async function saveDownloadSnapshot(label = "") {
  const state = await getStateInternal();
  const tasks = Object.values(state.downloadTasks || {}).sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")));
  const snapshot = {
    id: `txzz_snapshot_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    label: String(label || `下载记录 ${new Date().toLocaleString("zh-CN", { hour12: false })}`),
    savedAt: nowIso(),
    total: tasks.length,
    running: tasks.filter((task) => isDownloadRunning(task)).length,
    completed: tasks.filter((task) => task.stage === "complete").length,
    failed: tasks.filter((task) => task.stage === "error").length,
    tasks: tasks.slice(-40).map((task) => ({
      taskId: String(task.taskId || ""),
      movieId: String(task.movieId || ""),
      mode: String(task.mode || ""),
      stage: String(task.stage || ""),
      current: Number(task.current || 0),
      total: Number(task.total || 0),
      filename: String(task.filename || ""),
      url: String(task.url || ""),
      error: String(task.error || ""),
      downloadId: task.downloadId || null,
      bytes: Number(task.bytes || 0),
      updatedAt: task.updatedAt || ""
    }))
  };
  state.downloadSnapshots = [...(Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots : []), snapshot].slice(-30);
  await saveState(state);
  return { ok: true, snapshot, state: sanitizeState(state) };
}

async function clearDownloadTasks() {
  const state = await getStateInternal();
  const tasks = Object.entries(state.downloadTasks || {});
  if (tasks.length) {
    await ensureOffscreenDocument().catch(() => {});
    for (const [taskId, task] of tasks) {
      await chrome.runtime.sendMessage({
        type: "offscreenCancelDownload",
        taskId,
        attemptId: String(task.attemptId || "")
      }).catch(() => {});
      await chrome.runtime.sendMessage({
        type: "offscreenDeleteDownloadTask",
        taskId,
        attemptId: String(task.attemptId || "")
      }).catch(() => {});
      downloadProgressBuffer.delete(taskId);
      downloadObservedStage.delete(taskId);
      const timer = downloadProgressTimers.get(taskId);
      if (timer) clearTimeout(timer);
      downloadProgressTimers.delete(taskId);
    }
  }
  state.downloadDeletedTaskIds = [
    ...(state.downloadDeletedTaskIds || []),
    ...tasks.map(([taskId]) => taskId)
  ].slice(-120);
  state.downloadTasks = {};
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

async function clearDownloadSnapshots() {
  const state = await getStateInternal();
  state.downloadSnapshots = [];
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

async function openDownloadFolder() {
  try {
    const recent = await chrome.downloads.search({ filenameRegex: "糖心志者", orderBy: ["-startTime"], limit: 1 });
    if (recent?.[0]?.id) {
      await chrome.downloads.show(recent[0].id);
      return { ok: true, opened: true, mode: "downloadItem" };
    }
  } catch (_) {}
  try {
    await chrome.downloads.showDefaultFolder();
    return { ok: true, opened: true, mode: "defaultFolder" };
  } catch (err) {
    throw new Error(`无法打开下载目录：${err?.message || String(err)}`);
  }
}

function compareVersions(a = "", b = "") {
  return updateCore.compareVersions(a, b);
}

function localExtensionVersion() {
  try {
    return chrome.runtime.getManifest()?.version || "";
  } catch (_) {
    return "";
  }
}

function uniqueTextList(values = []) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function safeHttpUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function distributionUrlWithoutQuery(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function exactAllowedDistributionUrl(value = "", allowed = []) {
  const original = safeHttpUrl(value);
  const normalized = distributionUrlWithoutQuery(original);
  if (!original || !normalized) return "";
  const allowedSet = new Set(allowed.map(distributionUrlWithoutQuery).filter(Boolean));
  return allowedSet.has(normalized) ? original : "";
}

/**
 * 不再按域名后缀宽泛信任；只允许固定 owner/repo/branch/path 的正式 CRX 镜像。
 * 查询参数仅用于防缓存，去除查询参数后的 URL 必须与内置白名单逐字一致。
 */
function safeUpdatePackageUrl(value = "") {
  return exactAllowedDistributionUrl(value, REPOSITORY_CONFIG.archiveUrls);
}

/** 更新清单同样固定到正式仓库的 main/update.json，拒绝同域其他仓库或路径。 */
function safeUpdateManifestUrl(value = "") {
  return exactAllowedDistributionUrl(value, REPOSITORY_CONFIG.updateManifestUrls);
}

function validExtensionVersion(value = "") {
  return /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(String(value || "").trim());
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("签名清单包含非有限数字");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`签名清单包含不支持的值类型：${typeof value}`);
}

function updateManifestSigningText(raw = {}) {
  const { signature: _signature, ...unsignedManifest } = raw;
  return canonicalJson(unsignedManifest);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function extensionIdFromPublicKeyBytes(publicKeyBytes) {
  return crypto.subtle.digest("SHA-256", publicKeyBytes).then((digest) => {
    const prefix = new Uint8Array(digest).subarray(0, 16);
    let id = "";
    for (const byte of prefix) {
      id += String.fromCharCode(97 + (byte >> 4));
      id += String.fromCharCode(97 + (byte & 0x0f));
    }
    return id;
  });
}

function getUpdateVerificationKey() {
  if (!updateVerificationKeyPromise) {
    updateVerificationKeyPromise = crypto.subtle.importKey(
      "spki",
      fromBase64(UPDATE_PUBLIC_KEY_SPKI_BASE64),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  }
  return updateVerificationKeyPromise;
}

async function verifySignedUpdateManifest(raw = {}) {
  if (Number(raw.schema || 0) !== UPDATE_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`清单 schema 必须为 ${UPDATE_MANIFEST_SCHEMA_VERSION}`);
  }
  const signature = raw.signature || {};
  if (signature.algorithm !== UPDATE_SIGNATURE_ALGORITHM || signature.keyId !== UPDATE_PUBLIC_KEY_ID) {
    throw new Error("清单签名算法或公钥标识不受信任");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(String(signature.value || ""))) {
    throw new Error("清单签名编码无效");
  }
  let signatureBytes;
  try {
    signatureBytes = fromBase64(signature.value);
  } catch (_) {
    throw new Error("清单签名不是合法 Base64");
  }
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await getUpdateVerificationKey(),
    signatureBytes,
    enc.encode(updateManifestSigningText(raw))
  );
  if (!verified) throw new Error("清单签名验证失败，内容可能被篡改");
  return true;
}

function appendUrlCacheBuster(url = "", key = "txzz_download") {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return "";
  try {
    const parsed = new URL(safeUrl);
    parsed.searchParams.set(key, `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    return parsed.href;
  } catch (_) {
    return safeUrl;
  }
}

function compareBuilds(a = "", b = "") {
  return updateCore.compareBuilds(a, b);
}

function normalizeRemoteUpdateManifest(raw = {}) {
  const changelog = Array.isArray(raw.changelog) ? raw.changelog : [];
  const latest = changelog[0] || {};
  const version = String(raw.version || "").trim();
  const build = String(raw.build || "").trim();
  const rawCandidates = [
    raw.downloadUrl,
    raw.archiveUrl,
    ...(Array.isArray(raw.downloadCandidates) ? raw.downloadCandidates : []),
    ...(Array.isArray(raw.archiveUrls) ? raw.archiveUrls : []),
    ...(Array.isArray(raw.assets) ? raw.assets.map((item) => item?.downloadUrl || item?.url) : [])
  ];
  const downloadCandidates = uniqueTextList(rawCandidates.map(safeUpdatePackageUrl));
  const packageFormat = String(raw.packageFormat || "crx").toLowerCase();
  return {
    schema: Number(raw.schema || 0),
    name: String(raw.name || "糖心志者"),
    version,
    build,
    releasedAt: String(raw.releasedAt || ""),
    homepage: String(raw.homepage || REPOSITORY_CONFIG.url),
    downloadUrl: downloadCandidates[0] || "",
    archiveUrl: downloadCandidates[0] || "",
    downloadCandidates,
    packageFormat,
    extensionId: String(raw.extensionId || "").trim(),
    packageSize: Number(raw.packageSize || 0),
    packageSha256: String(raw.packageSha256 || "").trim().toLowerCase(),
    signature: raw.signature && typeof raw.signature === "object"
      ? {
          algorithm: String(raw.signature.algorithm || ""),
          keyId: String(raw.signature.keyId || ""),
          value: String(raw.signature.value || "").trim()
        }
      : null,
    changelog,
    latest,
    id: [version, build, latest.id || latest.title || ""].filter(Boolean).join("|")
  };
}

function currentArchiveUrl(remoteManifest = {}) {
  return safeUpdatePackageUrl(remoteManifest.archiveUrl)
    || safeUpdatePackageUrl(remoteManifest.downloadUrl)
    || safeUpdatePackageUrl(REPOSITORY_CONFIG.archiveUrls[0])
    || `https://github.com/${REPOSITORY_CONFIG.owner}/${REPOSITORY_CONFIG.repo}/raw/main/releases/${REPOSITORY_CONFIG.crxFileName || "tangxin-zhizhe-latest.crx"}`;
}

function githubArchiveFallbackCandidates() {
  const file = REPOSITORY_CONFIG.crxFileName || "tangxin-zhizhe-latest.crx";
  const owner = REPOSITORY_CONFIG.owner;
  const repo = REPOSITORY_CONFIG.repo;
  return [
    `https://github.com/${owner}/${repo}/raw/main/releases/${file}`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/releases/${file}`,
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/releases/${file}`,
    `https://fastly.jsdelivr.net/gh/${owner}/${repo}@main/releases/${file}`,
    `https://ghproxy.net/https://raw.githubusercontent.com/${owner}/${repo}/main/releases/${file}`,
    ...REPOSITORY_CONFIG.archiveUrls
  ];
}

async function readResponseBytesWithLimit(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`安装包超过允许大小 ${maxBytes} 字节`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value || new Uint8Array();
      total += chunk.length;
      if (total > maxBytes) throw new Error(`安装包超过签名清单声明的 ${maxBytes} 字节`);
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function readProtobufVarint(bytes, start) {
  let value = 0;
  let multiplier = 1;
  let offset = start;
  for (let count = 0; count < 8; count += 1) {
    if (offset >= bytes.length) throw new Error("CRX3 Protobuf varint 越界");
    const byte = bytes[offset++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, offset };
    multiplier *= 128;
  }
  throw new Error("CRX3 Protobuf varint 过长");
}

function protobufLengthFields(bytes) {
  const fields = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readProtobufVarint(bytes, offset);
    offset = tag.offset;
    const field = Math.floor(tag.value / 8);
    const wireType = tag.value & 7;
    if (!field) throw new Error("CRX3 Protobuf 字段编号无效");
    if (wireType === 2) {
      const lengthValue = readProtobufVarint(bytes, offset);
      offset = lengthValue.offset;
      const end = offset + lengthValue.value;
      if (end > bytes.length) throw new Error("CRX3 Protobuf 字段长度越界");
      const values = fields.get(field) || [];
      values.push(bytes.subarray(offset, end));
      fields.set(field, values);
      offset = end;
    } else if (wireType === 0) {
      offset = readProtobufVarint(bytes, offset).offset;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      throw new Error(`CRX3 Protobuf wire type ${wireType} 不受支持`);
    }
    if (offset > bytes.length) throw new Error("CRX3 Protobuf 字段越界");
  }
  return fields;
}

function concatByteParts(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function uint32LittleEndian(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

/** 验证 CRX3 结构、ZIP 起点、内嵌公钥、正式扩展 ID 及 CRX 自身 RSA 签名。 */
async function verifyCrx3Package(bytes) {
  if (bytes.length < 16 || dec.decode(bytes.subarray(0, 4)) !== "Cr24") {
    throw new Error("文件头不是 CRX");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const crxVersion = view.getUint32(4, true);
  if (crxVersion !== 3) throw new Error(`正式安装包必须为 CRX3，当前为 CRX${crxVersion}`);
  const headerLength = view.getUint32(8, true);
  const zipOffset = 12 + headerLength;
  if (!headerLength || zipOffset + 4 > bytes.length) throw new Error("CRX3 签名头长度超出文件大小");
  const zipMagic = bytes.subarray(zipOffset, zipOffset + 4);
  if (!(zipMagic[0] === 0x50 && zipMagic[1] === 0x4b && zipMagic[2] === 0x03 && zipMagic[3] === 0x04)) {
    throw new Error("CRX3 签名头后没有 ZIP 本地文件头");
  }

  const headerFields = protobufLengthFields(bytes.subarray(12, zipOffset));
  const proofBytes = headerFields.get(2)?.[0];
  const signedHeaderData = headerFields.get(10000)?.[0];
  if (!proofBytes || !signedHeaderData) throw new Error("CRX3 缺少 RSA proof 或 signed_header_data");
  const proofFields = protobufLengthFields(proofBytes);
  const publicKey = proofFields.get(1)?.[0];
  const signature = proofFields.get(2)?.[0];
  const crxId = protobufLengthFields(signedHeaderData).get(1)?.[0];
  if (!publicKey || !signature || !crxId || crxId.length !== 16) throw new Error("CRX3 身份签名字段不完整");

  const pinnedPublicKey = fromBase64(UPDATE_PUBLIC_KEY_SPKI_BASE64);
  if (!bytesEqual(publicKey, pinnedPublicKey)) throw new Error("CRX3 内嵌公钥不是正式发布公钥");
  const derivedExtensionId = await extensionIdFromPublicKeyBytes(publicKey);
  if (derivedExtensionId !== EXPECTED_EXTENSION_ID) throw new Error("CRX3 扩展 ID 与正式 ID 不一致");
  const expectedCrxId = new Uint8Array(await crypto.subtle.digest("SHA-256", publicKey)).subarray(0, 16);
  if (!bytesEqual(crxId, expectedCrxId)) throw new Error("CRX3 signed_header_data 中的扩展 ID 不一致");

  const signedBytes = concatByteParts([
    enc.encode("CRX3 SignedData\0"),
    uint32LittleEndian(signedHeaderData.length),
    signedHeaderData,
    bytes.subarray(zipOffset)
  ]);
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await getUpdateVerificationKey(),
    signature,
    signedBytes
  );
  if (!signatureValid) throw new Error("CRX3 安装包自身签名验证失败");
  return { crxVersion, headerSize: zipOffset, zipOffset, extensionId: derivedExtensionId };
}

/**
 * 只发起一次完整请求：同一份内存字节依次校验大小、SHA-256、CRX3 结构和签名，
 * 随后由调用方把这份已验证字节提交下载，避免 Range 探测与真实下载之间的 TOCTOU。
 */
async function fetchAndVerifyRepositoryPackage(url, manifest, timeoutMs = REPOSITORY_CONFIG.packageDownloadTimeoutMs) {
  const safeUrl = safeUpdatePackageUrl(url);
  if (!safeUrl) throw new Error("不是固定仓库路径下的 HTTPS 更新地址");
  const expectedSize = Number(manifest?.packageSize || 0);
  const expectedSha256 = String(manifest?.packageSha256 || "").toLowerCase();
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > REPOSITORY_CONFIG.maxPackageBytes) {
    throw new Error("签名清单中的安装包大小无效");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("签名清单中的安装包 SHA-256 无效");
  if (manifest?.extensionId !== EXPECTED_EXTENSION_ID) throw new Error("签名清单中的扩展 ID 不正确");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(safeUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/x-chrome-extension, application/octet-stream" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = safeUpdatePackageUrl(response.url);
    if (!finalUrl) throw new Error("安装包被重定向到非固定仓库路径");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength && declaredLength !== expectedSize) {
      throw new Error(`响应大小 ${declaredLength} 与签名清单 ${expectedSize} 不一致`);
    }
    const bytes = await readResponseBytesWithLimit(response, expectedSize);
    if (bytes.length !== expectedSize) throw new Error(`实际大小 ${bytes.length} 与签名清单 ${expectedSize} 不一致`);
    const actualSha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    if (actualSha256 !== expectedSha256) throw new Error("安装包 SHA-256 与签名清单不一致");
    const crx = await verifyCrx3Package(bytes);
    return {
      bytes,
      packageProbe: {
        ok: true,
        format: "crx",
        crxVersion: crx.crxVersion,
        headerSize: crx.headerSize,
        zipOffset: crx.zipOffset,
        extensionId: crx.extensionId,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        contentLength: bytes.length,
        totalSize: bytes.length,
        bytesChecked: bytes.length,
        sha256: actualSha256,
        finalUrl,
        verifiedAt: nowIso()
      }
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("完整安装包下载或校验超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// 统一生成最新版安装包候选地址，远程清单优先，固定 GitHub 地址兜底。
function repositoryArchiveCandidates(remoteManifest = {}) {
  const hasSignedPackageIdentity = remoteManifest.extensionId === EXPECTED_EXTENSION_ID
    && Number.isSafeInteger(Number(remoteManifest.packageSize))
    && Number(remoteManifest.packageSize) > 0
    && /^[a-f0-9]{64}$/.test(String(remoteManifest.packageSha256 || ""));
  if (!hasSignedPackageIdentity) return [];
  return uniqueTextList([
    remoteManifest.archiveUrl,
    remoteManifest.downloadUrl,
    ...(Array.isArray(remoteManifest.downloadCandidates) ? remoteManifest.downloadCandidates : []),
    ...githubArchiveFallbackCandidates()
  ].map(safeUpdatePackageUrl));
}

function repositoryDownloadAttempts(remoteManifest = {}) {
  // 实际提交下载时追加时间戳，降低浏览器或代理缓存拿到旧压缩包的概率。
  return uniqueTextList(repositoryArchiveCandidates(remoteManifest).map((url) => appendUrlCacheBuster(url)));
}

function normalizeChangelogItems(list = []) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 12).map((item, index) => ({
    id: String(item?.id || item?.title || `log-${index}`),
    type: String(item?.type || "更新").replace(/[【】]/g, ""),
    title: String(item?.title || item?.text || "更新记录"),
    detail: String(item?.detail || item?.notes || item?.line || ""),
    notes: String(item?.notes || ""),
    line: String(item?.line || ""),
    releasedAt: String(item?.releasedAt || item?.time || "")
  }));
}

function manifestSourceHost(url = "") {
  try {
    return new URL(String(url || "").split("?")[0]).hostname || "";
  } catch (_) {
    return "";
  }
}

/** 同 version/build 时优先可信源（raw 最新），jsDelivr 缓存风险最高排最后。 */
function manifestSourcePriority(url = "") {
  const host = manifestSourceHost(url).toLowerCase();
  if (host === "raw.githubusercontent.com") return 100;
  if (host.includes("gitmirror")) return 90;
  if (host.includes("ghproxy")) return 80;
  if (host.includes("jsdmirror")) return 45;
  if (host.includes("jsdelivr")) return 40;
  return 50;
}

/** 比较两份清单新鲜度：version 优先，其次 build，再比源可信度。返回值 >0 表示 a 更新。 */
function compareManifestFreshness(a = {}, b = {}) {
  const versionDiff = compareVersions(String(a.version || ""), String(b.version || ""));
  if (versionDiff !== 0) return versionDiff;
  const buildDiff = compareBuilds(String(a.build || ""), String(b.build || ""));
  if (buildDiff !== 0) return buildDiff;
  return manifestSourcePriority(a.manifestUrl || a.manifestFetchUrl) - manifestSourcePriority(b.manifestUrl || b.manifestFetchUrl);
}

function buildRepositoryUpdateResult(remoteManifest = {}, options = {}) {
  const localVersion = localExtensionVersion();
  const localBuild = LOCAL_UPDATE_BUILD;
  const versionUpdate = shouldUpdateByManifest(remoteManifest, localVersion, localBuild);
  const updateAvailable = versionUpdate;
  const updateId = remoteManifest.id || `${remoteManifest.version}|${remoteManifest.build}`;
  const reminderDismissed = Boolean(updateAvailable && options.dismissedId && options.dismissedId === updateId);
  const latest = remoteManifest.latest || {};
  const downloadCandidates = repositoryArchiveCandidates(remoteManifest);
  const downloadUrl = downloadCandidates[0] || currentArchiveUrl(remoteManifest);
  const changelog = normalizeChangelogItems(remoteManifest.changelog || []);
  const probe = remoteManifest.probe || options.probe || null;
  const compareHint = versionUpdate
    ? `远程 v${remoteManifest.version}/${remoteManifest.build} 新于本地 v${localVersion}/${localBuild}`
    : `本地 v${localVersion}/${localBuild} · 远程 v${remoteManifest.version || "?"}/${remoteManifest.build || "?"}`;
  const probeLabel = probe
    ? `多源最新 ${probe.pickedHost || "update.json"}（${probe.okCount || 0}/${probe.totalCount || 0} 源成功）`
    : (options.manifestSourceLabel || "update.json");
  const remote = {
    id: updateId,
    line: `${remoteManifest.releasedAt || remoteManifest.build} 【${latest.type || "更新"}】${latest.title || "发现新版本"}`,
    time: remoteManifest.releasedAt || "",
    type: `【${latest.type || "更新"}】`,
    text: latest.detail || latest.title || "远程版本清单已发布新版本。",
    title: latest.title || (updateAvailable ? "发现新版本" : "当前已是最新版本"),
    detail: latest.detail || latest.title || (updateAvailable
      ? `远程已发布新版本（${compareHint}），建议下载并重新加载扩展。`
      : `当前已是最新（${compareHint}），可继续使用。`),
    version: remoteManifest.version,
    build: remoteManifest.build,
    releasedAt: remoteManifest.releasedAt,
    archiveUrl: downloadUrl,
    downloadCandidates,
    detectionSource: probeLabel,
    compareHint,
    probeSummary: probe?.summary || "",
    probeSources: Array.isArray(probe?.sources) ? probe.sources : [],
    changelog
  };
  const status = updateAvailable ? "available" : "latest";
  return {
    ok: true,
    source: "signed-update.json",
    checkedAt: nowIso(),
    checkMode: options.cacheHit ? "成功缓存" : options.realtime ? "实时检测" : "自动检测",
    checkPhase: options.cacheHit ? "cached" : "success",
    downloadPhase: "idle",
    cacheHit: Boolean(options.cacheHit),
    cacheAgeMs: Number(options.cacheAgeMs || 0),
    status,
    updateAvailable,
    shouldNotify: Boolean(updateAvailable && !reminderDismissed),
    reminderDismissed,
    repositoryUrl: remoteManifest.homepage || REPOSITORY_CONFIG.url,
    manifestUrl: options.manifestUrl || remoteManifest.manifestUrl || REPOSITORY_CONFIG.updateManifestUrl,
    downloadUrl,
    downloadCandidates,
    local: { version: localVersion, build: localBuild },
    remote,
    updateManifest: remoteManifest,
    compareHint,
    probe,
    updateSystem: {
      schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
      engine: "upgrade-system-v8",
      cacheTtlMs: REPOSITORY_CONFIG.checkIntervalMs,
      ignoredLegacyCache: Boolean(options.ignoredLegacyCache),
      cachePolicy: "升级系统 v8：成功缓存绑定本地版本与构建指纹；自动检测复用同版本短时缓存，手动检测实时绕过。",
      downloadPolicy: "固定公钥验证清单；完整下载同一份 CRX3 后校验大小、SHA-256、扩展 ID 与包签名，再提交该内存字节。",
      packageFormat: REPOSITORY_CONFIG.packageFormat || "crx",
      mirrorCount: (REPOSITORY_CONFIG.updateManifestUrls || []).length
    },
    ...(options.extra || {})
  };
}

function updateManifestCandidateUrls(options = {}) {
  const shouldBypassCache = options.force || options.realtime || options.noCache !== false;
  const baseList = uniqueTextList([
    ...(Array.isArray(REPOSITORY_CONFIG.updateManifestUrls) ? REPOSITORY_CONFIG.updateManifestUrls : []),
    REPOSITORY_CONFIG.updateManifestUrl
  ]);
  if (!shouldBypassCache) return baseList;
  // 注意：jsDelivr 对 query 防缓存几乎无效，真正靠「多源取最新」；query 只对 raw/代理有帮助。
  return baseList.map((base) => {
    const lower = base.toLowerCase();
    if (lower.includes("jsdelivr.net") || lower.includes("jsdmirror.com")) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}txzz_update=${Date.now()}_${Math.random().toString(16).slice(2)}`;
  });
}

async function fetchOneUpdateManifest(url, timeoutMs = REPOSITORY_CONFIG.timeoutMs) {
  const safeManifestUrl = safeUpdateManifestUrl(url);
  if (!safeManifestUrl) throw new Error("不是固定仓库路径下的更新清单地址");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text = "";
  let finalUrl = "";
  try {
    const response = await fetch(safeManifestUrl, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: { "cache-control": "no-cache", Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    finalUrl = safeUpdateManifestUrl(response.url);
    if (!finalUrl) throw new Error("更新清单被重定向到非固定仓库路径");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > REPOSITORY_CONFIG.maxManifestBytes) throw new Error("更新清单超过大小限制");
    text = await response.text();
    if (enc.encode(text).length > REPOSITORY_CONFIG.maxManifestBytes) throw new Error("更新清单超过大小限制");
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("更新清单读取超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error("JSON 解析失败");
  }
  await verifySignedUpdateManifest(parsed);
  const manifest = normalizeRemoteUpdateManifest(parsed);
  if (!validExtensionVersion(manifest.version)) throw new Error("version 格式无效");
  // build 解析由 update_core.js 统一提供，避免 Service Worker 误读取未定义的全局函数。
  if (!Number.isFinite(updateCore.parseBuildStamp(manifest.build))) throw new Error("build 格式无效");
  if (manifest.packageFormat !== "crx") throw new Error("packageFormat 必须为 crx");
  if (manifest.extensionId !== EXPECTED_EXTENSION_ID) throw new Error("extensionId 与正式扩展不一致");
  if (!Number.isSafeInteger(manifest.packageSize) || manifest.packageSize <= 0 || manifest.packageSize > REPOSITORY_CONFIG.maxPackageBytes) {
    throw new Error("packageSize 无效");
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.packageSha256)) throw new Error("packageSha256 无效");
  if (!manifest.downloadCandidates.length) throw new Error("清单没有固定仓库路径下的 CRX 地址");
  if (manifest.homepage !== REPOSITORY_CONFIG.url) throw new Error("homepage 不是正式仓库地址");
  if (String(manifest.changelog?.[0]?.id || "") !== manifest.build) throw new Error("首条更新日志 ID 与 build 不一致");
  const declaredCandidates = [
    parsed.downloadUrl,
    ...(Array.isArray(parsed.downloadCandidates) ? parsed.downloadCandidates : [])
  ].filter(Boolean);
  if (declaredCandidates.some((candidate) => !safeUpdatePackageUrl(candidate))) {
    throw new Error("清单包含非固定仓库路径的安装包地址");
  }
  const cleanUrl = distributionUrlWithoutQuery(finalUrl || url);
  manifest.manifestUrl = cleanUrl;
  manifest.manifestFetchUrl = url;
  manifest.manifestHost = manifestSourceHost(cleanUrl);
  return manifest;
}

/**
 * 升级系统 v8 核心：并发验证全部签名清单源，取 version/build 最新的一份，并隔离旧本地版本缓存。
 * 彻底解决「jsDelivr 返回 3.5.1、raw 已是 3.5.3，却显示云端旧版」的问题。
 */
async function fetchRemoteUpdateManifest(options = {}) {
  const candidates = updateManifestCandidateUrls(options);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : REPOSITORY_CONFIG.timeoutMs;
  const settled = await Promise.allSettled(
    candidates.map((url) => fetchOneUpdateManifest(url, timeoutMs))
  );

  const successes = [];
  const errors = [];
  const sourceRows = [];

  settled.forEach((item, index) => {
    const url = candidates[index];
    const host = manifestSourceHost(url) || url;
    if (item.status === "fulfilled" && item.value) {
      successes.push(item.value);
      sourceRows.push({
        host,
        ok: true,
        version: item.value.version,
        build: item.value.build,
        url: item.value.manifestUrl
      });
    } else {
      const reason = item.status === "rejected"
        ? (item.reason?.message || String(item.reason || "失败"))
        : "未知错误";
      errors.push(`${host}：${reason}`);
      sourceRows.push({ host, ok: false, error: reason, url: String(url || "").split("?")[0] });
    }
  });

  if (!successes.length) {
    throw new Error(`远程版本清单读取失败（已并发尝试 ${candidates.length} 个源）：${errors.slice(0, 4).join("；")}`);
  }

  // 按新鲜度排序：最新 version/build 在前；同版本优先 raw
  successes.sort((a, b) => compareManifestFreshness(b, a));
  const best = successes[0];
  // 来源优先级只用于同版本择优，不能把同 version/build 的低优先级镜像误报为旧版本源。
  const staleCount = successes.filter((item) => {
    const versionDiff = compareVersions(String(best.version || ""), String(item.version || ""));
    if (versionDiff !== 0) return versionDiff > 0;
    return compareBuilds(String(best.build || ""), String(item.build || "")) > 0;
  }).length;
  const probe = {
    totalCount: candidates.length,
    okCount: successes.length,
    failCount: errors.length,
    staleCount,
    pickedHost: best.manifestHost || manifestSourceHost(best.manifestUrl),
    pickedVersion: best.version,
    pickedBuild: best.build,
    sources: sourceRows,
    summary: sourceRows
      .map((row) => (row.ok ? `${row.host}=v${row.version}/${row.build}` : `${row.host}=失败`))
      .join(" · ")
  };
  best.probe = probe;
  return best;
}

function shouldUpdateByManifest(remote = {}, localVersion = localExtensionVersion(), localBuild = LOCAL_UPDATE_BUILD) {
  return updateCore.shouldUpdate(remote, localVersion, localBuild);
}

async function readRepositoryUpdateState() {
  await repositoryUpdateStateWriteQueue.catch(() => {});
  const stored = await chrome.storage.local.get("txzzUpdateState");
  const raw = stored.txzzUpdateState || {};
  const schemaOk = raw.schemaVersion === UPDATE_STATE_SCHEMA_VERSION;
  return { state: schemaOk ? raw : {}, ignoredLegacyState: !schemaOk && Object.keys(raw).length > 0 };
}

function mutateRepositoryUpdateState(mutator) {
  const operation = repositoryUpdateStateWriteQueue
    .catch(() => {})
    .then(async () => {
      const stored = await chrome.storage.local.get("txzzUpdateState");
      const raw = stored.txzzUpdateState || {};
      const state = raw.schemaVersion === UPDATE_STATE_SCHEMA_VERSION ? raw : {};
      const nextValue = await mutator(state);
      const next = { ...(nextValue || state), schemaVersion: UPDATE_STATE_SCHEMA_VERSION };
      await chrome.storage.local.set({ txzzUpdateState: next });
      return next;
    });
  // 队列尾始终恢复为 fulfilled；具体写入失败仍通过 operation 交给调用方处理。
  repositoryUpdateStateWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function assertNoSignedManifestRollback(remoteManifest, updateState) {
  const previousVersion = String(updateState.lastVerifiedRemoteVersion || "");
  const previousBuild = String(updateState.lastVerifiedRemoteBuild || "");
  if (!previousVersion) return;
  const versionDiff = compareVersions(remoteManifest.version, previousVersion);
  const buildDiff = versionDiff === 0 ? compareBuilds(remoteManifest.build, previousBuild) : 0;
  if (versionDiff < 0 || (versionDiff === 0 && buildDiff < 0)) {
    throw new Error(`签名清单发生回退：已验证 v${previousVersion}/${previousBuild}，当前仅 v${remoteManifest.version}/${remoteManifest.build}`);
  }
}

const UPDATE_DOWNLOAD_RESULT_FIELDS = [
  "downloadPhase",
  "downloadStatus",
  "downloadError",
  "downloadId",
  "downloadSaveVia",
  "downloadStartedAt",
  "downloadSubmittedAt",
  "downloadUrl",
  "downloadCandidates",
  "downloadAttemptUrls",
  "packageProbe",
  "packageProbeAttempts"
];

/**
 * 远程检测在网络中等待时，另一个标签可能已完成下载。只有下载写入发生在本次检测开始之后，
 * 且仍对应同一更新 ID（检测错误没有远程 ID 时沿用已验证结果），才把下载阶段合并回来。
 * 这样既避免慢检测把 submitted 覆盖成 idle，也允许用户之后主动实时检测清理旧下载状态。
 */
function mergeConcurrentDownloadResult(nextResult, latestState, checkStartedAt) {
  const previousResult = latestState.lastUpdateResult || null;
  const previousPhase = String(previousResult?.downloadPhase || "idle");
  const lastDownloadAt = Number(latestState.lastDownloadAt || 0);
  const nextId = String(nextResult?.remote?.id || "");
  const previousId = String(previousResult?.remote?.id || "");
  const sameUpdate = !nextId || (previousId && previousId === nextId);
  if (!previousResult || previousPhase === "idle" || !sameUpdate || lastDownloadAt < Number(checkStartedAt || 0)) {
    return nextResult;
  }
  const preserved = {};
  for (const key of UPDATE_DOWNLOAD_RESULT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(previousResult, key)) preserved[key] = previousResult[key];
  }
  const verifiedContext = !nextId
    ? {
        remote: previousResult.remote || null,
        updateManifest: previousResult.updateManifest || null,
        compareHint: previousResult.compareHint || ""
      }
    : {};
  return { ...nextResult, ...verifiedContext, ...preserved };
}

async function persistRepositoryUpdateError(error, options, context) {
  const now = Number(context.checkStartedAt || Date.now());
  const localVersion = localExtensionVersion();
  const localBuild = LOCAL_UPDATE_BUILD;
  const errorText = error?.message || String(error);
  const result = {
    ok: false,
    source: "signed-update.json",
    checkedAt: new Date(now).toISOString(),
    checkMode: options.realtime || options.force ? "实时检测" : "自动检测",
    checkPhase: "error",
    downloadPhase: "idle",
    downloadStatus: "",
    downloadError: "",
    downloadId: 0,
    packageProbe: null,
    packageProbeAttempts: [],
    cacheHit: false,
    cacheAgeMs: 0,
    status: "error",
    updateAvailable: false,
    shouldNotify: false,
    error: `签名更新清单读取失败：${errorText}`,
    repositoryUrl: REPOSITORY_CONFIG.url,
    manifestUrl: REPOSITORY_CONFIG.updateManifestUrl,
    downloadUrl: "",
    downloadCandidates: [],
    local: { version: localVersion, build: localBuild },
    remote: null,
    updateManifest: null,
    updateSystem: {
      schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
      engine: "upgrade-system-v8",
      cacheTtlMs: REPOSITORY_CONFIG.checkIntervalMs,
      ignoredLegacyCache: Boolean(context.ignoredLegacyState),
      cachePolicy: "失败结果不进入成功缓存，可立即实时重试。",
      downloadPolicy: "没有通过固定公钥验证的清单时拒绝下载安装包。",
      mirrorCount: (REPOSITORY_CONFIG.updateManifestUrls || []).length
    }
  };
  let mergedResult = result;
  const nextUpdateState = await mutateRepositoryUpdateState((latest) => {
    mergedResult = mergeConcurrentDownloadResult(result, latest, now);
    return {
      ...latest,
      lastCheckedAt: now,
      lastRemoteId: String(mergedResult.remote?.id || ""),
      lastRemoteLine: String(mergedResult.remote?.line || ""),
      lastUpdateManifestUrl: mergedResult.manifestUrl || REPOSITORY_CONFIG.updateManifestUrl,
      lastDownloadUrl: mergedResult.downloadPhase && mergedResult.downloadPhase !== "idle"
        ? (latest.lastDownloadUrl || "")
        : "",
      lastDownloadCandidates: mergedResult.downloadCandidates || [],
      lastError: result.error,
      lastUpdateResult: mergedResult
    };
  });
  return { skipped: false, ...mergedResult, updateState: nextUpdateState };
}

async function performRepositoryUpdateCheck(options = {}) {
  const context = await readRepositoryUpdateState();
  const updateState = context.state;
  const now = Date.now();
  const cacheAgeMs = Math.max(0, now - Number(updateState.lastCheckedAt || 0));
  const currentLocalVersion = localExtensionVersion();
  const cacheValid = updateCore.canReuseSuccessCache({
    cachedResult: updateState.lastUpdateResult,
    lastCheckedAt: updateState.lastCheckedAt,
    now,
    ttlMs: REPOSITORY_CONFIG.checkIntervalMs,
    localVersion: currentLocalVersion,
    localBuild: LOCAL_UPDATE_BUILD,
    force: Boolean(options.force),
    realtime: Boolean(options.realtime)
  });
  if (cacheValid) {
    const cached = updateState.lastUpdateResult;
    // 即使存储被旧代码写出矛盾字段，缓存返回前也重新执行一次同源版本决策。
    const updateAvailable = shouldUpdateByManifest(cached.updateManifest || cached.remote || {}, currentLocalVersion, LOCAL_UPDATE_BUILD);
    const updateId = String(cached.remote?.id || "");
    const reminderDismissed = Boolean(updateAvailable && updateId && updateState.dismissedId === updateId);
    return {
      ...cached,
      ok: true,
      skipped: true,
      checkMode: "成功缓存",
      checkPhase: "cached",
      cacheHit: true,
      cacheAgeMs,
      cacheServedAt: nowIso(),
      status: updateAvailable ? "available" : "latest",
      updateAvailable,
      shouldNotify: Boolean(updateAvailable && !reminderDismissed),
      reminderDismissed,
      updateState
    };
  }

  let remoteManifest;
  try {
    remoteManifest = await fetchRemoteUpdateManifest({ force: true, realtime: true });
  } catch (error) {
    if (options.manifestOnly) throw error;
    return persistRepositoryUpdateError(error, options, { ...context, checkStartedAt: now });
  }

  let result;
  const probe = remoteManifest.probe || null;
  const manifestHost = probe?.pickedHost || manifestSourceHost(remoteManifest.manifestUrl) || "update.json";
  const nextUpdateState = await mutateRepositoryUpdateState((latest) => {
    assertNoSignedManifestRollback(remoteManifest, latest);
    const freshResult = buildRepositoryUpdateResult(remoteManifest, {
      realtime: Boolean(options.realtime || options.force),
      manifestUrl: remoteManifest.manifestUrl,
      manifestSourceLabel: probe
        ? `签名多源最新 ${manifestHost}（${probe.okCount}/${probe.totalCount}）`
        : `签名 update.json · ${manifestHost}`,
      ignoredLegacyCache: context.ignoredLegacyState,
      dismissedId: latest.dismissedId || "",
      probe
    });
    result = mergeConcurrentDownloadResult(freshResult, latest, now);
    const updateId = remoteManifest.id || `${remoteManifest.version}|${remoteManifest.build}`;
    return {
      ...latest,
      lastCheckedAt: now,
      lastRemoteId: updateId,
      lastRemoteLine: result.remote?.line || "",
      lastVerifiedRemoteVersion: remoteManifest.version,
      lastVerifiedRemoteBuild: remoteManifest.build,
      lastVerifiedManifestSignature: remoteManifest.signature?.value || "",
      lastUpdateManifestUrl: result.manifestUrl || REPOSITORY_CONFIG.updateManifestUrl,
      lastDownloadUrl: result.downloadUrl || "",
      lastDownloadCandidates: result.downloadCandidates || [],
      lastError: "",
      lastUpdateResult: result
    };
  });
  return { ok: true, skipped: false, ...result, updateState: nextUpdateState };
}

async function checkRepositoryUpdate(options = {}) {
  const contract = options.manifestOnly
    ? "signed-manifest"
    : `${options.force || options.realtime ? "realtime-result" : "automatic-result"}:${localExtensionVersion()}/${LOCAL_UPDATE_BUILD}`;
  const existing = repositoryUpdateCheckTasks.get(contract);
  if (existing) return existing;
  const task = performRepositoryUpdateCheck(options);
  repositoryUpdateCheckTasks.set(contract, task);
  try {
    return await task;
  } finally {
    if (repositoryUpdateCheckTasks.get(contract) === task) repositoryUpdateCheckTasks.delete(contract);
  }
}

async function buildLatestArchiveDownloadPlan(meta = {}) {
  let update = null;
  let manifestError = "";
  try {
    update = await checkRepositoryUpdate({ force: true, realtime: true, manifestOnly: true });
  } catch (err) {
    manifestError = err?.message || String(err);
  }
  const remote = update?.remote || {};
  const manifest = update?.updateManifest || {};
  const version = safeFileName(String(remote.version || manifest.version || localExtensionVersion() || "latest"));
  const build = safeFileName(String(remote.build || manifest.build || LOCAL_UPDATE_BUILD || "main"));
  const localVersion = localExtensionVersion();
  const remoteVersionDiff = compareVersions(String(manifest.version || ""), localVersion);
  const remoteBuildDiff = remoteVersionDiff === 0
    ? compareBuilds(String(manifest.build || ""), LOCAL_UPDATE_BUILD)
    : 0;
  if (remoteVersionDiff < 0 || (remoteVersionDiff === 0 && remoteBuildDiff < 0)) {
    manifestError = `拒绝降级：远程签名包 v${manifest.version || "?"}/${manifest.build || "?"} 低于本地 v${localVersion}/${LOCAL_UPDATE_BUILD}`;
  }
  const candidates = repositoryArchiveCandidates(manifest);
  const attempts = manifestError ? [] : repositoryDownloadAttempts(manifest);
  const primaryUrl = candidates[0] || attempts[0] || "";
  const filename = `糖心志者/糖心志者_${version}_${build}_最新版.crx`;
  if (!primaryUrl && !manifestError) manifestError = "签名清单没有可用的正式 CRX 镜像";
  return { update, manifest, manifestError, version, build, filename, candidates, attempts, packageExt: "crx" };
}

async function recordRepositoryArchiveDownload(result = {}) {
  return mutateRepositoryUpdateState((updateState) => ({
    ...updateState,
    lastDownloadAt: Date.now(),
    lastDownloadUrl: result.displayUrl || result.url || "",
    lastDownloadFilename: result.filename || "",
    lastDownloadSaveVia: result.saveVia || "",
    lastDownloadErrors: result.errors || [],
    lastDownloadId: Number(result.downloadId || 0),
    lastPackageProbe: result.packageProbe || null,
    lastPackageProbeAttempts: result.packageProbeAttempts || [],
    lastUpdateResult: updateState.lastUpdateResult
      ? {
          ...updateState.lastUpdateResult,
          downloadUrl: result.displayUrl || result.url || updateState.lastUpdateResult.downloadUrl,
          downloadCandidates: result.candidates || updateState.lastUpdateResult.downloadCandidates || [],
          downloadAttemptUrls: result.attempts || [],
          downloadPhase: result.downloadPhase || (result.ok ? "submitted" : "failed"),
          downloadStatus: result.downloadStatus || (result.ok ? "已提交已验证安装包" : "下载失败"),
          downloadError: result.ok ? "" : (result.errors || []).join("；"),
          downloadId: Number(result.downloadId || 0),
          downloadSaveVia: String(result.saveVia || ""),
          downloadStartedAt: result.downloadStartedAt || updateState.lastUpdateResult.downloadStartedAt || "",
          downloadSubmittedAt: result.downloadSubmittedAt || "",
          packageProbe: result.packageProbe || null,
          packageProbeAttempts: result.packageProbeAttempts || []
        }
      : updateState.lastUpdateResult
  }));
}

async function markRepositoryUpdateNotified(updateId = "", mode = "notified") {
  const next = await mutateRepositoryUpdateState((updateState) => {
    const key = mode === "dismissed" ? "dismissedId" : "notifiedId";
    const normalizedId = String(updateId || updateState.lastRemoteId || "");
    if (!normalizedId) throw new Error("缺少要记录的更新 ID");
    const lastResult = updateState.lastUpdateResult || null;
    const matchesLastResult = normalizedId === String(lastResult?.remote?.id || "");
    return {
      ...updateState,
      [key]: normalizedId,
      [key + "At"]: Date.now(),
      lastUpdateResult: matchesLastResult && mode === "dismissed"
        ? { ...lastResult, shouldNotify: false, reminderDismissed: true }
        : lastResult
    };
  });
  return { ok: true, updateState: next };
}

async function performRepositoryArchiveDownload(meta = {}) {
  const downloadStartedAt = nowIso();
  const plan = await buildLatestArchiveDownloadPlan(meta);
  const { update, manifest, manifestError, filename, candidates, attempts } = plan;
  const errors = [];
  const packageProbeAttempts = [];
  if (manifestError || !attempts.length) {
    const finalErrors = [manifestError || "没有通过签名清单验证的安装包地址"];
    const failedResult = {
      ok: false,
      filename,
      url: "",
      candidates,
      attempts,
      errors: finalErrors,
      packageProbeAttempts,
      downloadPhase: "failed",
      downloadStartedAt
    };
    try {
      await recordRepositoryArchiveDownload(failedResult);
    } catch (stateError) {
      failedResult.statePersistenceError = stateError?.message || String(stateError);
    }
    return {
      ...failedResult,
      error: `最新版下载失败：${finalErrors.join("；")}`,
      manifestError,
      update
    };
  }
  for (let i = 0; i < attempts.length; i += 1) {
    const url = attempts[i];
    const displayUrl = candidates[i] || url;
    const attemptRecord = { url, displayUrl, format: "crx", ok: false, phase: "validating" };
    if (!safeUpdatePackageUrl(url)) {
      const error = "下载地址不是固定仓库路径下的 HTTPS 更新地址";
      errors.push(`${displayUrl || url}：${error}`);
      packageProbeAttempts.push({ ...attemptRecord, phase: "rejected", error });
      continue;
    }
    try {
      const verifiedPackage = await fetchAndVerifyRepositoryPackage(url, manifest);
      const { bytes, packageProbe } = verifiedPackage;
      Object.assign(attemptRecord, { ok: true, phase: "validated", packageProbe });
      // 不再通过 data URL 或 runtime Base64 传输整个 CRX。离屏页按同一 URL 重新获取，
      // 并用刚刚验证出的大小和 SHA-256 做第二次校验后写入 OPFS，消除消息尺寸和 TOCTOU 风险。
      await ensureOffscreenDocument();
      const crxTaskId = `txzz_crx_${safeFileName(update?.id || update?.version || "latest")}`;
      const crxAttemptId = downloadAttemptId();
      const stored = await chrome.runtime.sendMessage({
        type: "offscreenStoreVerifiedCrx",
        taskId: crxTaskId,
        attemptId: crxAttemptId,
        url,
        filename: String(filename).split("/").filter(Boolean).pop() || "糖心志者最新版.crx",
        expectedSize: bytes.length,
        expectedSha256: packageProbe.sha256
      });
      if (stored?.ok === false) throw new Error(stored.error || "无法把已验证 CRX 写入 OPFS");
      const result = {
        ok: true,
        downloadId: 0,
        downloadState: "save-page-opened",
        saveVia: "extension-save-page-pending",
        filename,
        url,
        displayUrl,
        candidates,
        attempts,
        manifestError,
        update,
        packageProbe,
        packageProbeAttempts: [...packageProbeAttempts, { ...attemptRecord, phase: "save-page-opened" }],
        downloadPhase: "saving",
        downloadStatus: "安装包已验证，请在扩展安全保存页点击保存",
        downloadStartedAt,
        artifact: stored.artifact
      };
      await createSavePageToken({
        kind: "crx",
        taskId: crxTaskId,
        attemptId: crxAttemptId,
        artifact: stored.artifact,
        expectedSize: bytes.length,
        expectedSha256: packageProbe.sha256,
        filename: stored.artifact?.filename,
        completionResult: result
      });
      try {
        await recordRepositoryArchiveDownload(result);
      } catch (stateError) {
        result.statePersistenceError = stateError?.message || String(stateError);
      }
      return result;
    } catch (err) {
      const error = err?.message || String(err);
      errors.push(`${displayUrl}：${error}`);
      packageProbeAttempts.push({
        ...attemptRecord,
        ok: false,
        phase: attemptRecord.phase === "validated" ? "submit-failed" : "validation-failed",
        error
      });
      // 完整字节已经验证成功后，后续失败来自本机编码或 downloads API，换远程镜像不会改善，
      // 继续循环只会重复传输同一安装包。
      if (attemptRecord.phase === "validated") break;
    }
  }
  const finalErrors = [
    ...errors
  ].filter(Boolean);
  const failedResult = {
    ok: false,
    filename,
    url: "",
    candidates,
    attempts,
    errors: finalErrors,
    packageProbeAttempts,
    downloadPhase: "failed",
    downloadStartedAt
  };
  try {
    await recordRepositoryArchiveDownload(failedResult);
  } catch (stateError) {
    failedResult.statePersistenceError = stateError?.message || String(stateError);
  }
  const error = `最新版下载失败：${finalErrors.join("；") || "没有可用下载地址"}`;
  return {
    ...failedResult,
    error,
    manifestError,
    update
  };
}

async function downloadRepositoryArchive(meta = {}) {
  if (repositoryArchiveDownloadInFlight) return repositoryArchiveDownloadInFlight;
  const task = performRepositoryArchiveDownload(meta);
  repositoryArchiveDownloadInFlight = task;
  try {
    return await task;
  } finally {
    if (repositoryArchiveDownloadInFlight === task) repositoryArchiveDownloadInFlight = null;
  }
}

async function upsertAccount(raw) {
  const state = await getStateInternal();
  const incoming = normalizeAccount(raw);
  const index = state.accountPool.findIndex((item) => item.id === incoming.id);
  if (index >= 0) {
    const existing = normalizeAccount(state.accountPool[index]);
    state.accountPool[index] = {
      ...existing,
      ...incoming,
      password: incoming.password || existing.password,
      qrcode: incoming.qrcode || existing.qrcode,
      deviceId: incoming.deviceId || existing.deviceId,
      userToken: incoming.userToken || existing.userToken
    };
  } else {
    state.accountPool.push(incoming);
  }
  state.selectedFullAccountId = incoming.id;
  await saveState(state);
  return { ok: true, state: sanitizeState(state), account: publicAccount(incoming) };
}

async function uploadAccountToRemote(raw) {
  const state = await getStateInternal();
  const incoming = normalizeAccount(raw);
  const existing = state.accountPool.find((item) => item.id === incoming.id);
  // 编辑账号时允许凭据输入框留空，上传前从后台私有状态合并原凭据。
  const account = normalizeAccount({
    ...(existing || {}),
    ...raw,
    id: incoming.id,
    password: incoming.password || existing?.password || "",
    qrcode: incoming.qrcode || existing?.qrcode || "",
    deviceId: incoming.deviceId || existing?.deviceId || "",
    userToken: incoming.userToken || existing?.userToken || ""
  });
  const response = await remoteRequest(state, "/v1/accounts/client-upload", {
    method: "POST",
    body: JSON.stringify({ account: { ...account, source: account.qrcode ? "qrcode" : "remote" } })
  });
  const localState = await getStateInternal();
  localState.accountPool = (localState.accountPool || []).map((item) => item.id === account.id
    ? normalizeAccount({ ...(response.account || account), source: response.account?.source || (account.qrcode ? "qrcode" : "remote"), cloudReadonly: true, remoteId: account.id })
    : item);
  await saveState(localState);
  const synced = await syncRemoteAccounts(localState);
  return { ok: true, account: response.account, state: sanitizeState(synced) };
}

async function uploadLocalAccountToRemote(accountId = "") {
  const state = await getStateInternal();
  const account = normalizeAccount(state.accountPool.find((item) => item.id === accountId));
  if (!account?.id || !state.accountPool.some((item) => item.id === account.id)) throw new Error(`未找到账号：${accountId}`);
  if (isCloudAccount(account)) throw new Error("该账号已经是云端摘要，不需要重复上传");
  if (!account.password && !(account.deviceId && account.userToken) && !account.qrcode) {
    throw new Error("本地账号缺少可上传凭据：请填写密码、token/deviceId 或账号凭证二维码内容");
  }
  const response = await remoteRequest(state, "/v1/accounts/client-upload", {
    method: "POST",
    body: JSON.stringify({ account: { ...account, source: account.qrcode ? "qrcode" : "remote" } })
  });
  state.accountPool = (state.accountPool || []).map((item) => item.id === account.id
    ? normalizeAccount({ ...(response.account || account), source: response.account?.source || (account.qrcode ? "qrcode" : "remote"), cloudReadonly: true, remoteId: account.id })
    : item);
  await saveState(state);
  const synced = await syncRemoteAccounts(state);
  return { ok: true, account: response.account, state: sanitizeState(synced) };
}

async function saveRemoteConfig(remote = {}) {
  const state = await getStateInternal();
  const merged = {
    ...state.remote,
    ...remote
  };
  const incoming = normalizeRemoteConfig(merged);
  state.remote = incoming;
  await saveState(state);
  const synced = incoming.enabled && incoming.baseUrl && incoming.accountSourceMode !== "local" ? await syncRemoteAccounts(state) : state;
  return { ok: true, state: sanitizeState(synced) };
}

async function importAccountSession(session = {}, label = "") {
  const userToken = String(session.userToken || session.token || "");
  const deviceId = String(session.deviceId || "");
  if (!userToken || !deviceId) throw new Error("当前页面没有可导入的 token/deviceId");
  const userId = String(session.userId || userToken.split("_").pop() || "");
  return upsertAccount({
    id: `full-import-${userId || Date.now()}`,
    label: label || `导入会话 ${userId || ""}`.trim(),
    username: session.nickname || session.account_name || session.username || "",
    userToken,
    deviceId,
    source: "imported",
    userInfo: session.userInfo || { id: userId, nickname: session.nickname },
    status: "imported",
    lastVerifiedAt: nowIso()
  });
}

async function selectAccount(accountId) {
  const state = await getStateInternal();
  const account = state.accountPool.find((item) => item.id === accountId);
  if (!account) throw new Error(`未找到账号：${accountId}`);
  if (isCloudAccount(account)) throw new Error("云端账号由系统自动轮换，不支持手动固定选择");
  state.selectedFullAccountId = accountId;
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

async function removeAccount(accountId) {
  const state = await getStateInternal();
  state.accountPool = state.accountPool.filter((item) => item.id !== accountId);
  if (!state.accountPool.some((item) => item.id === state.selectedFullAccountId)) {
    state.selectedFullAccountId = state.accountPool[0]?.id || "";
  }
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

function maskedHealthReason(error) {
  return String(error?.message || error || "验证失败")
    .replace(/[A-Za-z0-9_=-]{24,}/g, "***")
    .replace(/(token|password|qrcode)\s*[:=]\s*\S+/gi, "$1=***")
    .slice(0, 180);
}

async function verifyAccountForPatrol(accountId) {
  const state = await getStateInternal();
  const account = normalizeAccount(state.accountPool.find((item) => item.id === accountId));
  if (!account?.id || !state.accountPool.some((item) => item.id === account.id)) throw new Error(`未找到账号：${accountId}`);
  if (isCloudAccount(account)) {
    const response = await remoteRequest(state, "/v1/accounts/verify", {
      method: "POST",
      body: JSON.stringify({ accountId: account.id })
    });
    await syncRemoteAccounts(await getStateInternal());
    return response;
  }
  const session = await acquireAccountSession(account, null);
  const fresh = await getStateInternal();
  const index = fresh.accountPool.findIndex((item) => item.id === account.id);
  if (index >= 0) {
    fresh.accountPool[index] = {
      ...normalizeAccount(fresh.accountPool[index]),
      deviceId: session.deviceId,
      userToken: session.userToken,
      userInfo: session.userInfo,
      lastVerifiedAt: nowIso(),
      lastError: "",
      status: "ok"
    };
    await saveState(fresh);
  }
  return { account: publicAccount(fresh.accountPool[index] || account) };
}

async function recordAccountHealth(accountId, result) {
  let savedRecord = null;
  await mutateExperience((experience) => {
    const current = experience.accountPatrol?.records?.[accountId] || { accountId };
    savedRecord = experienceCore.applyHealthResult(current, { accountId, ...result });
    return {
      ...experience,
      accountPatrol: {
        ...experience.accountPatrol,
        records: { ...(experience.accountPatrol?.records || {}), [accountId]: savedRecord }
      }
    };
  });
  return savedRecord;
}

async function verifyAccountWithHealth(accountId, bootstrapSession = null) {
  try {
    const result = await updateAccountSession(accountId, bootstrapSession);
    await recordAccountHealth(accountId, { ok: true });
    return result;
  } catch (error) {
    await recordAccountHealth(accountId, {
      ok: false,
      category: experienceCore.classifyHealthFailure(error),
      reason: maskedHealthReason(error)
    });
    throw error;
  }
}

async function runAccountPatrol({ force = false, accountId = "" } = {}) {
  if (accountPatrolInFlight) return accountPatrolInFlight;
  const task = (async () => {
    const experience = await getExperienceInternal();
    if (!force && experience.accountPatrol?.enabled === false) return { ok: true, checked: 0, skipped: true };
    const state = await getStateInternal();
    const candidates = (state.accountPool || [])
      .filter((account) => account.enabled !== false)
      .filter((account) => !accountId || String(account.id) === String(accountId));
    let checked = 0;
    let failed = 0;
    for (const account of candidates) {
      const currentExperience = await getExperienceInternal();
      const currentRecord = currentExperience.accountPatrol?.records?.[account.id];
      if (!force && experienceCore.accountIsCooling(currentRecord)) continue;
      try {
        await verifyAccountForPatrol(account.id);
        await recordAccountHealth(account.id, { ok: true });
        checked += 1;
      } catch (error) {
        const record = await recordAccountHealth(account.id, {
          ok: false,
          category: experienceCore.classifyHealthFailure(error),
          reason: maskedHealthReason(error)
        });
        checked += 1;
        failed += 1;
        if (["cooling", "needs_attention"].includes(String(record?.state || ""))) {
          await emitExperienceAlert({
            key: `account:${account.id}:${record.state}`,
            category: "account",
            level: record.state === "needs_attention" ? "error" : "warning",
            title: record.state === "needs_attention" ? "账号凭据需要处理" : "账号已进入冷却",
            detail: `${account.label || account.id}：${record.lastReason || "验证失败"}`
          });
        }
      }
    }
    await mutateExperience((current) => ({
      ...current,
      accountPatrol: { ...current.accountPatrol, lastRunAt: nowIso() }
    }));
    return stateResponseWithExperience({ checked, failed });
  })();
  accountPatrolInFlight = task;
  try {
    return await task;
  } finally {
    if (accountPatrolInFlight === task) accountPatrolInFlight = null;
  }
}

async function ensureAutomationAlarms() {
  if (!chrome.alarms?.create) return;
  const experience = await getExperienceInternal();
  chrome.alarms.create(DOWNLOAD_SCHEDULER_ALARM, { delayInMinutes: 1, periodInMinutes: 15 });
  chrome.alarms.create(STORAGE_AUDIT_ALARM, { delayInMinutes: 5, periodInMinutes: 24 * 60 });
  await chrome.alarms.clear(ACCOUNT_PATROL_ALARM).catch(() => false);
  if (experience.accountPatrol?.enabled !== false) {
    chrome.alarms.create(ACCOUNT_PATROL_ALARM, {
      delayInMinutes: 3,
      periodInMinutes: Number(experience.accountPatrol?.intervalHours || 6) * 60
    });
  }
  await scheduleNextDownloadAlarm();
}

async function recoverPersistedDownloads({ dispatch = true } = {}) {
  const state = await getStateInternal();
  const recoveryPlan = stateMutationCore.planPersistedDownloadRecovery(state.downloadTasks || {});
  if (!recoveryPlan.length) {
    persistedDownloadsReconciled = true;
    return { ok: true, recovered: 0 };
  }
  let recovered = 0;
  for (const item of recoveryPlan) {
    const task = item.task;
    if (item.action === "stale") {
      state.downloadTasks[task.taskId] = {
        ...task,
        stage: "stale",
        error: "旧版任务没有恢复标识，请重新创建下载",
        updatedAt: nowIso()
      };
      continue;
    }
    state.downloadTasks[task.taskId] = {
      ...task,
      stage: "queued",
      resumeRequested: true,
      pauseReason: "",
      updatedAt: nowIso()
    };
    recovered += 1;
  }
  await saveState(state);
  persistedDownloadsReconciled = true;
  if (dispatch) scheduleDownloadDispatch(0);
  return { ok: true, recovered };
}

async function ensurePersistedDownloadsReconciled() {
  if (persistedDownloadsReconciled) return { ok: true, recovered: 0, reused: true };
  if (persistedDownloadRecoveryInFlight) return persistedDownloadRecoveryInFlight;
  const task = recoverPersistedDownloads({ dispatch: false });
  persistedDownloadRecoveryInFlight = task;
  try {
    return await task;
  } finally {
    if (persistedDownloadRecoveryInFlight === task) persistedDownloadRecoveryInFlight = null;
  }
}

chrome.runtime.onStartup?.addListener(() => {
  ensureAutomationAlarms().catch(() => {});
  ensurePersistedDownloadsReconciled().then(() => scheduleDownloadDispatch(0)).catch(() => {});
});

chrome.runtime.onInstalled?.addListener(() => {
  ensureAutomationAlarms().catch(() => {});
  ensurePersistedDownloadsReconciled().then(() => scheduleDownloadDispatch(0)).catch(() => {});
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if ([DOWNLOAD_SCHEDULER_ALARM, DOWNLOAD_NEXT_ALARM].includes(String(alarm?.name || ""))) {
    runDownloadScheduler().catch(() => {});
  } else if (alarm?.name === ACCOUNT_PATROL_ALARM) {
    runAccountPatrol().catch(() => {});
  } else if (alarm?.name === STORAGE_AUDIT_ALARM) {
    runStorageAudit().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "getState") {
      let state = await getStateInternal();
      if (normalizeRemoteConfig(state.remote).accountSourceMode !== "local") state = await syncRemoteAccounts(state);
      sendResponse({ ok: true, state: sanitizeState(state) });
      return;
    }
    if (message?.type === "getStateLocal") {
      sendResponse({ ok: true, state: sanitizeState(await getStateInternal()) });
      return;
    }
    if (message?.type === "updateLibraryEntry") {
      sendResponse(await updateLibraryExperience(message));
      return;
    }
    if (message?.type === "markLibraryPlayback") {
      sendResponse(await markLibraryPlayback(message));
      return;
    }
    if (message?.type === "savePlaybackBookmark") {
      sendResponse(await savePlaybackBookmark(message));
      return;
    }
    if (message?.type === "deletePlaybackBookmark") {
      sendResponse(await deletePlaybackBookmark(message));
      return;
    }
    if (message?.type === "markExperienceAlert") {
      sendResponse(await markExperienceAlert(message));
      return;
    }
    if (message?.type === "clearExperienceAlerts") {
      sendResponse(await clearExperienceAlerts());
      return;
    }
    if (message?.type === "saveExperienceSettings") {
      sendResponse(await saveExperienceSettings(message));
      return;
    }
    if (message?.type === "setNotificationsEnabled") {
      sendResponse(await setNotificationsEnabled(message.enabled === true));
      return;
    }
    if (message?.type === "runAccountPatrol") {
      sendResponse(await runAccountPatrol({ force: message.force === true, accountId: String(message.accountId || "") }));
      return;
    }
    if (message?.type === "saveRemoteConfig") {
      sendResponse(await saveRemoteConfig(message.remote || {}));
      return;
    }
    if (message?.type === "syncRemoteAccounts") {
      const state = await syncRemoteAccounts(await getStateInternal());
      sendResponse({ ok: true, state: sanitizeState(state) });
      return;
    }
    if (message?.type === "checkRemoteDiagnostics") {
      sendResponse(await checkRemoteDiagnostics());
      return;
    }
    if (message?.type === "listPurchaseReconciliation") {
      sendResponse(await listPurchaseReconciliation());
      return;
    }
    if (message?.type === "reconcilePurchaseRecord") {
      sendResponse(await reconcilePurchaseRecord(message));
      return;
    }
    if (message?.type === "checkRepositoryUpdate") {
      sendResponse(await checkRepositoryUpdate({
        force: Boolean(message.force),
        realtime: Boolean(message.realtime),
        manifestOnly: Boolean(message.manifestOnly)
      }));
      return;
    }
    if (message?.type === "markRepositoryUpdateNotified") {
      sendResponse(await markRepositoryUpdateNotified(String(message.updateId || ""), String(message.mode || "notified")));
      return;
    }
    if (message?.type === "downloadRepositoryArchive") {
      sendResponse(await downloadRepositoryArchive(message));
      return;
    }
    if (message?.type === "uploadAccountToRemote") {
      sendResponse(await uploadAccountToRemote(message.account || {}));
      return;
    }
    if (message?.type === "uploadLocalAccountToRemote") {
      sendResponse(await uploadLocalAccountToRemote(String(message.accountId || "")));
      return;
    }
    if (message?.type === "saveTrace") {
      const state = await getStateInternal();
      const key = message.role === "full" ? "lastFullTrace" : "lastGuestTrace";
      state[key] = {
        role: message.role || "guest",
        savedAt: nowIso(),
        session: message.session || null,
        selectedFullAccountId: state.selectedFullAccountId,
        playback: Array.isArray(message.playback) ? message.playback.slice(-80) : [],
        requests: Array.isArray(message.requests) ? message.requests.slice(-160) : [],
        observations: Array.isArray(message.observations) ? message.observations.slice(-120) : [],
        fullDetails: Array.isArray(message.fullDetails) ? message.fullDetails.slice(-40) : []
      };
      await saveState(state);
      sendResponse({ ok: true, state: sanitizeState(state) });
      return;
    }
  if (message?.type === "clearState") {
      await mutateExperience(() => experienceCore.defaultExperienceState());
      const state = await saveState({ ...DEFAULT_STATE, accountPool: [] });
      sendResponse({ ok: true, state: sanitizeState(state) });
      return;
    }
    if (message?.type === "clearAllData") {
      sendResponse(await resetAllLocalData());
      return;
    }
    if (message?.type === "upsertAccount") {
      sendResponse(await upsertAccount(message.account || {}));
      return;
    }
    if (message?.type === "removeAccount") {
      sendResponse(await removeAccount(String(message.accountId || "")));
      return;
    }
    if (message?.type === "selectAccount") {
      sendResponse(await selectAccount(String(message.accountId || "")));
      return;
    }
    if (message?.type === "verifyAccount") {
      const result = await verifyAccountWithHealth(String(message.accountId || ""), message.bootstrapSession || message.session || null);
      sendResponse({ ok: true, ...result });
      return;
    }
    if (message?.type === "importAccountSession") {
      sendResponse(await importAccountSession(message.session || {}, message.label || ""));
      return;
    }
    if (message?.type === "getFullDetail") {
      sendResponse(await getFullDetail(message));
      return;
    }
    if (message?.type === "createPlaybackSession") {
      sendResponse(await createPlaybackSession(message));
      return;
    }
    if (message?.type === "planFullVideoDownload") {
      sendResponse(await planFullVideoDownload(message));
      return;
    }
    if (message?.type === "downloadFullVideo") {
      sendResponse(await downloadFullVideo(message));
      return;
    }
    if (message?.type === "configureDownloadTask") {
      sendResponse(await configureDownloadTask(message));
      return;
    }
    if (message?.type === "pauseDownloadQueue") {
      sendResponse(await pauseDownloadQueue());
      return;
    }
    if (message?.type === "resumeDownloadQueue") {
      sendResponse(await resumeDownloadQueue());
      return;
    }
    if (message?.type === "runDownloadScheduler") {
      sendResponse(await runDownloadScheduler());
      return;
    }
    if (message?.type === "runStorageAudit") {
      sendResponse(await runStorageAudit({ allowAutoCleanup: message.allowAutoCleanup !== false }));
      return;
    }
    if (message?.type === "cleanupOpfsStorage") {
      sendResponse(await cleanupOpfsStorage(message.targets || [], false));
      return;
    }
    if (message?.type === "downloadProgress") {
      sendResponse(await recordDownloadProgress(message));
      return;
    }
    if (message?.type === "saveDownloadSnapshot") {
      sendResponse(await saveDownloadSnapshot(message.label || ""));
      return;
    }
    if (message?.type === "saveDownloadToDevice") {
      sendResponse(await saveDownloadToDevice(String(message.taskId || "")));
      return;
    }
    if (message?.type === "pauseDownloadTask") {
      sendResponse(await controlDownloadTask(String(message.taskId || ""), "pause"));
      return;
    }
    if (message?.type === "resumeDownloadTask") {
      sendResponse(await controlDownloadTask(String(message.taskId || ""), "resume"));
      return;
    }
    if (message?.type === "cancelDownloadTask") {
      sendResponse(await controlDownloadTask(String(message.taskId || ""), "cancel"));
      return;
    }
    if (message?.type === "removeDownloadTask") {
      sendResponse(await removeDownloadTask(String(message.taskId || ""), String(message.movieId || "")));
      return;
    }
    if (message?.type === "clearDownloadTasks") {
      sendResponse(await clearDownloadTasks());
      return;
    }
    if (message?.type === "clearDownloadSnapshots") {
      sendResponse(await clearDownloadSnapshots());
      return;
    }
    if (message?.type === "openDownloadFolder") {
      sendResponse(await openDownloadFolder());
      return;
    }
    if (message?.type === "claimSavePageToken") {
      sendResponse(await claimSavePageToken(String(message.token || ""), sender));
      return;
    }
    if (message?.type === "completeSavePageToken") {
      sendResponse(await completeSavePageToken(String(message.token || ""), sender, message.result || {}));
      return;
    }
    sendResponse({ ok: false, error: `unknown message: ${message?.type || ""}` });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
