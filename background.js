"use strict";

const API_CONFIG = {
  baseUrl: "https://txh068.com",
  version: "4.76",
  source: "Apple Computer, Inc.",
  aesKey: "fd14f9f8e38808fa"
};

const STORAGE_SCHEMA_VERSION = "2026-06-13-cloud-readonly-v1";
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

const REPOSITORY_CONFIG = {
  owner: "lsy5920",
  repo: "tangxin-zhizhe-extension",
  url: "https://github.com/lsy5920/tangxin-zhizhe-extension",
  archiveUrl: "https://github.com/lsy5920/tangxin-zhizhe-extension/archive/refs/heads/main.zip",
  updateManifestUrl: "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/update.json",
  readmeUrls: [
    "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/README.md",
    "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/master/README.md"
  ],
  checkIntervalMs: 6 * 60 * 60 * 1000,
  timeoutMs: 9000
};

const LOCAL_UPDATE_BUILD = "2026-06-13-1404";

const FALLBACK_LOCAL_CHANGELOG_HEAD = "2026-06-13 14:04 【优化】更新下载压缩包命名为 tangxin-zhizhe-extension-main.zip，便于解压后直接加载插件目录。";

const DEFAULT_ACCOUNTS = [
  {
    id: "full-lsyhook",
    label: "lsyhook 账号池",
    username: "lsyhook",
    password: "",
    role: "full",
    enabled: true,
    source: "remote-seed",
    deviceId: "",
    userToken: "",
    qrcode: "",
    notes: "远程账号池种子账号"
  }
];

const DEFAULT_STATE = {
  role: "guest",
    lastFullTrace: null,
    lastGuestTrace: null,
    notes: [],
    selectedFullAccountId: "full-lsyhook",
    accountPool: DEFAULT_ACCOUNTS,
    fullplayEnabled: true,
    remote: REMOTE_CONFIG,
    fullDetails: [],
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
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
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

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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
    cloudReadonly: Boolean(raw.cloudReadonly || raw.isCloud || raw.remoteId || raw.cloudId || ["remote", "qrcode", "remote-seed", "seed"].includes(source)),
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
  const legacyRemoteKeys = ["client", "admin"].flatMap((name) => [
    `${name}Token`,
    `has${name[0].toUpperCase()}${name.slice(1)}Token`,
    `${name}TokenMasked`
  ]);
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
    || source === "remote" || source === "qrcode" || source === "remote-seed";
}

function isCloudAccount(account = {}) {
  return isRemoteAccount(account) || String(account.source || "") === "seed";
}

function isHealthyAccount(account = {}) {
  return account?.enabled !== false && String(account?.status || "") !== "error";
}

