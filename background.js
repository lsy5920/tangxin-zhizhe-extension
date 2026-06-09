"use strict";

const API_CONFIG = {
  baseUrl: "https://txh068.com",
  version: "4.76",
  source: "Apple Computer, Inc.",
  aesKey: "fd14f9f8e38808fa"
};

const STORAGE_SCHEMA_VERSION = "2026-06-09-auto-cache-v1";
const LEGACY_REMOTE_BASE_URLS = [
  "https://txzz.lsy20.top"
];

const REMOTE_CONFIG = {
  baseUrl: "https://txzz-secure-pool.3199912548.workers.dev",
  clientToken: "txzz_client_91ee115d9bf5c8e800f2def383f9da71d449fb2a11ccba455c9abb7c590701f2",
  adminToken: "",
  enabled: true,
  accountSourceMode: "cloud",
  fallbackLocal: true
};

const DEFAULT_ACCOUNTS = [
  {
    id: "full-lsyhook",
    label: "lsyhook 完整权限",
    username: "lsyhook",
    password: "",
    role: "full",
    enabled: true,
    source: "remote-seed",
    deviceId: "",
    userToken: "",
    qrcode: "",
    notes: "远程完整权限种子账号"
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
    fullDetailCache: {}
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

function summarizeUserInfo(info) {
  if (!info) return null;
  return {
    id: info.id,
    username: info.username,
    account_name: info.account_name,
    nickname: info.nickname,
    balance: info.balance,
    balance_income: info.balance_income,
    is_vip: info.is_vip,
    is_dark_vip: info.is_dark_vip,
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
  return {
    id,
    label: String(raw.label || username || id || "完整权限账号").trim(),
    username,
    password: String(raw.password || ""),
    qrcode: String(raw.qrcode || ""),
    role: "full",
    enabled: raw.enabled !== false,
    source: String(raw.source || "manual"),
    deviceId: String(raw.deviceId || ""),
    userToken: String(raw.userToken || raw.token || ""),
    notes: String(raw.notes || ""),
    userInfo: raw.userInfo || null,
    lastVerifiedAt: raw.lastVerifiedAt || "",
    lastError: raw.lastError || "",
    status: raw.status || "idle"
  };
}

function publicAccount(account) {
  const item = normalizeAccount(account);
  return {
    ...item,
    password: "",
    qrcode: "",
    userToken: "",
    hasPassword: Boolean(item.password),
    hasQrcode: Boolean(item.qrcode),
    hasToken: Boolean(item.userToken),
    passwordMasked: item.password ? "********" : "",
    qrcodeMasked: item.qrcode ? mask(item.qrcode, 8, 6) : "",
    tokenMasked: item.userToken ? mask(item.userToken, 12, 8) : "",
    userInfo: summarizeUserInfo(item.userInfo)
  };
}

function normalizeRemoteConfig(remote = {}) {
  const mode = ["cloud", "cloud-fixed", "local", "cloud-first"].includes(remote?.accountSourceMode)
    ? remote.accountSourceMode
    : REMOTE_CONFIG.accountSourceMode;
  return {
    ...REMOTE_CONFIG,
    ...(remote || {}),
    baseUrl: String(remote?.baseUrl || REMOTE_CONFIG.baseUrl || "").replace(/\/+$/, ""),
    clientToken: String(remote?.clientToken || REMOTE_CONFIG.clientToken || ""),
    adminToken: String(remote?.adminToken || REMOTE_CONFIG.adminToken || ""),
    enabled: remote?.enabled !== false,
    accountSourceMode: mode,
    fixedAccountId: String(remote?.fixedAccountId || ""),
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
  return source === "remote" || source === "qrcode" || source === "remote-seed";
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
      adminToken: previousRemote.adminToken || "",
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
    clientToken: "",
    adminToken: "",
    hasClientToken: Boolean(normalized.clientToken),
    hasAdminToken: Boolean(normalized.adminToken),
    clientTokenMasked: normalized.clientToken ? mask(normalized.clientToken, 8, 4) : "",
    adminTokenMasked: normalized.adminToken ? mask(normalized.adminToken, 8, 4) : ""
  };
}

function remoteHeaders(remote, admin = false) {
  const headers = { "Content-Type": "application/json" };
  if (remote.clientToken) headers["X-TXZZ-Client-Token"] = remote.clientToken;
  if (admin && remote.adminToken) headers["X-TXZZ-Admin-Token"] = remote.adminToken;
  return headers;
}

async function remoteRequest(state, endpoint, options = {}) {
  const remote = normalizeRemoteConfig(state.remote);
  if (!remote.enabled || !remote.baseUrl) throw new Error("remote worker is not configured");
  const { admin, ...fetchOptions } = options;
  const res = await fetch(`${remote.baseUrl}${endpoint}`, {
    ...fetchOptions,
    headers: {
      ...remoteHeaders(remote, Boolean(admin)),
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
        merged.set(account.id, normalizeAccount({ ...account, source: account.source || "remote" }));
      }
      state.accountPool = Array.from(merged.values());
      state.remote.lastSyncAt = nowIso();
      state.remote.lastError = "";
      const fixedId = state.remote.fixedAccountId || "";
      if (state.remote.accountSourceMode === "cloud-fixed" && fixedId && state.accountPool.some((item) => item.id === fixedId)) {
        state.selectedFullAccountId = fixedId;
      } else if (!state.selectedFullAccountId || !state.accountPool.some((item) => item.id === state.selectedFullAccountId)) {
        state.selectedFullAccountId = data.accounts[0]?.id || state.accountPool[0]?.id || "";
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
  if (autoCleaned) await saveState({ ...state, autoCleanedThisLoad: false });
  return state;
}

function sanitizeState(state) {
  return {
    ...state,
    remote: publicRemoteConfig(state.remote),
    accountPool: (state.accountPool || []).map(publicAccount),
    fullDetails: (state.fullDetails || []).slice(-80)
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
          accountId: sourceMode === "cloud-fixed" ? (remote.fixedAccountId || state.selectedFullAccountId || "") : "",
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
  if (cached?.detail && Date.now() - Number(cached.cachedAt || 0) < 10 * 60 * 1000) {
    return {
      ok: true,
      detail: cached.detail,
      data: cached.detail,
      summary: { ...cached.summary, cacheHit: true },
      account: cached.account || null,
      state: sanitizeState(state)
    };
  }
  let account = state.accountPool.find((item) => item.id === (message.accountId || state.selectedFullAccountId));
  if (!account) account = state.accountPool[0];
  if (!account) {
    if (remoteError) throw new Error(`远程账号池失败：${remoteError?.message || remoteError}；本地账号池为空，无法获取完整详情`);
    throw new Error("账号池为空，无法获取完整详情");
  }

  let detail = null;
  let action = "direct_full_detail";
  let session = null;
  let fixtureMode = false;

  try {
    if (visitorDetail?.__txzzFixture) {
      detail = fixtureFullDetail(movieId);
      session = { deviceId: "fixture-device", userToken: "fixture-token_1001", userInfo: { username: "fixture-full" } };
      action = "fixture_full_detail";
      fixtureMode = true;
    } else {
      const verified = await updateAccountSession(account.id, message.bootstrapSession || message.session || null);
      session = verified.session;
      account = state.accountPool.find((item) => item.id === account.id) || account;
      detail = normalizeFullDetail(await apiRequest("/movie/detail", { id: movieId }, session));
      if (detail?.has_buy !== "y" && detail?.layer_type === "money" && Number(detail?.money || 0) > 0) {
        action = "buy_then_full_detail";
        await apiRequest("/movie/doBuy", { id: movieId }, session);
        detail = normalizeFullDetail(await apiRequest("/movie/detail", { id: movieId }, session));
      }
    }
  } catch (err) {
    if (remoteError) throw new Error(`远程账号池失败：${remoteError?.message || remoteError}；本地兜底失败：${err?.message || err}`);
    throw err;
  }

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
    fetchedAt: nowIso()
  };

  const fresh = await getStateInternal();
  fresh.fullDetails = [...(fresh.fullDetails || []), summary].slice(-80);
  fresh.fullDetailCache = {
    ...(fresh.fullDetailCache || {}),
    [cacheKey]: {
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
  const response = await remoteRequest(state, "/v1/accounts", {
    method: "POST",
    admin: true,
    body: JSON.stringify({ account })
  });
  const synced = await syncRemoteAccounts(await getStateInternal());
  return { ok: true, account: response.account, state: sanitizeState(synced) };
}

async function saveRemoteConfig(remote = {}) {
  const state = await getStateInternal();
  const incoming = normalizeRemoteConfig({
    ...state.remote,
    ...remote,
    clientToken: remote.clientToken || state.remote?.clientToken || "",
    adminToken: remote.adminToken || state.remote?.adminToken || ""
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
  if (!state.accountPool.some((item) => item.id === accountId)) throw new Error(`未找到账号：${accountId}`);
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
    if (message?.type === "saveRemoteConfig") {
      sendResponse(await saveRemoteConfig(message.remote || {}));
      return;
    }
    if (message?.type === "syncRemoteAccounts") {
      const state = await syncRemoteAccounts(await getStateInternal());
      sendResponse({ ok: true, state: sanitizeState(state) });
      return;
    }
    if (message?.type === "uploadAccountToRemote") {
      sendResponse(await uploadAccountToRemote(message.account || {}));
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
    sendResponse({ ok: false, error: `unknown message: ${message?.type || ""}` });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