function buildAutoCleanState(storedState = {}) {
  const previousRemote = normalizeRemoteConfig(storedState.remote || {});
  const keepManualAccounts = (Array.isArray(storedState.accountPool) ? storedState.accountPool : [])
    .map(normalizeAccount)
    .filter((account) => !isRemoteAccount(account));
  const accountMap = new Map();
  for (const account of DEFAULT_ACCOUNTS) accountMap.set(account.id, normalizeAccount(account));
  for (const account of keepManualAccounts) accountMap.set(account.id, account);
  const selectedFullAccountId = accountMap.has(storedState.selectedFullAccountId)
    ? storedState.selectedFullAccountId
    : DEFAULT_ACCOUNTS[0]?.id || Array.from(accountMap.keys())[0] || "";
  return {
    ...DEFAULT_STATE,
    role: storedState.role || DEFAULT_STATE.role,
    selectedFullAccountId,
    accountPool: Array.from(accountMap.values()),
    remote: {
      ...REMOTE_CONFIG,
      accountSourceMode: REMOTE_CONFIG.accountSourceMode,
      fixedAccountId: "",
      fallbackLocal: true,
      lastAutoCleanAt: nowIso(),
      lastAutoCleanReason: isLegacyRemoteBaseUrl(previousRemote.baseUrl)
        ? "检测到旧 Worker 地址或空地址，已自动切换到当前默认 Worker 并清理旧缓存"
        : "检测到插件覆盖安装后的旧版本缓存，已自动刷新远程账号池状态"
    },
    fullDetails: [],
    fullDetailCache: {},
    lastFullTrace: null,
    lastGuestTrace: null,
    notes: Array.isArray(storedState.notes) ? storedState.notes.slice(-20) : [],
    downloadTasks: {},
    downloadSnapshots: [],
    downloadDeletedTaskIds: [],
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
  const normalized = normalizeRemoteConfig(remote);
  return {
    ...normalized,
  };
}

async function remoteRequest(state, endpoint, options = {}) {
  const remote = normalizeRemoteConfig(state.remote);
  if (!remote.enabled || !remote.baseUrl) throw new Error("remote worker is not configured");
  const res = await fetch(`${remote.baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `remote ${endpoint} failed: HTTP ${res.status}`);
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

async function getStateInternal() {
  const stored = await chrome.storage.local.get("txzzState");
  const storedState = stored.txzzState || {};
  const autoCleaned = shouldAutoCleanStoredState(storedState);
  const state = autoCleaned ? buildAutoCleanState(storedState) : { ...DEFAULT_STATE, ...storedState };
  state.remote = normalizeRemoteConfig(state.remote);
  state.storageSchemaVersion = STORAGE_SCHEMA_VERSION;
  state.autoCleanedThisLoad = Boolean(autoCleaned);
  const merged = new Map();
  for (const account of DEFAULT_ACCOUNTS) merged.set(account.id, normalizeAccount(account));
  for (const account of Array.isArray(state.accountPool) ? state.accountPool : []) {
    const normalized = normalizeAccount(account);
    const seeded = merged.get(normalized.id);
    merged.set(normalized.id, { ...(seeded || {}), ...normalized });
  }
  state.accountPool = Array.from(merged.values());
  if (!state.selectedFullAccountId || !state.accountPool.some((item) => item.id === state.selectedFullAccountId)) {
    state.selectedFullAccountId = state.accountPool[0]?.id || "";
  }
  state.fullDetails = Array.isArray(state.fullDetails) ? state.fullDetails.slice(-80) : [];
  state.fullDetailCache = state.fullDetailCache && typeof state.fullDetailCache === "object" ? state.fullDetailCache : {};
  state.downloadTasks = compactDownloadTasks(state.downloadTasks && typeof state.downloadTasks === "object" ? state.downloadTasks : {});
  state.downloadSnapshots = Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots.slice(-30) : [];
  state.downloadDeletedTaskIds = Array.isArray(state.downloadDeletedTaskIds) ? state.downloadDeletedTaskIds.slice(-120).map(String) : [];
  if (autoCleaned) await saveState({ ...state, autoCleanedThisLoad: false });
  return state;
}

function sanitizeState(state) {
  return {
    ...state,
    remote: publicRemoteConfig(state.remote),
    accountPool: (state.accountPool || []).map(publicAccount),
    fullDetails: (state.fullDetails || []).slice(-80),
    downloadTasks: state.downloadTasks && typeof state.downloadTasks === "object" ? state.downloadTasks : {},
    downloadSnapshots: Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots.slice(-30) : []
  };
}

async function saveState(state) {
  const nextState = { ...state, storageSchemaVersion: STORAGE_SCHEMA_VERSION };
  await chrome.storage.local.set({ txzzState: nextState });
  return nextState;
}

async function resetAllLocalData() {
  await chrome.storage.local.clear();
  const state = {
    ...DEFAULT_STATE,
    accountPool: DEFAULT_ACCOUNTS.map((item) => ({ ...item })),
    remote: { ...REMOTE_CONFIG },
    fullDetails: [],
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
    throw new Error(`${endpoint} failed: ${msg}`);
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

function fixtureFullDetail(movieId) {
  return {
    id: String(movieId),
    has_buy: "y",
    layer_type: "",
    money: "0",
    old_money: "0",
    balance: "999",
    play_link: "/vod/demo/full.m3u8",
    backup_link: "/vod/demo/full-backup.m3u8",
    title: "txzz fixture full detail"
  };
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

function isDownloadRunning(task = {}) {
  return ["queued", "playlist", "segments", "segment"].includes(String(task.stage || ""));
}

function isDownloadReady(task = {}) {
  return ["ready", "complete"].includes(String(task.stage || "")) || Boolean(task.objectReady);
}

function compactDownloadTasks(tasks = {}) {
  const grouped = new Map();
  for (const [key, task] of Object.entries(tasks || {})) {
    if (!task || typeof task !== "object") continue;
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
    justification: "用于在扩展后台把完整 m3u8 分片合并成可下载文件"
  });
}

function looksPlayableLink(value) {
  const text = String(value || "").trim();
  return /(?:\.m3u8|\.mp4|\/m3u8\/|\/h5\/m3u8\/|\/vod\/|\/video\/|\/media\/|\/link\/)/i.test(text);
}

function collectPlayableLinks(value, bucket = [], trail = []) {
  if (!value || bucket.length >= 16) return bucket;
  if (typeof value === "string") {
    const keyHint = trail.join(".").toLowerCase();
    if (looksPlayableLink(value) && /play|backup|m3u8|mp4|video|media|source|src|url|link|file/.test(keyHint)) {
      bucket.push({ key: keyHint, url: value.trim() });
    }
    return bucket;
  }
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) => collectPlayableLinks(item, bucket, [...trail, String(index)]));
    return bucket;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (bucket.length >= 16) break;
      collectPlayableLinks(item, bucket, [...trail, key]);
    }
  }
  return bucket;
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
    detail.url,
    detail.src,
    detail.source,
    detail.file
  ].find(looksPlayableLink);
  const directBackup = [
    detail.backup_link,
    detail.backupLink,
    detail.backup_url,
    detail.backupUrl,
    detail.second_play_link,
    detail.secondPlayLink
  ].find(looksPlayableLink);
  const playLink = detail.play_link || directPlay || links.find((item) => /play|m3u8|mp4|video|media|source|src|url|link|file/.test(item.key))?.url || "";
  const backupLink = detail.backup_link || directBackup || links.find((item) => /backup|second|spare|mirror/.test(item.key))?.url || "";
  return {
    ...detail,
    play_link: playLink || detail.play_link || "",
    backup_link: backupLink || detail.backup_link || ""
  };
}

function normalizeFullDetailResponse(response = {}) {
  const detail = normalizeFullDetail(response.detail || response.data || null);
  if (!detail) return response;
  const summary = {
    ...(response.summary || {}),
    playLink: response.summary?.playLink || detail.play_link || "",
    backupLink: response.summary?.backupLink || detail.backup_link || ""
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
  return Boolean(looksPlayableLink(normalized?.play_link) || looksPlayableLink(normalized?.backup_link));
}

function isLockedCoinVideo(detail = null) {
  const normalized = normalizeFullDetail(detail);
  return normalized?.has_buy !== "y" && normalized?.layer_type === "money" && Number(normalized?.money || 0) > 0;
}

async function statM3u8(link) {
  if (!link) return null;
  const url = absoluteUrl(link);
  try {
    const response = await fetch(url);
    const text = await response.text();
    const durations = [...text.matchAll(/#EXTINF:([0-9.]+)/g)].map((match) => Number(match[1]));
    return {
      url,
      status: response.status,
      segments: durations.length,
      duration: Number(durations.reduce((sum, item) => sum + item, 0).toFixed(3))
    };
  } catch (err) {
    return { url, error: err?.message || String(err) };
  }
}

async function statM3u8Quick(link, timeoutMs = 2500) {
  if (!link) return null;
  const url = absoluteUrl(link);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    const text = await response.text();
    const durations = [...text.matchAll(/#EXTINF:([0-9.]+)/g)].map((match) => Number(match[1]));
    return {
      url,
      status: response.status,
      segments: durations.length,
      duration: Number(durations.reduce((sum, item) => sum + item, 0).toFixed(3))
    };
  } catch (err) {
    return { url, error: err?.name === "AbortError" ? `timeout ${timeoutMs}ms` : err?.message || String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getFullDetail(message = {}) {
  const movieId = String(message.movieId || message.id || "").trim();
  if (!movieId) throw new Error("缺少视频编号 movieId");

  const state = await getStateInternal();
  const visitorDetail = message.visitorDetail || null;
  const remote = normalizeRemoteConfig(state.remote);
  const sourceMode = remote.accountSourceMode || "cloud";
  let remoteError = null;
  if (sourceMode !== "local" && remote.enabled && remote.baseUrl && !visitorDetail?.__txzzFixture) {
    try {
      const response = normalizeFullDetailResponse(await remoteRequest(state, "/v1/movie/full-detail", {
        method: "POST",
        body: JSON.stringify({
          movieId,
          visitorDetail,
          accountMode: sourceMode,
          accountId: "",
          bootstrapSession: message.bootstrapSession || message.session || null
        })
      }));
      const fresh = await getStateInternal();
      if (response.state?.accountPool) fresh.accountPool = response.state.accountPool.map(normalizeAccount);
      if (response.state?.selectedFullAccountId) fresh.selectedFullAccountId = response.state.selectedFullAccountId;
      if (response.summary) fresh.fullDetails = [...(fresh.fullDetails || []), response.summary].slice(-80);
      fresh.remote = { ...normalizeRemoteConfig(fresh.remote), lastFullDetailAt: nowIso(), lastError: "" };
      await saveState(fresh);
      return { ...response, state: sanitizeState(fresh) };
    } catch (err) {
      remoteError = err;
      state.remote = { ...normalizeRemoteConfig(state.remote), lastError: err?.message || String(err) };
      await saveState(state);
      if (sourceMode !== "cloud-first" && !remote.fallbackLocal) throw err;
    }
  }
  const cacheKey = `${message.accountId || state.selectedFullAccountId || "default"}:${movieId}`;
  const cached = state.fullDetailCache?.[cacheKey];
  if (cached?.detail && playableDetailReady(cached.detail) && Date.now() - Number(cached.cachedAt || 0) < 10 * 60 * 1000) {
    return {
      ok: true,
      detail: cached.detail,
      data: cached.detail,
      summary: { ...cached.summary, cacheHit: true },
      account: cached.account || null,
      state: sanitizeState(state)
    };
  }
  if (visitorDetail?.__txzzFixture) {
    const detail = fixtureFullDetail(movieId);
    const account = { id: "fixture-full", label: "fixture-full", username: "fixture-full" };
    const session = { deviceId: "fixture-device", userToken: "fixture-token_1001", userInfo: { username: "fixture-full" } };
    return await finishLocalFullDetail({ state, movieId, detail, account, session, action: "fixture_full_detail", fixtureMode: true, cacheKey });
  }

  const localAccounts = sortAccountsByCoin((state.accountPool || []).filter((item) => !isCloudAccount(item) && isHealthyAccount(item)));
  const selectedLocal = localAccounts.find((item) => item.id === (message.accountId || state.selectedFullAccountId));
  const candidates = selectedLocal ? [selectedLocal, ...localAccounts.filter((item) => item.id !== selectedLocal.id)] : localAccounts;
  if (!candidates.length) {
    if (remoteError) throw new Error(`远程账号池失败：${remoteError?.message || remoteError}；本地账号池为空，无法获取播放详情`);
    throw new Error("账号池为空，无法获取播放详情");
  }

  const errors = [];
  const lockedCandidates = [];
  const checkedAccountIds = new Set();
  for (const candidate of candidates) {
    try {
      const verified = await updateAccountSession(candidate.id, message.bootstrapSession || message.session || null);
      const latest = await getStateInternal();
      const account = latest.accountPool.find((item) => item.id === candidate.id) || candidate;
      const session = verified.session;
      const detail = normalizeFullDetail(await apiRequest("/movie/detail", { id: movieId }, session));
      checkedAccountIds.add(candidate.id);
      if (isLockedCoinVideo(detail)) {
        lockedCandidates.push({ account, session, detail });
        continue;
      }
      if (!playableDetailReady(detail)) throw new Error("播放详情未返回可播放链接");
      return await finishLocalFullDetail({ state: latest, movieId, detail, account, session, action: "direct_full_detail", cacheKey, errors, checkedAccountIds });
    } catch (err) {
      errors.push({ accountId: candidate.id, label: candidate.label, error: err?.message || String(err) });
    }
  }
  if (lockedCandidates.length) {
    for (const item of lowestCoinRandomOrder(lockedCandidates.map((entry) => entry.account))
      .map((account) => lockedCandidates.find((entry) => entry.account.id === account.id))
      .filter(Boolean)) {
      try {
        await apiRequest("/movie/doBuy", { id: movieId }, item.session);
        const detail = normalizeFullDetail(await apiRequest("/movie/detail", { id: movieId }, item.session));
        if (isLockedCoinVideo(detail)) throw new Error("购买后仍显示未购买");
        if (!playableDetailReady(detail)) throw new Error("购买后播放详情未返回可播放链接");
        const latest = await getStateInternal();
        const account = latest.accountPool.find((entry) => entry.id === item.account.id) || item.account;
        return await finishLocalFullDetail({
          state: latest,
          movieId,
          detail,
          account,
          session: item.session,
          action: "buy_then_full_detail",
          cacheKey,
          errors,
          checkedAccountIds,
          purchaseMeta: {
            purchasePolicy: "all_accounts_checked_then_lowest_coin",
            purchasedByCoin: accountCoinValue(account, null),
            lockedAccounts: lockedCandidates.length
          }
        });
      } catch (err) {
        errors.push({ accountId: item.account.id, label: item.account.label, error: err?.message || String(err), stage: "buy" });
      }
    }
  }
  const messageText = `本地账号池全部失败：${JSON.stringify(errors.slice(-8))}`;
  if (remoteError) throw new Error(`远程账号池失败：${remoteError?.message || remoteError}；${messageText}`);
  throw new Error(messageText);
}

async function finishLocalFullDetail(options = {}) {
  const { state, movieId, detail, account, session, action, fixtureMode = false, cacheKey, errors = [], checkedAccountIds = new Set(), purchaseMeta = {} } = options;
  const [fullStat, backupStat] = fixtureMode
    ? [
        { url: absoluteUrl(detail?.play_link), status: 200, segments: 3, duration: 28.5 },
        { url: absoluteUrl(detail?.backup_link), status: 200, segments: 3, duration: 28.5 }
      ]
    : [
        detail?.play_link ? { url: absoluteUrl(detail.play_link), pending: true } : null,
        detail?.backup_link ? { url: absoluteUrl(detail.backup_link), pending: true } : null
      ];
  const summary = {
    movieId,
    action,
    accountId: account.id,
    accountLabel: account.label,
    accountUser: account.username || accountName(session?.userInfo),
    hasBuy: detail?.has_buy,
    layerType: detail?.layer_type,
    money: detail?.money,
    oldMoney: detail?.old_money,
    balance: detail?.balance,
    playLink: detail?.play_link,
    backupLink: detail?.backup_link,
    fullStat,
    backupStat,
    fetchedAt: nowIso(),
    rotation: {
      accountId: account.id,
      tried: checkedAccountIds.size || errors.length + 1,
      failed: errors,
      coinSort: true,
      ...purchaseMeta
    }
  };
  const fresh = await getStateInternal();
  fresh.selectedFullAccountId = account.id || fresh.selectedFullAccountId;
  fresh.fullDetails = [...(fresh.fullDetails || []), summary].slice(-80);
  fresh.fullDetailCache = {
    ...(fresh.fullDetailCache || {}),
    [cacheKey || `${account.id || "default"}:${movieId}`]: {
      cachedAt: Date.now(),
      detail,
      summary,
      account: publicAccount(account)
    }
  };
  const cacheEntries = Object.entries(fresh.fullDetailCache);
  if (cacheEntries.length > 120) fresh.fullDetailCache = Object.fromEntries(cacheEntries.slice(-120));
  await saveState(fresh);
  if (!fixtureMode && (detail?.play_link || detail?.backup_link)) {
    Promise.all([statM3u8Quick(detail?.play_link), statM3u8Quick(detail?.backup_link)])
      .then(async ([resolvedFullStat, resolvedBackupStat]) => {
        const latest = await getStateInternal();
        latest.fullDetails = (latest.fullDetails || []).map((item) => {
          if (String(item.movieId) !== String(movieId) || item.fetchedAt !== summary.fetchedAt) return item;
          return { ...item, fullStat: resolvedFullStat || item.fullStat, backupStat: resolvedBackupStat || item.backupStat };
        });
        await saveState(latest);
      })
      .catch(() => {});
  }
  return { ok: true, detail, data: detail, summary, account: publicAccount(account), state: sanitizeState(fresh) };
}

async function downloadFullVideo(message = {}) {
  const movieId = String(message.movieId || message.id || "").trim();
  if (!movieId) throw new Error("缺少视频编号 movieId");
  const full = await getFullDetail(message);
  const detail = normalizeFullDetail(full.detail || full.data || {});
  const summary = full.summary || {};
  const link = detail.play_link || summary.playLink || detail.backup_link || summary.backupLink || "";
  if (!link) throw new Error("播放详情没有返回可下载播放链接");
  const url = absoluteUrl(link);
  const ext = linkExtension(url);
  const title = displayMovieTitle(detail, summary, message.title || message.movieTitle || "");
  const titleSnippet = downloadTitleSnippet(title, movieId);
  const filename = downloadFileName(movieId, "mp4", title);
  const taskId = downloadTaskId(movieId);
  const existingState = await getStateInternal();
  const existingTask = existingState.downloadTasks?.[taskId];
  if (isDownloadRunning(existingTask)) {
    return { ok: true, reused: true, mode: existingTask.mode || (ext === "mp4" ? "direct" : "m3u8-merged-ts"), url: existingTask.url || url, filename: existingTask.filename || filename, taskId, summary, state: sanitizeState(existingState) };
  }
  existingState.downloadDeletedTaskIds = (existingState.downloadDeletedTaskIds || []).filter((id) => id !== taskId);
  await saveState(existingState);
  if (ext === "mp4") {
    const ready = await getStateInternal();
    ready.downloadDeletedTaskIds = (ready.downloadDeletedTaskIds || []).filter((id) => id !== taskId);
    ready.downloadTasks = {
      ...(ready.downloadTasks || {}),
      [taskId]: {
        ...(ready.downloadTasks?.[taskId] || {}),
        taskId,
        movieId,
        movieTitle: title,
        titleSnippet,
        mode: "direct",
        stage: "ready",
        current: 1,
        total: 1,
        filename,
        url,
        objectReady: true,
        updatedAt: nowIso()
      }
    };
    await saveState(ready);
    return { ok: true, mode: "direct", ready: true, url, filename, taskId, summary, state: sanitizeState(ready) };
  }
  await ensureOffscreenDocument();
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
      mode: "m3u8-merged-ts",
      stage: "queued",
      current: 0,
      total: 0,
      filename,
      url,
      updatedAt: nowIso()
    }
  };
  await saveState(queued);
  chrome.runtime.sendMessage({
    type: "offscreenDownloadM3u8",
    taskId,
    movieId,
    movieTitle: title,
    titleSnippet,
    url,
    filename,
    saveAs: false
  }).then(async (result) => {
    if (result?.ok === false) throw new Error(result.error || "视频下载失败");
    if (result?.started) return;
  }).catch(async (err) => {
    const failed = await getStateInternal();
    failed.downloadTasks = {
      ...(failed.downloadTasks || {}),
      [taskId]: {
        ...(failed.downloadTasks?.[taskId] || {}),
        taskId,
        movieId,
        movieTitle: title,
        titleSnippet,
        mode: "m3u8-merged-ts",
        stage: "error",
        filename,
        url,
        error: err?.message || String(err),
        updatedAt: nowIso()
      }
    };
    await saveState(failed);
  });
  return { ok: true, mode: "m3u8-merged-ts", queued: true, url, filename, taskId, summary, state: sanitizeState(queued) };
}

async function recordDownloadProgress(message = {}) {
  const state = await getStateInternal();
  const taskId = String(message.taskId || "");
  if (!taskId) return { ok: true };
  if ((state.downloadDeletedTaskIds || []).includes(taskId)) return { ok: true, ignored: true };
  state.downloadTasks = {
    ...(state.downloadTasks || {}),
    [taskId]: {
      ...(state.downloadTasks?.[taskId] || {}),
      type: "offscreenDownloadM3u8",
      taskId,
      movieId: String(message.movieId || state.downloadTasks?.[taskId]?.movieId || ""),
      mode: String(message.mode || state.downloadTasks?.[taskId]?.mode || "m3u8-merged-ts"),
      stage: message.stage || "",
      current: Number(message.current || 0),
      total: Number(message.total || 0),
      movieTitle: String(message.movieTitle || state.downloadTasks?.[taskId]?.movieTitle || ""),
      titleSnippet: String(message.titleSnippet || state.downloadTasks?.[taskId]?.titleSnippet || ""),
      filename: String(message.filename || state.downloadTasks?.[taskId]?.filename || ""),
      url: String(message.url || state.downloadTasks?.[taskId]?.url || ""),
      error: String(message.error || ""),
      downloadId: message.downloadId || state.downloadTasks?.[taskId]?.downloadId || null,
      bytes: Number(message.bytes || state.downloadTasks?.[taskId]?.bytes || 0),
      objectReady: message.stage === "ready" || Boolean(message.objectReady || state.downloadTasks?.[taskId]?.objectReady),
      saveVia: String(message.saveVia || state.downloadTasks?.[taskId]?.saveVia || ""),
      format: String(message.format || state.downloadTasks?.[taskId]?.format || ""),
      transmuxError: String(message.transmuxError || state.downloadTasks?.[taskId]?.transmuxError || ""),
      updatedAt: nowIso()
    }
  };
  const entries = Object.entries(state.downloadTasks);
  if (entries.length > 40) state.downloadTasks = Object.fromEntries(entries.slice(-40));
  state.downloadTasks = compactDownloadTasks(state.downloadTasks);
  await saveState(state);
  return { ok: true };
}

async function saveDownloadToDevice(taskId = "") {
  const state = await getStateInternal();
  const task = state.downloadTasks?.[taskId];
  if (!task) throw new Error("未找到下载任务");
  if (task.stage === "error") throw new Error(task.error || "该任务失败，不能保存");
  if (isDownloadRunning(task)) throw new Error("任务仍在下载或合并中，请等待显示可保存后再操作");
  if (task.mode === "direct") {
    const downloadId = await chrome.downloads.download({ url: task.url, filename: task.filename || undefined, saveAs: true });
    const fresh = await getStateInternal();
    fresh.downloadTasks = {
      ...(fresh.downloadTasks || {}),
      [taskId]: {
        ...(fresh.downloadTasks?.[taskId] || task),
        stage: "complete",
        downloadId,
        objectReady: true,
        updatedAt: nowIso()
      }
    };
    await saveState(fresh);
    return { ok: true, downloadId, state: sanitizeState(fresh) };
  }
  if (task.mode === "m3u8-merged-ts") {
    await ensureOffscreenDocument();
    const result = await chrome.runtime.sendMessage({
      type: "offscreenSaveMergedDownload",
      taskId,
      url: task.url,
      saveAs: false
    });
    if (result?.ok === false) throw new Error(result.error || "保存合并视频失败");
    const fresh = await getStateInternal();
    fresh.downloadTasks = {
      ...(fresh.downloadTasks || {}),
      [taskId]: {
        ...(fresh.downloadTasks?.[taskId] || task),
        stage: "complete",
        downloadId: result.downloadId || null,
        bytes: result.bytes || task.bytes || 0,
        current: result.segments || task.current || 0,
        total: result.segments || task.total || 0,
        saveVia: result.saveVia || "",
        format: result.format || fresh.downloadTasks?.[taskId]?.format || "",
        transmuxError: result.transmuxError || fresh.downloadTasks?.[taskId]?.transmuxError || "",
        objectReady: true,
        updatedAt: nowIso()
      }
    };
    await saveState(fresh);
    return { ok: true, ...result, state: sanitizeState(fresh) };
  }
  throw new Error(`未知下载模式：${task.mode || ""}`);
}

async function removeDownloadTask(taskId = "", movieId = "") {
  const state = await getStateInternal();
  const targetMovieId = String(movieId || state.downloadTasks?.[taskId]?.movieId || "");
  const deletedIds = new Set((state.downloadDeletedTaskIds || []).map(String));
  for (const [key, task] of Object.entries(state.downloadTasks || {})) {
    if (key === taskId || (targetMovieId && String(task.movieId || "") === targetMovieId)) {
      deletedIds.add(key);
      delete state.downloadTasks[key];
      chrome.runtime.sendMessage({ type: "offscreenDeleteDownloadTask", taskId: key }).catch(() => {});
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
    running: tasks.filter((task) => ["queued", "playlist", "segments", "segment"].includes(String(task.stage || ""))).length,
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

function parseChangelogEntries(markdown = "") {
  const text = String(markdown || "").replace(/\r/g, "");
  const marker = text.match(/(?:^|\n)##\s*更新日志\s*\n([\s\S]*)$/);
  const body = marker ? marker[1] : text;
  return body.split("\n")
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+【.+?】/.test(item))
    .map((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(【.+?】)\s*(.*)$/);
      return {
        id: line,
        line,
        time: match?.[1] || "",
        type: match?.[2] || "",
        text: match?.[3] || line
      };
    })
    .sort((a, b) => compareChangelogTime(b, a));
}

function parseChangelogHead(markdown = "") {
  return parseChangelogEntries(markdown)[0] || null;
}

function compareChangelogTime(a = {}, b = {}) {
  const at = Date.parse(String(a.time || "").replace(" ", "T"));
  const bt = Date.parse(String(b.time || "").replace(" ", "T"));
  if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;
  return String(a.line || "").localeCompare(String(b.line || ""), "zh-CN");
}

function parseVersionParts(version = "") {
  return String(version || "")
    .split(".")
    .map((item) => Number.parseInt(item.replace(/[^\d]/g, ""), 10))
    .map((item) => Number.isFinite(item) ? item : 0);
}

function compareVersions(a = "", b = "") {
  const av = parseVersionParts(a);
  const bv = parseVersionParts(b);
  const len = Math.max(av.length, bv.length, 3);
  for (let i = 0; i < len; i += 1) {
    const diff = (av[i] || 0) - (bv[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function localExtensionVersion() {
  try {
    return chrome.runtime.getManifest()?.version || "";
  } catch (_) {
    return "";
  }
}

function normalizeRemoteUpdateManifest(raw = {}) {
  const changelog = Array.isArray(raw.changelog) ? raw.changelog : [];
  const latest = changelog[0] || {};
  const version = String(raw.version || "").trim();
  const build = String(raw.build || "").trim();
  return {
    schema: Number(raw.schema || 1),
    name: String(raw.name || "糖心志者"),
    version,
    build,
    releasedAt: String(raw.releasedAt || ""),
    homepage: String(raw.homepage || REPOSITORY_CONFIG.url),
    changelog,
    latest,
    id: [version, build, latest.id || latest.title || ""].filter(Boolean).join("|")
  };
}

async function fetchRemoteUpdateManifest(options = {}) {
  const url = options.force
    ? `${REPOSITORY_CONFIG.updateManifestUrl}?txzz_update=${Date.now()}`
    : REPOSITORY_CONFIG.updateManifestUrl;
  const text = await fetchTextWithTimeout(url);
  const parsed = JSON.parse(text);
  const manifest = normalizeRemoteUpdateManifest(parsed);
  if (!manifest.version || !manifest.build) throw new Error("远程 update.json 缺少 version 或 build");
  return manifest;
}

function shouldUpdateByManifest(remote = {}, localVersion = localExtensionVersion(), localBuild = LOCAL_UPDATE_BUILD) {
  const versionDiff = compareVersions(remote.version, localVersion);
  if (versionDiff > 0) return true;
  if (versionDiff < 0) return false;
  return Boolean(remote.build && remote.build !== localBuild);
}

async function fetchTextWithTimeout(url, timeoutMs = REPOSITORY_CONFIG.timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      headers: { "cache-control": "no-cache" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchRemoteReadme() {
  const errors = [];
  for (const url of REPOSITORY_CONFIG.readmeUrls) {
    try {
      return { url, text: await fetchTextWithTimeout(url) };
    } catch (err) {
      errors.push(`${url}: ${err?.message || String(err)}`);
    }
  }
  throw new Error(`远程 README 读取失败：${errors.join("；")}`);
}

async function getLocalChangelogEntries() {
  try {
    const url = chrome.runtime.getURL("README.md");
    const response = await fetch(url, { cache: "no-cache" });
    if (response.ok) {
      const parsed = parseChangelogEntries(await response.text());
      if (parsed.length) return parsed;
    }
  } catch (_) {}
  return parseChangelogEntries(FALLBACK_LOCAL_CHANGELOG_HEAD);
}

async function checkRepositoryUpdate(options = {}) {
  const stored = await chrome.storage.local.get("txzzUpdateState");
  const updateState = stored.txzzUpdateState || {};
  const now = Date.now();
  const cached = updateState.lastUpdateResult || {};
  const cacheMatchesLocal = cached.local?.version === localExtensionVersion() && cached.local?.build === LOCAL_UPDATE_BUILD;
  if (!options.force && cacheMatchesLocal && updateState.lastCheckedAt && now - Number(updateState.lastCheckedAt || 0) < REPOSITORY_CONFIG.checkIntervalMs) {
    return {
      ok: true,
      skipped: true,
      fromCache: true,
      updateAvailable: Boolean(cached.updateAvailable),
      shouldNotify: Boolean(cached.updateAvailable),
      ...cached,
      updateState
    };
  }
  try {
    const remoteManifest = await fetchRemoteUpdateManifest({ force: Boolean(options.force) });
    const localVersion = localExtensionVersion();
    const localBuild = LOCAL_UPDATE_BUILD;
    const updateAvailable = shouldUpdateByManifest(remoteManifest, localVersion, localBuild);
    const updateId = remoteManifest.id || `${remoteManifest.version}|${remoteManifest.build}`;
    const shouldNotify = Boolean(updateAvailable);
    const latest = remoteManifest.latest || {};
    const remote = {
      id: updateId,
      line: `${remoteManifest.releasedAt || remoteManifest.build} 【${latest.type || "更新"}】${latest.title || "发现新版本"}`,
      time: remoteManifest.releasedAt || "",
      type: `【${latest.type || "更新"}】`,
      text: latest.detail || latest.title || "远程版本清单已发布新版本。",
      title: latest.title || "发现新版本",
      detail: latest.detail || "",
      version: remoteManifest.version,
      build: remoteManifest.build,
      releasedAt: remoteManifest.releasedAt
    };
    const result = {
      source: "update.json",
      updateAvailable,
      shouldNotify,
      repositoryUrl: remoteManifest.homepage || REPOSITORY_CONFIG.url,
      local: { version: localVersion, build: localBuild },
      remote,
      updateManifest: remoteManifest
    };
    const nextUpdateState = {
      ...updateState,
      lastCheckedAt: now,
      lastRemoteId: updateId,
      lastRemoteLine: remote.line,
      lastUpdateManifestUrl: REPOSITORY_CONFIG.updateManifestUrl,
      lastUpdateResult: result
    };
    await chrome.storage.local.set({ txzzUpdateState: nextUpdateState });
    return {
      ok: true,
      skipped: false,
      ...result,
      updateState: nextUpdateState
    };
  } catch (manifestErr) {
    if (options.manifestOnly) throw manifestErr;
    updateState.lastManifestError = manifestErr?.message || String(manifestErr);
  }
  const localEntries = await getLocalChangelogEntries();
  const local = localEntries[0] || null;
  const localIds = new Set(localEntries.map((entry) => entry.id));
  const remoteReadme = await fetchRemoteReadme();
  const remoteEntries = parseChangelogEntries(remoteReadme.text);
  const remote = remoteEntries.find((entry) => !localIds.has(entry.id)) || null;
  if (!remoteEntries.length) throw new Error("远程 README 没有解析到更新日志");
  const updateAvailable = Boolean(remote);
  const shouldNotify = Boolean(updateAvailable && remote);
  const result = {
    updateAvailable,
    shouldNotify,
    repositoryUrl: REPOSITORY_CONFIG.url,
    local,
    localCount: localEntries.length,
    remote,
    remoteHead: remoteEntries[0] || null,
    remoteCount: remoteEntries.length,
    readmeUrl: remoteReadme.url
  };
  const nextUpdateState = {
    ...updateState,
    lastCheckedAt: now,
    lastRemoteId: remoteEntries[0]?.id || "",
    lastRemoteLine: remoteEntries[0]?.line || "",
    lastReadmeUrl: remoteReadme.url,
    lastUpdateResult: result
  };
  await chrome.storage.local.set({ txzzUpdateState: nextUpdateState });
  return {
    ok: true,
    skipped: false,
    ...result,
    updateState: nextUpdateState
  };
}

async function markRepositoryUpdateNotified(updateId = "", mode = "notified") {
  const stored = await chrome.storage.local.get("txzzUpdateState");
  const updateState = stored.txzzUpdateState || {};
  const key = mode === "dismissed" ? "dismissedId" : "notifiedId";
  const next = {
    ...updateState,
    [key]: String(updateId || updateState.lastRemoteId || ""),
    [`${key}At`]: Date.now()
  };
  await chrome.storage.local.set({ txzzUpdateState: next });
  return { ok: true, updateState: next };
}

async function downloadRepositoryArchive(meta = {}) {
  const filename = "tangxin-zhizhe-extension-main.zip";
  const downloadId = await chrome.downloads.download({
    url: REPOSITORY_CONFIG.archiveUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
  return { ok: true, downloadId, filename, url: REPOSITORY_CONFIG.archiveUrl };
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
  const account = normalizeAccount(raw);
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
  const incoming = normalizeRemoteConfig({
    ...state.remote,
    ...remote
  });
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
  state.accountPool = state.accountPool.filter((item) => item.id !== accountId || item.source === "seed");
  if (!state.accountPool.some((item) => item.id === state.selectedFullAccountId)) {
    state.selectedFullAccountId = state.accountPool[0]?.id || "";
  }
  await saveState(state);
  return { ok: true, state: sanitizeState(state) };
}

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
    if (message?.type === "saveRemoteConfig") {
      sendResponse(await saveRemoteConfig(message.remote || {}));
      return;
    }
    if (message?.type === "syncRemoteAccounts") {
      const state = await syncRemoteAccounts(await getStateInternal());
      sendResponse({ ok: true, state: sanitizeState(state) });
      return;
    }
    if (message?.type === "checkRepositoryUpdate") {
      sendResponse(await checkRepositoryUpdate({ force: Boolean(message.force) }));
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
      const state = await saveState({ ...DEFAULT_STATE, accountPool: DEFAULT_ACCOUNTS });
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
      const result = await updateAccountSession(String(message.accountId || ""), message.bootstrapSession || message.session || null);
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
    if (message?.type === "downloadFullVideo") {
      sendResponse(await downloadFullVideo(message));
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
    sendResponse({ ok: false, error: `unknown message: ${message?.type || ""}` });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
