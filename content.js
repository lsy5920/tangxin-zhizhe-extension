"use strict";

(() => {
  if (window.__txzzContentInstalled) return;
  window.__txzzContentInstalled = true;

  function injectMainWorldScript(file, marker) {
    try {
      if (document.documentElement.dataset[marker] === "1") return;
      document.documentElement.dataset[marker] = "1";
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(file);
      script.onload = () => script.remove();
      script.onerror = () => {
        try {
          delete document.documentElement.dataset[marker];
          script.remove();
        } catch (_) {}
      };
      document.documentElement.appendChild(script);
    } catch (_) {}
  }

  injectMainWorldScript("nav_guard.js", "txzzNavGuardInjected");

  const STORAGE_KEY_TOKEN = "fuck";
  const STORAGE_KEY_DEVICE = "sun";
  const CATEGORY_LABELS = {
    "m3u8": "M3U8",
    "mp4": "MP4",
    "segment": "切片",
    "play-api": "播放接口",
    "video-api": "视频接口",
    "purchase-api": "购买/解锁",
    "payment-api": "支付/订单",
    "balance-api": "余额",
    "permission-api": "状态判定",
    "fullplay": "播放资源",
    "account": "账号池",
    "request": "请求"
  };
  const PLAYBACK_CATEGORIES = new Set(["m3u8", "mp4", "segment", "play-api", "video-api"]);
  const OBSERVATION_CATEGORIES = new Set(["purchase-api", "payment-api", "balance-api", "permission-api", "fullplay", "account"]);
  const PAGE_TITLES = {
    overview: "总览",
    accounts: "账号池",
    fullplay: "播放",
    downloads: "下载管理",
    tools: "设置"
  };
  function createVirtualNode() {
    const style = {
      setProperty() {},
      removeProperty() {}
    };
    const classList = {
      add() {},
      remove() {},
      toggle() { return false; },
      contains() { return false; }
    };
    const node = {
      dataset: {},
      style,
      classList,
      hidden: true,
      value: "",
      checked: false,
      disabled: false,
      title: "",
      textContent: "",
      innerHTML: "",
      className: "",
      type: "",
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return node; },
      querySelectorAll() { return []; },
      closest() { return null; },
      focus() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      },
      get offsetWidth() { return 0; },
      get offsetHeight() { return 0; }
    };
    return node;
  }

  function createVirtualMap() {
    const target = Object.create(null);
    return new Proxy(target, {
      get(map, prop) {
        if (typeof prop === "symbol") return map[prop];
        if (!(prop in map)) map[prop] = createVirtualNode();
        return map[prop];
      },
      set(map, prop, value) {
        map[prop] = value;
        return true;
      }
    });
  }

  const panel = createVirtualNode();
  const views = createVirtualMap();
  const fields = createVirtualMap();
  const shell = createVirtualNode();
  const ball = createVirtualNode();

  const state = {
    expanded: false,
    role: "guest",
    session: null,
    displayPatchApplied: false,
    lastDisplayPatchAt: "",
    playback: [],
    requests: [],
    observations: [],
    flow: [],
    accountPool: [],
    selectedFullAccountId: "",
    remote: null,
    fullDetails: [],
    downloadTasks: {},
    downloadSnapshots: []
  };

  const uiState = {
    accountFormOpen: false,
    accountTypePicking: true,
    showInvalidCloudAccounts: false,
    editingAccountId: "",
    lastActionPayload: {},
    repositoryUpdate: null
  };

  let drag = null;
  let ignoreNextToggle = false;
  let toastTimer = 0;
  let repositoryUpdateCheckTask = null;
  const downloadLocks = new Set();
  const announcedDownloadStages = new Set();
  const FLOW_BADGE_TITLES = [
    "展示覆盖",
    "远程账号池",
    "远程账号池同步失败",
    "更新提醒",
    "更新检查失败",
    "云端账号",
    "云端账号失败",
    "账号检查",
    "播放资源",
    "播放资源失败",
    "播放资源缺少链接",
    "视频下载",
    "视频下载失败",
    "已排队",
    "读取播放列表",
    "准备分片",
    "下载分片",
    "合并完成，待保存",
    "选择保存位置",
    "已保存到设备",
    "下载失败",
    "操作失败"
  ];

  function isCompactViewport() {
    return window.matchMedia?.("(max-width: 720px)")?.matches || window.innerWidth <= 720;
  }

  function syncViewportVars() {
    const visual = window.visualViewport;
    const width = Math.max(280, Math.round(visual?.width || window.innerWidth || document.documentElement.clientWidth || 390));
    const height = Math.max(360, Math.round(visual?.height || window.innerHeight || document.documentElement.clientHeight || 640));
    const left = Math.round(visual?.offsetLeft || 0);
    const top = Math.round(visual?.offsetTop || 0);
    panel.style.setProperty("--txzz-vvw", `${width}px`);
    panel.style.setProperty("--txzz-vvh", `${height}px`);
    panel.style.setProperty("--txzz-vleft", `${left}px`);
    panel.style.setProperty("--txzz-vtop", `${top}px`);
    if (views.flowBadge) {
      views.flowBadge.style.setProperty("--txzz-vvw", `${width}px`);
      views.flowBadge.style.setProperty("--txzz-vvh", `${height}px`);
      views.flowBadge.style.setProperty("--txzz-vleft", `${left}px`);
      views.flowBadge.style.setProperty("--txzz-vtop", `${top}px`);
    }
  }

  const DISPLAY_USER_PATCH = {
    is_vip: "y",
    is_dark_vip: "y",
    group_name: "糖心志者永久会员",
    group_end_time: "VIP永久有效",
    balance: "999",
    balance_income: "999",
    coin: "999",
    gold: "999",
    ticket: "6",
    vip: "y",
    dark_vip: "y",
    has_vip: "y",
    has_dark_vip: "y",
    vip_end_time: "VIP永久有效",
    dark_vip_end_time: "VIP永久有效",
    __txzz_full_account: true
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function mask(value) {
    const s = String(value || "");
    return s.length > 22 ? `${s.slice(0, 10)}...${s.slice(-8)}` : s;
  }

  function parseMaybeJson(value) {
    let current = value;
    for (let i = 0; i < 3; i += 1) {
      if (typeof current !== "string") return current;
      try {
        current = JSON.parse(current);
      } catch (_) {
        return current;
      }
    }
    return current;
  }

  function tokenFrom(value) {
    const parsed = parseMaybeJson(value);
    if (typeof parsed === "string") {
      const token = parsed.trim();
      return /^[0-9a-f]{32}_\d+$/i.test(token) ? token : "";
    }
    if (parsed && typeof parsed === "object") {
      for (const key of ["fuck", "token", "access_token", "user_token", "auth_token", "Authorization"]) {
        const hit = tokenFrom(parsed[key]);
        if (hit) return hit;
      }
    }
    return "";
  }

  function labelForRole(role) {
    return role === "full" ? "账号池会话" : "当前页面会话";
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[category] || category || "记录";
  }

  function clipText(value, size = 160) {
    const s = String(value || "");
    return s.length > size ? `${s.slice(0, size)}...` : s;
  }

  function normalizeUrl(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    try {
      if (value.startsWith("//")) return `${location.protocol}${value}`;
      return new URL(value, location.href).href;
    } catch (_) {
      return value;
    }
  }

  function currentMovieId() {
    const match = String(location.pathname || "").match(/\/movie\/detail\/(\d+)/);
    return match ? match[1] : "";
  }

  function currentMovieTitle() {
    const selectors = [
      ".movie-title",
      ".video-title",
      ".detail-title",
      ".van-nav-bar__title",
      "h1",
      "h2"
    ];
    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
      if (text && !/糖心|下载|播放|详情/.test(text)) return text;
    }
    const docTitle = String(document.title || "").replace(/\s*[-|_].*$/, "").replace(/\s+/g, " ").trim();
    return docTitle && !/糖心|txh/i.test(docTitle) ? docTitle : "";
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function elementLooksSmallAction(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect) return false;
    if (rect.width <= 0 || rect.height <= 0) return false;
    return rect.width <= 320 && rect.height <= 220;
  }

  function isDownloadText(text) {
    const value = compactText(text);
    if (!value) return false;
    if (/^(下载|缓存|下载\/缓存|download|cache)$/i.test(value)) return true;
    return value.length <= 18 && /(下载|缓存|download|cache)/i.test(value);
  }

  function findDownloadTrigger(target) {
    if (!target?.closest || target.closest("#txzz-panel")) return null;
    const hrefEl = target.closest("a[href*='download'],a[download]");
    if (hrefEl && elementLooksSmallAction(hrefEl)) return hrefEl;

    const grid = target.closest(".van-grid-item");
    if (grid && elementLooksSmallAction(grid) && isDownloadText(grid.textContent)) return grid;

    const action = target.closest("button,a,[role='button'],.van-button,.van-cell,.van-grid-item__content,.van-grid-item__text");
    if (action && elementLooksSmallAction(action)) {
      const text = action.textContent || action.getAttribute("aria-label") || action.title || "";
      const href = action.getAttribute?.("href") || "";
      if (isDownloadText(text) || /download/i.test(href)) return action;
    }

    let el = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    for (let depth = 0; el && depth < 5; depth += 1, el = el.parentElement) {
      if (el.closest?.("#txzz-panel")) return null;
      if (elementLooksSmallAction(el) && isDownloadText(el.textContent || el.getAttribute?.("aria-label") || el.title || "")) return el;
      if (el === document.body || el === document.documentElement) break;
    }
    return null;
  }

  function isDownloadTrigger(target) {
    return Boolean(findDownloadTrigger(target));
  }

  function accountTitle(account) {
    return account?.label || account?.username || account?.id || "账号池账号";
  }

  function accountNickname(account = {}) {
    return account?.userInfo?.nickname ||
      account?.userInfo?.account_name ||
      account?.userInfo?.username ||
      account?.label ||
      account?.username ||
      account?.id ||
      "未命名账号";
  }

  function isNonAccountFailureReason(reason = "") {
    const text = String(reason || "");
    return /当前视频已经下架|视频已经下架|播放详情未返回可播放链接|购买后播放详情未返回|购买后仍显示未购买|\/movie\/detail failed|movie\/detail failed|\/movie\/doBuy failed|movie\/doBuy failed|\/system\/menu did not return visitor token|system\/menu did not return visitor token|fetch failed|network|timeout/i.test(text);
  }

  function isCredentialFailureReason(reason = "") {
    const text = String(reason || "");
    if (!text || isNonAccountFailureReason(text)) return false;
    return /账号没有可用凭据|account has no usable credential|授权过期|saved token invalid|账号身份不匹配|账号密码登录失败|account login failed|账号凭证找回失败|qrcode restore failed|\/user\/info failed|user\/info failed|findByAccount|findQrcode/i.test(text);
  }

  function accountStatusInfo(account = {}) {
    if (account.enabled === false) {
      return { ok: false, label: "不可用", tone: "bad", reason: "账号已停用" };
    }
    const hasCredential = Boolean(account.hasPassword || account.password || account.hasQrcode || account.qrcode || account.hasToken || account.userToken);
    if (!hasCredential) {
      return { ok: false, label: "不可用", tone: "bad", reason: "账号没有可用凭据" };
    }
    if (account.status === "ok") {
      return { ok: true, label: "可用", tone: "good", reason: account.lastVerifiedAt ? `上次检查 ${account.lastVerifiedAt}` : "账号状态正常" };
    }
    if (account.status === "error") {
      const reason = account.lastError || "最近一次检查失败";
      const hasTrustedHistory = Boolean(account.lastVerifiedAt || account.userInfo);
      if (hasTrustedHistory && !isCredentialFailureReason(reason)) {
        const detail = isNonAccountFailureReason(reason) ? "最近失败来自视频资源或临时接口，不是账号失效" : "账号曾成功检查，建议稍后复查";
        return { ok: true, label: "可用", tone: "good", reason: `${detail}：${clipText(reason, 90)}` };
      }
      return { ok: false, label: "不可用", tone: "bad", reason: account.lastError || "最近一次检查失败" };
    }
    if (account.status === "imported") {
      return { ok: true, label: "本地可用", tone: "good", reason: "已从当前浏览器会话导入" };
    }
    return { ok: true, label: "待检查", tone: "warn", reason: "尚未执行检查，可点击检查确认" };
  }

  function firstFilled(source = {}, keys = []) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function parseOpenState(value, fallbackText = "") {
    const raw = String(value ?? "").trim();
    const hint = String(fallbackText ?? "").trim();
    const text = `${raw} ${hint}`.trim().toLowerCase();
    if (!text) return null;
    if (/未开通|未购买|已过期|过期|失效|不可用|false|no|none|null/.test(text) || /^(0|n)$/.test(raw.toLowerCase())) return false;
    if (/永久|已开通|已购买|true|yes|vip|有效/.test(text) || /^(1|y)$/.test(raw.toLowerCase())) return true;
    if (/^\d+$/.test(raw)) return Number(raw) > 0;
    if (/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(raw)) return true;
    return null;
  }

  function formatOpenLabel(open, detail = "") {
    const text = String(detail || "").trim();
    if (open === true) {
      if (/永久/.test(text)) return "永久";
      if (text && !/^[yn10]$/i.test(text)) return clipText(text, 8);
      return "已开通";
    }
    if (open === false) return "未开通";
    return "未知";
  }

  function formatCoinValue(value) {
    if (value === undefined || value === null || String(value).trim() === "") return "未知";
    const text = String(value).trim();
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return String(Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2)));
    return clipText(text, 10);
  }

  function accountRightsInfo(account = {}) {
    const info = account?.userInfo || {};
    const vipValue = firstFilled(info, ["is_vip", "vip", "has_vip", "isVip", "vip_status", "vipStatus"]);
    const vipDetail = firstFilled(info, ["vip_end_time", "group_end_time", "vipEndTime", "groupEndTime", "group_name"]);
    const darkValue = firstFilled(info, ["is_dark_vip", "dark_vip", "has_dark_vip", "isDarkVip", "darkVip", "dark_vip_status", "darkVipStatus"]);
    const darkDetail = firstFilled(info, ["dark_vip_end_time", "darkVipEndTime", "dark_group_end_time", "group_end_time", "group_name"]);
    const coinValue = firstFilled(info, ["coin", "gold", "balance", "balance_income", "money", "amount", "wallet", "ticket"]);
    const vipOpen = parseOpenState(vipValue, vipDetail);
    const darkOpen = parseOpenState(darkValue, darkDetail);
    return {
      vip: { label: formatOpenLabel(vipOpen, vipDetail || vipValue), tone: vipOpen === true ? "good" : vipOpen === false ? "bad" : "warn" },
      dark: { label: formatOpenLabel(darkOpen, darkDetail || darkValue), tone: darkOpen === true ? "good" : darkOpen === false ? "bad" : "warn" },
      coin: { label: formatCoinValue(coinValue), tone: coinValue === undefined || coinValue === null || String(coinValue).trim() === "" ? "warn" : "good" }
    };
  }

  function credentialLabel(account = {}) {
    if (account.hasQrcode || account.qrcode) return "账号凭证";
    if (account.hasPassword || account.password) return "账号密码";
    if (account.hasToken || account.userToken) return "token/deviceId";
    return "无凭据";
  }

  function credentialModeLabel(mode = "password") {
    if (mode === "qrcode") return "账号凭证";
    if (mode === "token") return "token/deviceId";
    return "账号密码";
  }

  function selectedAccount() {
    return state.accountPool.find((item) => item.id === state.selectedFullAccountId) || state.accountPool[0] || null;
  }

  function latestUsedAccountId() {
    const latest = state.fullDetails[state.fullDetails.length - 1] || {};
    return String(latest.accountId || latest.rotation?.accountId || "");
  }

  function latestUsedAccount() {
    const id = latestUsedAccountId();
    return id ? state.accountPool.find((item) => item.id === id) || null : null;
  }

  function remoteSourceLabel(mode) {
    if (mode === "local") return "本地选中账号";
    if (mode === "cloud-first") return "云端优先，本地兜底";
    return "云端自动轮换";
  }

  function isCloudAccount(account = {}) {
    const source = String(account.source || "");
    return Boolean(account.cloudReadonly || account.isCloud || account.remoteId || account.cloudId)
      || ["remote", "qrcode"].includes(source);
  }

  function cloudHasAccount(accountId = "") {
    return state.accountPool.some((item) => item.id === accountId && isCloudAccount(item));
  }

  function isUsableCloudAccount(account = {}) {
    if (!isCloudAccount(account)) return false;
    const status = accountStatusInfo(account);
    return Boolean(status.ok && (account.status === "ok" || account.status === "imported" || account.lastVerifiedAt || account.userInfo));
  }

  function visibleAccountPool() {
    return state.accountPool.filter((account) => {
      if (!isCloudAccount(account)) return true;
      if (uiState.showInvalidCloudAccounts) return true;
      return isUsableCloudAccount(account);
    });
  }

  function accountPoolStats() {
    const accounts = state.accountPool || [];
    const cloud = accounts.filter(isCloudAccount);
    const local = accounts.filter((account) => !isCloudAccount(account));
    const invalidCloud = cloud.filter((account) => !isUsableCloudAccount(account));
    return {
      total: accounts.length,
      cloud: cloud.length,
      local: local.length,
      availableCloud: cloud.length - invalidCloud.length,
      invalidCloud: invalidCloud.length,
      visible: visibleAccountPool().length
    };
  }

  function setAccountCredentialMode(mode = fields.accountCredentialMode?.value || "password") {
    if (fields.accountCredentialMode) fields.accountCredentialMode.value = mode;
    if (views.accountCredentialLabel) views.accountCredentialLabel.textContent = credentialModeLabel(mode);
    if (views.accountFormHint) {
      views.accountFormHint.textContent = mode === "qrcode"
        ? "填写账号昵称和账号凭证内容"
        : mode === "token"
          ? "填写账号昵称、deviceId 和 userToken"
          : "填写账号昵称、用户名和密码";
    }
    panel.querySelectorAll("[data-credential]").forEach((item) => {
      const credential = item.dataset.credential;
      item.hidden = credential !== mode;
    });
  }

  function resetAccountForm() {
    uiState.editingAccountId = "";
    setAccountFormReadonly(false);
    [
      fields.accountId,
      fields.accountLabel,
      fields.accountUsername,
      fields.accountPassword,
      fields.accountDeviceId,
      fields.accountToken,
      fields.accountQrcode,
      fields.accountNotes
    ].filter(Boolean).forEach((field) => {
      field.value = "";
    });
    setAccountCredentialMode("password");
    if (views.accountFormTitle) views.accountFormTitle.textContent = "添加本地账号";
  }

  function openAccountForm(account = null, mode = "") {
    uiState.accountFormOpen = true;
    uiState.accountTypePicking = !account && !mode;
    setAccountFormReadonly(false);
    if (!account) {
      resetAccountForm();
      if (mode) {
        uiState.accountTypePicking = false;
        setAccountCredentialMode(mode);
        setTimeout(() => fields.accountLabel?.focus?.(), 0);
      }
      renderAccounts();
      return;
    }
    uiState.accountTypePicking = false;
    uiState.editingAccountId = account.id || "";
    if (views.accountFormTitle) views.accountFormTitle.textContent = isCloudAccount(account) ? "云端账号摘要" : "编辑本地账号";
    fields.accountId.value = account.id || "";
    fields.accountLabel.value = account.label || accountNickname(account);
    fields.accountUsername.value = account.username || "";
    fields.accountPassword.value = "";
    fields.accountDeviceId.value = "";
    fields.accountToken.value = "";
    fields.accountQrcode.value = "";
    fields.accountNotes.value = account.notes || "";
    setAccountCredentialMode(account.hasQrcode || account.qrcode ? "qrcode" : account.hasToken || account.userToken ? "token" : "password");
    setAccountFormReadonly(isCloudAccount(account));
    renderAccounts();
  }

  function closeAccountForm() {
    uiState.accountFormOpen = false;
    uiState.accountTypePicking = true;
    uiState.editingAccountId = "";
    views.accountModal.hidden = true;
    setAccountFormReadonly(false);
  }

  function backAccountTypePicker() {
    if (uiState.editingAccountId) return;
    uiState.accountTypePicking = true;
    renderAccounts();
  }

  function setAccountFormReadonly(readonly) {
    const disabledFields = [
      fields.accountId,
      fields.accountLabel,
      fields.accountUsername,
      fields.accountPassword,
      fields.accountDeviceId,
      fields.accountToken,
      fields.accountQrcode,
      fields.accountNotes
    ].filter(Boolean);
    disabledFields.forEach((field) => {
      field.disabled = Boolean(readonly);
    });
    panel.querySelectorAll('[data-action="save-account"], [data-action="upload-account-remote"], [data-action="import-current-session"]').forEach((button) => {
      button.disabled = Boolean(readonly);
      button.title = readonly ? "云端账号只显示脱敏摘要，不能在插件前端修改" : "";
    });
  }

  function isDisplayPatchActive(probe = {}) {
    return state.displayPatchApplied ||
      probe.displayPatchApplied ||
      document.documentElement.dataset.txzzVip === "permanent" ||
      document.documentElement.dataset.txzzFullAccount === "true";
  }

  function mergeDisplayUserInfo(info, fallbackUserId = "") {
    const base = info && typeof info === "object" ? { ...info } : {};
    const patched = { ...base, ...DISPLAY_USER_PATCH };
    if (!patched.id && fallbackUserId) patched.id = fallbackUserId;
    if (!patched.nickname) patched.nickname = base.account_name || base.username || fallbackUserId || "永久会员";
    return patched;
  }

  function applySessionDisplayPatch(session = {}) {
    if (!isDisplayPatchActive()) return session;
    const userId = session.userId || session.userInfo?.id || "";
    const userInfo = mergeDisplayUserInfo(session.userInfo, userId);
    return {
      ...session,
      userId: userInfo.id || userId,
      nickname: session.nickname || userInfo.nickname || userInfo.account_name || userInfo.username || "",
      userInfo
    };
  }

  function ensureVisiblePatchStyle() {
    if (document.getElementById("txzz-visible-style")) return;
    const style = document.createElement("style");
    style.id = "txzz-visible-style";
    style.textContent = [
      "#txzz-mine-status-card{margin:10px 16px;padding:12px;border:1px solid rgba(255,211,106,.34);border-radius:12px;background:linear-gradient(135deg,#25151e,#111016 52%,#2a1c16);color:#fff;box-shadow:0 12px 28px rgba(0,0,0,.28);font-family:inherit}",
      "#txzz-mine-status-card .txzz-row{display:flex;align-items:center;justify-content:space-between;gap:10px}",
      "#txzz-mine-status-card span{display:block;color:#ffd36a;font-size:12px;line-height:1.2}",
      "#txzz-mine-status-card strong{display:block;margin-top:4px;font-size:17px;line-height:1.2;color:#fff}",
      "#txzz-mine-status-card small{display:block;margin-top:6px;color:rgba(255,250,246,.72);font-size:11px}",
      "#txzz-mine-status-card .txzz-balance{min-width:72px;text-align:right}",
      "#txzz-mine-status-card .txzz-balance strong{font-size:24px;color:#ffd36a}",
      "#txzz-dark-status-card{margin:10px 14px 8px;padding:10px 12px;border:1px solid rgba(255,79,115,.34);border-radius:12px;background:linear-gradient(135deg,#27111b,#0d0608 56%,#211526);color:#fff;font-family:inherit;box-shadow:0 12px 26px rgba(0,0,0,.26)}",
      "#txzz-dark-status-card span{display:block;color:#ff8fa7;font-size:12px}",
      "#txzz-dark-status-card strong{display:block;margin-top:4px;color:#fff;font-size:16px}",
      "#txzz-dark-status-card small{display:block;margin-top:5px;color:rgba(255,250,246,.68);font-size:11px}",
      "html[data-txzz-full-account='true'] .main.blur{filter:none!important}",
      "html[data-txzz-full-account='true'] .txzz-hidden-vip-dialog{display:none!important;visibility:hidden!important;pointer-events:none!important}"
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  let visibleTextPatchRoute = "";
  let visibleTextPatchAt = 0;
  let visibleRoutePatchKey = "";

  function visibleRouteKey() {
    return `${location.pathname}${location.search}${location.hash}`;
  }

  function isAccountDisplayRoute() {
    const path = location.pathname.replace(/\/$/, "") || "/";
    return path === "/mine" || path === "/dark" || path === "/user" || path === "/user/vip";
  }

  function removeVisibleStatusCards() {
    document.querySelectorAll("#txzz-mine-status-card,#txzz-dark-status-card,.txzz-visible-chip").forEach((el) => {
      try {
        el.remove();
      } catch (_) {}
    });
  }

  function patchVisibleText(force = false) {
    const root = document.body;
    if (!root) return;
    const routeKey = visibleRouteKey();
    const now = Date.now();
    if (!force && visibleTextPatchRoute === routeKey && now - visibleTextPatchAt < 5000) return;
    visibleTextPatchRoute = routeKey;
    visibleTextPatchAt = now;
    const replacements = [
      [/免费观影\s*\(游客\)\s*[:：]?\s*\d+\s*\/\s*\d+/g, "永久会员观影：999/999"],
      [/免费观影\s*\(游客\)/g, "永久会员观影"],
      [/余额\s*[:：]?\s*0\b/g, "余额 999"],
      [/开通会员/g, "永久会员"],
      [/立即开通/g, "已开通"],
      [/未开通/g, "已开通"],
      [/普通用户/g, "永久会员"],
      [/游客用户/g, "永久会员"],
      [/游客/g, "永久会员"],
      [/VIP已过期/g, "VIP永久有效"],
      [/会员已过期/g, "会员永久有效"],
      [/尤物圈未开通/g, "尤物圈永久有效"],
      [/未开通尤物圈/g, "尤物圈永久有效"],
      [/开通尤物圈/g, "尤物圈已开通"],
      [/余额不足/g, "余额 999"]
    ];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    let changed = 0;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest("#txzz-panel,#txzz-mine-status-card,#txzz-dark-status-card,script,style,textarea,input")) continue;
      nodes.push(node);
      let text = node.nodeValue || "";
      const old = text;
      for (const [from, to] of replacements) text = text.replace(from, to);
      if (text !== old) {
        node.nodeValue = text;
        changed += 1;
        if (changed > 100) break;
      }
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const text = (nodes[i].nodeValue || "").trim();
      if (!/^余额$|^余额[:：]?$/.test(text)) continue;
      for (let j = i + 1; j < Math.min(nodes.length, i + 5); j += 1) {
        const next = (nodes[j].nodeValue || "").trim();
        if (/^\d+(?:\.\d+)?$/.test(next)) {
          nodes[j].nodeValue = (nodes[j].nodeValue || "").replace(/\d+(?:\.\d+)?/, "999");
          break;
        }
        if (/^(收益|冻结|动态|关注|粉丝|开通会员|我的钱包)$/.test(next)) break;
      }
    }
  }

  function patchVisibleMine() {
    removeVisibleStatusCards();
    return;
    const existingCard = document.getElementById("txzz-mine-status-card");
    if (existingCard?.dataset.txzzRendered === "1") return;
    if (existingCard) existingCard.dataset.txzzRendered = "1";
    const text = document.body?.innerText || "";
    if (!/\/mine\/?$/.test(location.pathname) && !/我的|开通会员|我的钱包|免费观影/.test(text)) return;
    const container = document.querySelector(".bg-page") || document.querySelector(".app-container") || document.body;
    if (!container) return;
    let card = document.getElementById("txzz-mine-status-card");
    if (!card) {
      card = document.createElement("section");
      card.id = "txzz-mine-status-card";
      card.dataset.txzzRendered = "1";
      const anchor = container.querySelector(".info") || container.querySelector(".nav") || container.firstElementChild;
      if (anchor?.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
      else container.insertBefore(card, container.firstChild);
    }
    card.innerHTML = '<div class="txzz-row"><div><span>账号状态</span><strong>永久会员 · 永久尤物圈</strong><small>糖心志者展示覆盖已应用，当前页面按高级账号状态展示</small></div><div class="txzz-balance"><span>余额</span><strong>999</strong></div></div>';
  }

  function patchVisibleDark() {
    removeVisibleStatusCards();
    const text = document.body?.innerText || "";
    const isDarkPage = location.pathname.replace(/\/$/, "") === "/dark" || /尤物圈/.test(text);
    if (!isDarkPage) return;
    document.querySelectorAll(".main.blur").forEach((el) => el.classList.remove("blur"));
    const container = document.querySelector(".bg-page") || document.querySelector(".app-container") || document.body;
    if (false && container && !document.getElementById("txzz-dark-status-card")) {
      const card = document.createElement("section");
      card.id = "txzz-dark-status-card";
      card.dataset.txzzRendered = "1";
      card.innerHTML = '<span>尤物圈权益</span><strong>永久尤物圈已开通</strong><small>访问弹窗与模糊遮罩已处理，可继续浏览当前列表</small>';
      const anchor = container.querySelector(".main") || container.firstElementChild;
      if (anchor?.parentNode) anchor.parentNode.insertBefore(card, anchor);
      else container.insertBefore(card, container.firstChild);
    }
    let hidVipDialog = false;
    document.querySelectorAll(".van-dialog,.van-popup").forEach((el) => {
      if (/尤物|会员|VIP|开通|权限|暗网/.test(el.innerText || "")) {
        hidVipDialog = true;
        el.classList.add("txzz-hidden-vip-dialog");
        el.style.setProperty("display", "none", "important");
      }
    });
    if (hidVipDialog) {
      document.querySelectorAll(".van-overlay").forEach((el) => {
        el.classList.add("txzz-hidden-vip-dialog");
        el.style.setProperty("display", "none", "important");
      });
    }
    document.body?.classList?.remove("van-overflow-hidden");
  }

  function applyVisibleDisplayPatch(options = {}) {
    ensureVisiblePatchStyle();
    document.documentElement.dataset.txzzVip = "permanent";
    document.documentElement.dataset.txzzFullAccount = "true";
    removeVisibleStatusCards();
    if (isAccountDisplayRoute()) patchVisibleText(Boolean(options.forceText));
    if (location.pathname.replace(/\/$/, "") === "/mine") patchVisibleMine();
    patchVisibleDark();
  }

  function installVisibleDisplayLoop() {
    if (window.__txzzVisibleLoopInstalled) return;
    window.__txzzVisibleLoopInstalled = true;
    let pending = false;
    let lastRun = 0;
    const schedule = (forceText = false) => {
      if (pending) return;
      pending = true;
      window.setTimeout(() => {
        pending = false;
        const now = Date.now();
        const routeKey = visibleRouteKey();
        const routeChanged = routeKey !== visibleRoutePatchKey;
        if (!forceText && !routeChanged && now - lastRun < 1200) return;
        visibleRoutePatchKey = routeKey;
        lastRun = now;
        applyVisibleDisplayPatch({ forceText: forceText || routeChanged });
      }, 450);
    };
    try {
      new MutationObserver((mutations) => {
        const meaningful = mutations.some((mutation) => {
          if (mutation.target?.closest?.("#txzz-panel,#txzz-mine-status-card,#txzz-dark-status-card")) return false;
          return Array.from(mutation.addedNodes || []).some((node) => node.nodeType === Node.ELEMENT_NODE);
        });
        if (meaningful) schedule(false);
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
    window.addEventListener("popstate", () => schedule(true), true);
    window.addEventListener("hashchange", () => schedule(true), true);
    window.addEventListener("focus", () => schedule(false), true);
    [250, 1200, 3000].forEach((delay) => window.setTimeout(() => schedule(delay === 250), delay));
  }

  function publicSession(session = {}) {
    const patched = applySessionDisplayPatch(session);
    return {
      role: patched.role || state.role,
      userId: patched.userId || "",
      nickname: patched.nickname || "",
      tokenMasked: patched.tokenMasked || mask(patched.token || ""),
      hasToken: Boolean(patched.token),
      deviceId: patched.deviceId || "",
      userInfo: patched.userInfo || null,
      href: patched.href || location.href,
      capturedAt: patched.capturedAt || ""
    };
  }

  function publishState() {
    try {
      const snapshot = {
        expanded: state.expanded,
        role: state.role,
        displayPatchApplied: isDisplayPatchActive(),
        lastDisplayPatchAt: state.lastDisplayPatchAt,
        session: publicSession(state.session || {}),
        playback: state.playback.slice(-40),
        requests: state.requests.slice(-80),
        observations: state.observations.slice(-60),
        flow: state.flow.slice(-40),
        remote: state.remote,
        accountPool: state.accountPool,
        selectedFullAccountId: state.selectedFullAccountId,
        fullDetails: state.fullDetails.slice(-40),
        downloadTasks: state.downloadTasks || {},
        downloadSnapshots: state.downloadSnapshots || [],
        repositoryUpdate: uiState.repositoryUpdate,
        publishedAt: new Date().toISOString()
      };
      window.__txzzBridgeState = snapshot;
      window.dispatchEvent(new CustomEvent("txzz:state", { detail: snapshot }));
    } catch (_) {}
  }

  function readStorage() {
    const local = {};
    const session = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        local[key] = localStorage.getItem(key);
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        session[key] = sessionStorage.getItem(key);
      }
    } catch (_) {}
    return { local, session };
  }

  function emitFlow(title, detail, level = "info") {
    const item = { title, detail, level, ts: new Date().toISOString() };
    state.flow.push(item);
    state.flow = state.flow.slice(-80);
    renderFlow();
    publishState();
  }

  function isKeyFlowTitle(title = "") {
    const value = String(title || "");
    return FLOW_BADGE_TITLES.some((item) => value === item || value.startsWith(item));
  }

  function emitCloudAccountFlow(summary = {}, fallbackMovieId = "") {
    if (!summary || typeof summary !== "object") return;
    const accountName = summary.accountLabel || summary.accountUser || summary.rotation?.accountId || "自动轮换账号";
    const tried = Number(summary.rotation?.tried || 0);
    const failed = Array.isArray(summary.rotation?.failed) ? summary.rotation.failed.length : 0;
    const action = String(summary.action || "");
    const parts = [
      `使用 ${accountName}`,
      tried ? `已尝试 ${tried} 个` : "",
      failed ? `切换失败 ${failed} 个` : "",
      action === "buy_then_full_detail" ? "已执行金币解锁" : "",
      summary.rotation?.purchasePolicy ? "按金币最少策略" : ""
    ].filter(Boolean);
    emitFlow("云端账号", `${fallbackMovieId || summary.movieId || "当前视频"} / ${parts.join(" / ")}`, "ok");
  }

  function showToast(message, level = "info") {
    const toast = views.toast;
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = String(message || "");
    toast.className = `txzz-toast is-show ${level === "error" ? "is-error" : level === "ok" ? "is-ok" : ""}`;
    toastTimer = window.setTimeout(() => {
      toast.className = "txzz-toast";
      toast.textContent = "";
    }, 3600);
  }

  function renderFlow() {
    publishState();
  }

  function renderStats() {
    publishState();
  }

  function downloadTasksArray() {
    return Object.values(state.downloadTasks || {})
      .filter((task) => task && typeof task === "object")
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function renderDownloads() {
    publishState();
  }

  function announceDownloadTasks() {
    for (const task of Object.values(state.downloadTasks || {})) {
      const key = `${task.taskId}:${task.stage}:${task.current || 0}:${task.total || 0}:${task.error || ""}`;
      if (announcedDownloadStages.has(key)) continue;
      announcedDownloadStages.add(key);
      const count = task.total ? ` ${task.current || 0}/${task.total}` : "";
      const detail = task.stage === "error"
        ? `${task.movieId || ""} ${task.error || "????"}`
        : `${task.movieId || ""}${count} ${task.filename || ""}`.trim();
      emitFlow(downloadStageLabel(task.stage), detail, task.stage === "error" ? "error" : task.stage === "complete" ? "ok" : "info");
    }
    if (announcedDownloadStages.size > 200) {
      const latest = Array.from(announcedDownloadStages).slice(-80);
      announcedDownloadStages.clear();
      latest.forEach((item) => announcedDownloadStages.add(item));
    }
    renderDownloads();
  }

  function renderSession() {
    renderStats();
    publishState();
  }

  function renderPlayback() {
    publishState();
  }

  function renderObservations() {
    publishState();
  }

  function renderAccounts() {
    renderStats();
    publishState();
  }

  function renderFullDetails() {
    renderStats();
    publishState();
  }

  function requestPageProbe(timeoutMs = 1000) {
    return new Promise((resolve) => {
      const id = `txzz_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const timer = window.setTimeout(() => resolve({}), timeoutMs);
      function onMessage(event) {
        if (event.source !== window || event.data?.source !== "txzz-page-probe" || event.data?.id !== id) return;
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(event.data.payload || {});
      }
      window.addEventListener("message", onMessage);
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("page_probe.js");
      script.dataset.txzzProbeId = id;
      script.onload = () => script.remove();
      document.documentElement.appendChild(script);
    });
  }

  async function collectSession() {
    const stores = readStorage();
    const token = tokenFrom(stores.local[STORAGE_KEY_TOKEN]) || tokenFrom(stores.session[STORAGE_KEY_TOKEN]);
    const deviceId = parseMaybeJson(stores.local[STORAGE_KEY_DEVICE]) || "";
    const probe = await requestPageProbe();
    const activePatch = isDisplayPatchActive(probe);
    if (activePatch) {
      state.displayPatchApplied = true;
      state.lastDisplayPatchAt = state.lastDisplayPatchAt || new Date().toISOString();
    }
    const rawInfo = probe.userInfo || null;
    const tokenUserId = token ? String(token).split("_").pop() : "";
    const info = activePatch ? mergeDisplayUserInfo(rawInfo, rawInfo?.id || tokenUserId) : rawInfo;
    const userId = info?.id || (token ? String(token).split("_").pop() : "");
    state.session = {
      role: state.role,
      userId: userId || "",
      nickname: info?.nickname || info?.account_name || info?.username || "",
      token: token || "",
      tokenMasked: mask(token),
      deviceId: String(deviceId || ""),
      userInfo: info,
      href: location.href,
      capturedAt: new Date().toISOString()
    };
    renderSession();
    return state.session;
  }

  async function applyDisplayPatch() {
    if (!document.documentElement.dataset.txzzDisplayScriptInjected) {
      document.documentElement.dataset.txzzDisplayScriptInjected = "1";
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("display_patch.js");
      script.onload = () => script.remove();
      document.documentElement.appendChild(script);
    } else {
      window.postMessage({ source: "txzz-content", kind: "display-apply" }, "*");
    }
    state.displayPatchApplied = true;
    state.lastDisplayPatchAt = new Date().toISOString();
    document.documentElement.dataset.txzzVip = "permanent";
    document.documentElement.dataset.txzzFullAccount = "true";
    applyVisibleDisplayPatch({ forceText: true });
    installVisibleDisplayLoop();
    emitFlow("展示覆盖", "已应用永久会员、永久尤物圈、999 余额客户端展示", "ok");
    await collectSession();
  }

  function isPlaybackItem(item) {
    if (!item?.url) return false;
    if (PLAYBACK_CATEGORIES.has(item.category)) return true;
    return /\.(m3u8|mp4)(?:[?#]|$)/i.test(item.url) || /\.ts(?:[?#/]|$)/i.test(item.url);
  }

  function addPlayback(item) {
    if (!item?.url || !isPlaybackItem(item)) return;
    const normalized = { ...item, url: normalizeUrl(item.url) };
    const key = `${normalized.category || ""}|${normalized.via || ""}|${normalized.url}`;
    const exists = state.playback.some((old) => `${old.category || ""}|${old.via || ""}|${old.url}` === key);
    if (!exists) {
      state.playback.push(normalized);
      state.playback = state.playback.slice(-140);
      renderPlayback();
      emitFlow("记录播放资源", `${categoryLabel(normalized.category)} / ${normalized.via || normalized.kind || "runtime"}`, "ok");
      publishState();
    }
  }

  function addObservation(item) {
    const normalized = { ...item, url: normalizeUrl(item.url) };
    const flags = Array.isArray(item.flags) ? item.flags : [];
    const key = `${normalized.category || ""}|${normalized.via || ""}|${normalized.status || ""}|${normalized.url || ""}|${flags.join(",")}|${clipText(normalized.bodyHead, 80)}`;
    const exists = state.observations.some((old) => `${old.category || ""}|${old.via || ""}|${old.status || ""}|${old.url || ""}|${(old.flags || []).join(",")}|${clipText(old.bodyHead, 80)}` === key);
    if (!exists) {
      state.observations.push(normalized);
      state.observations = state.observations.slice(-120);
      renderObservations();
      emitFlow("账号状态记录", `${categoryLabel(normalized.category)} / ${flags.join(",") || normalized.status || "observed"}`, "ok");
      publishState();
    }
  }

  async function exportTrace() {
    await collectSession();
    return {
      role: state.role,
      session: state.session,
      selectedFullAccountId: state.selectedFullAccountId,
      stats: {
        playback: state.playback.length,
        requests: state.requests.length,
        observations: state.observations.length,
        fullDetails: state.fullDetails.length
      },
      playback: state.playback.slice(-100),
      requests: state.requests.slice(-180),
      observations: state.observations.slice(-120),
      fullDetails: state.fullDetails.slice(-80),
      exportedAt: new Date().toISOString()
    };
  }

  function urlsFromTrace(trace) {
    const urls = new Set((trace?.playback || []).map((item) => item.url).filter(Boolean));
    for (const item of trace?.fullDetails || []) {
      if (item.playLink) urls.add(normalizeUrl(item.playLink));
      if (item.backupLink) urls.add(normalizeUrl(item.backupLink));
    }
    return urls;
  }

  async function compareTraces() {
    const fullText = fields.fullTrace?.value?.trim?.() || "";
    const guestText = fields.guestTrace?.value?.trim?.() || "";
    const full = fullText ? parseMaybeJson(fullText) : { fullDetails: state.fullDetails };
    const guest = guestText ? parseMaybeJson(guestText) : await exportTrace();
    if (!full || typeof full !== "object") {
      if (views.compareResult) views.compareResult.textContent = JSON.stringify({ error: "请先粘贴账号池资源 JSON" }, null, 2);
      emitFlow("资源对比", "缺少账号池资源 JSON", "error");
      return;
    }
    const fullLinks = urlsFromTrace(full);
    const guestLinks = urlsFromTrace(guest);
    const shared = [...guestLinks].filter((url) => fullLinks.has(url));
    const fullOnly = [...fullLinks].filter((url) => !guestLinks.has(url));
    const result = {
      fullLinks: fullLinks.size,
      guestLinks: guestLinks.size,
      sharedLinks: shared.length,
      fullOnly,
      fullDetails: full.fullDetails || [],
      recommendation: fullOnly.length
        ? "当前页面缺少账号池播放资源；优先确认视频详情接口是否已返回可用资源。"
        : "播放资源没有明显缺口；继续观察 HLS 分片、Referer、有效期和播放器实际时长。"
    };
    if (views.compareResult) views.compareResult.textContent = JSON.stringify(result, null, 2);
    emitFlow("资源对比", `账号池 ${fullLinks.size} 条，当前页面 ${guestLinks.size} 条，共享 ${shared.length} 条`, "ok");
  }

  async function copyText(text, label) {
    if (!text) {
      emitFlow("复制", `${label || "内容"}为空`, "error");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      emitFlow("复制", `${label || "内容"}已写入剪贴板`, "ok");
    } catch (err) {
      emitFlow("复制失败", err?.message || String(err), "error");
    }
  }

  async function sendRuntime(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (response?.ok === false) {
          reject(new Error(response.error || "runtime error"));
          return;
        }
        resolve(response || {});
      });
    });
  }

  function openRepositoryHome() {
    window.open("https://github.com/lsy5920/tangxin-zhizhe-extension", "_blank", "noopener,noreferrer");
  }

  function renderRepositoryUpdateBanner(update = uiState.repositoryUpdate) {
    const banner = views.updateBanner;
    if (!banner) return;
    const remote = update?.remote || {};
    const hasUpdate = Boolean(update?.updateAvailable && remote.id);
    banner.hidden = !hasUpdate;
    if (!hasUpdate) return;
    const versionText = remote.version ? `版本 ${remote.version}` : remote.time || "发现更新";
    const buildText = remote.build ? ` / 构建 ${remote.build}` : "";
    if (views.updateBannerTitle) views.updateBannerTitle.textContent = `${versionText}${buildText}`;
    if (views.updateBannerDetail) {
      views.updateBannerDetail.textContent = remote.title || remote.detail || remote.line || "点击查看更新详情";
    }
  }

  function rememberRepositoryUpdate(update = null) {
    const hasResult = Boolean(update?.remote?.id || update?.checkedAt || update?.ok === false);
    uiState.repositoryUpdate = hasResult ? update : null;
    renderRepositoryUpdateBanner(uiState.repositoryUpdate);
    publishState();
    return Boolean(update?.updateAvailable && update?.remote?.id);
  }

  function showRepositoryUpdateDialog(update = {}) {
    const remote = update.remote || {};
    rememberRepositoryUpdate(update);
    const versionText = remote.version ? `版本 ${remote.version}` : remote.time || "最新版本";
    const buildText = remote.build ? ` / 构建 ${remote.build}` : "";
    if (views.updateTitle) views.updateTitle.textContent = `${versionText}${buildText}`;
    if (views.updateDetail) views.updateDetail.textContent = remote.detail || remote.text || remote.title || "远程仓库已有新的版本清单，建议前往项目主页获取最新版本。";
    if (views.updateLine) {
      views.updateLine.textContent = [
        remote.releasedAt ? `发布时间：${remote.releasedAt}` : "",
        remote.type || "",
        remote.title || "",
        remote.line && !remote.version ? remote.line : ""
      ].filter(Boolean).join(" / ");
    }
    publishState();
    emitFlow("更新提醒", "远程仓库发现新的版本清单", "ok");
  }

  function copyFullUrl(url, label) {
    // 复制前统一补全域名，避免用户拿到只有路径的相对链接。
    return copyText(normalizeUrl(url || ""), label || "完整链接");
  }

  function copyPlayableUrl(url, label) {
    return copyFullUrl(url, label || "完整播放链接");
  }

  async function closeRepositoryUpdateDialog(mode = "dismissed") {
    const updateId = uiState.repositoryUpdate?.remote?.id || "";
    if (updateId) {
      await sendRuntime("markRepositoryUpdateNotified", { updateId, mode }).catch(() => {});
    }
    publishState();
  }

  async function checkRepositoryUpdate(force = false, options = {}) {
    const showDialog = options.showDialog ?? Boolean(force);
    const silent = Boolean(options.silent);
    if (repositoryUpdateCheckTask) return repositoryUpdateCheckTask;
    repositoryUpdateCheckTask = (async () => {
      try {
        const response = await sendRuntime("checkRepositoryUpdate", { force, realtime: Boolean(force || options.realtime) });
        const hasUpdate = rememberRepositoryUpdate(response);
        if (hasUpdate && showDialog) showRepositoryUpdateDialog(response);
        else if (force && !silent) {
          const remote = response?.remote || {};
          const text = remote.version
            ? `当前已是最新版本：本地 ${response.local?.version || "未知"} / 远程 ${remote.version}，构建 ${remote.build || "未记录"}`
            : "当前已是最新版本";
          emitFlow("更新提醒", text, "ok");
        }
        return response;
      } catch (err) {
        rememberRepositoryUpdate({ ok: false, checkedAt: new Date().toISOString(), error: err?.message || String(err), local: { version: "", build: "" }, remote: null });
        if (!silent) emitFlow("更新检查失败", err?.message || String(err), "error");
        return { ok: false, error: err?.message || String(err) };
      } finally {
        repositoryUpdateCheckTask = null;
      }
    })();
    return repositoryUpdateCheckTask;
  }

  function remindRepositoryUpdateOnPanelOpen() {
    if (uiState.repositoryUpdate?.updateAvailable) {
      window.setTimeout(() => showRepositoryUpdateDialog(uiState.repositoryUpdate), 120);
      return;
    }
    checkRepositoryUpdate(false, { showDialog: true, silent: true }).catch(() => {});
  }

  function syncSavedState(saved) {
    const autoCleaned = Boolean(saved.autoCleanedThisLoad);
    if (autoCleaned) {
      window.postMessage({ source: "txzz-content", kind: "clear-runtime-cache" }, "*");
      state.playback = [];
      state.requests = [];
      state.observations = [];
      state.flow = [];
    }
    state.accountPool = Array.isArray(saved.accountPool) ? saved.accountPool : [];
    state.selectedFullAccountId = saved.selectedFullAccountId || state.accountPool[0]?.id || "";
    state.remote = saved.remote || state.remote || null;
    state.fullDetails = Array.isArray(saved.fullDetails) ? saved.fullDetails : [];
    state.downloadTasks = saved.downloadTasks && typeof saved.downloadTasks === "object" ? saved.downloadTasks : {};
    state.downloadSnapshots = Array.isArray(saved.downloadSnapshots) ? saved.downloadSnapshots : [];
    if (autoCleaned) {
      const reason = saved.remote?.lastAutoCleanReason || "已自动清理旧版本插件缓存并切换到当前默认配置";
      emitFlow("自动清理缓存", reason, "ok");
    }
    renderPlayback();
    renderObservations();
    renderFlow();
    renderAccounts();
    renderFullDetails();
    renderDownloads();
    announceDownloadTasks();
  }

  async function loadSavedState(verbose = true) {
    const response = await sendRuntime("getState");
    const saved = response.state || {};
    syncSavedState(saved);
    if (saved.lastFullTrace && fields.fullTrace) fields.fullTrace.value = JSON.stringify(saved.lastFullTrace, null, 2);
    if (saved.lastGuestTrace && fields.guestTrace) fields.guestTrace.value = JSON.stringify(saved.lastGuestTrace, null, 2);
    if (views.exportBox) views.exportBox.textContent = JSON.stringify(saved, null, 2);
    if (verbose) emitFlow("载入记录", "已读取扩展本地保存记录与账号池", "ok");
    publishState();
    return saved;
  }

  async function refreshLocalDownloadState() {
    const response = await sendRuntime("getStateLocal");
    const saved = response.state || {};
    state.downloadTasks = saved.downloadTasks && typeof saved.downloadTasks === "object" ? saved.downloadTasks : {};
    state.downloadSnapshots = Array.isArray(saved.downloadSnapshots) ? saved.downloadSnapshots : [];
    announceDownloadTasks();
    renderDownloads();
    publishState();
  }

  function resetLocalRuntimeState(saved = {}) {
    state.role = saved.role || "guest";
    state.displayPatchApplied = false;
    state.lastDisplayPatchAt = "";
    state.playback = [];
    state.requests = [];
    state.observations = [];
    state.flow = [];
    state.fullDetails = Array.isArray(saved.fullDetails) ? saved.fullDetails : [];
    state.downloadTasks = saved.downloadTasks && typeof saved.downloadTasks === "object" ? saved.downloadTasks : {};
    state.downloadSnapshots = Array.isArray(saved.downloadSnapshots) ? saved.downloadSnapshots : [];
    state.accountPool = Array.isArray(saved.accountPool) ? saved.accountPool : [];
    state.selectedFullAccountId = saved.selectedFullAccountId || state.accountPool[0]?.id || "";
    state.remote = saved.remote || null;
    if (fields.fullTrace) fields.fullTrace.value = "";
    if (fields.guestTrace) fields.guestTrace.value = "";
    if (views.exportBox) views.exportBox.textContent = "{}";
    renderPlayback();
    renderObservations();
    renderFlow();
    renderAccounts();
    renderFullDetails();
    renderDownloads();
    renderSession();
    publishState();
  }

  async function clearDataCache() {
    const ok = window.confirm("将清除插件本地数据、账号池缓存、播放详情缓存和保存记录，并重置为当前版本默认状态。新版本覆盖安装时会自动清理旧缓存，此按钮用于手动兜底。是否继续？");
    if (!ok) return;
    window.postMessage({ source: "txzz-content", kind: "clear-runtime-cache" }, "*");
    const response = await sendRuntime("clearAllData");
    resetLocalRuntimeState(response.state || {});
    await collectSession().catch(() => {});
    emitFlow("清除缓存", "已清除插件旧数据缓存，建议刷新当前页面后继续使用", "ok");
  }

  function payloadValue(key, fallback = "") {
    const payload = uiState.lastActionPayload || {};
    if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
    return fallback;
  }

  function payloadText(key, fallback = "") {
    return String(payloadValue(key, fallback) ?? "").trim();
  }

  function accountFromForm(payload = uiState.lastActionPayload || {}) {
    uiState.lastActionPayload = payload || {};
    const label = payloadText("accountLabel", payloadText("accountNickname"));
    const username = payloadText("accountUsername");
    const slugSource = username || label;
    const slugValue = slugSource.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
    const id = payloadText("accountId") || (slugValue ? `full-${slugValue}` : `full-local-${Date.now()}`);
    const mode = payloadText("accountCredentialMode", "password") || "password";
    const account = {
      id,
      label: label || username || id,
      username: mode === "password" ? username : "",
      password: mode === "password" ? String(payloadValue("accountPassword", "")) : "",
      deviceId: mode === "token" ? payloadText("accountDeviceId") : "",
      userToken: mode === "token" ? payloadText("accountToken") : "",
      qrcode: mode === "qrcode" ? payloadText("accountQrcode") : "",
      notes: payloadText("accountNotes"),
      source: "manual"
    };
    if (mode === "qrcode" && !account.label && !account.id) account.label = "账号凭证";
    return account;
  }

  function validateAccountCredential(account = {}, mode = payloadText("accountCredentialMode", "password") || "password") {
    if (mode === "password" && (!account.username || !account.password)) {
      throw new Error("账号密码模式需要填写用户名和密码");
    }
    if (mode === "qrcode" && !account.qrcode) {
      throw new Error("账号凭证模式需要填写账号凭证内容");
    }
    if (mode === "token" && (!account.deviceId || !account.userToken)) {
      throw new Error("token/deviceId 模式需要同时填写 deviceId 和 userToken");
    }
  }

  async function saveAccount(payload = uiState.lastActionPayload || {}) {
    const selected = uiState.editingAccountId ? state.accountPool.find((item) => item.id === uiState.editingAccountId) : null;
    if (selected && isCloudAccount(selected)) throw new Error("云端账号只显示脱敏摘要，不能在插件前端修改；请先切换到本地账号或新建本地账号。");
    const account = accountFromForm(payload);
    validateAccountCredential(account, payloadText("accountCredentialMode", "password") || "password");
    const existing = state.accountPool.find((item) => item.id === account.id);
    if (existing && isCloudAccount(existing) && existing.id !== uiState.editingAccountId) throw new Error("云端账号只显示摘要，不能用同 ID 覆盖；请换一个账号 ID");
    const response = await sendRuntime("upsertAccount", { account });
    syncSavedState(response.state || {});
    closeAccountForm();
    emitFlow("账号池", `已保存 ${account.label || account.username}`, "ok");
  }

  async function saveRemoteConfig(payload = uiState.lastActionPayload || {}) {
    const accountSourceMode = String(payload.accountSourceMode || state.remote?.accountSourceMode || "cloud");
    const response = await sendRuntime("saveRemoteConfig", {
      remote: {
        baseUrl: String(payload.remoteBaseUrl ?? state.remote?.baseUrl ?? "").trim(),
        accountSourceMode,
        fixedAccountId: "",
        enabled: true,
        fallbackLocal: accountSourceMode === "cloud-first"
      }
    });
    syncSavedState(response.state || {});
    emitFlow("远程账号池", "已保存 Worker 配置并尝试同步账号池", "ok");
  }

  async function syncRemoteAccounts() {
    emitFlow("云端账号", "正在同步云端账号池");
    const response = await sendRuntime("syncRemoteAccounts");
    syncSavedState(response.state || {});
    const remote = response.state?.remote || {};
    if (remote.lastError) emitFlow("远程账号池同步失败", remote.lastError, "error");
    else {
      const accounts = response.state?.accountPool || [];
      const cloudCount = accounts.filter(isCloudAccount).length;
      emitFlow("远程账号池", `已从 Cloudflare Worker 同步 ${accounts.length} 个账号`, "ok");
      emitFlow("云端账号", `云端可轮换账号 ${cloudCount} 个`, "ok");
    }
  }

  async function uploadAccountRemote(payload = uiState.lastActionPayload || {}) {
    const selected = uiState.editingAccountId ? state.accountPool.find((item) => item.id === uiState.editingAccountId) : null;
    if (selected && isCloudAccount(selected)) throw new Error("云端账号只显示脱敏摘要，不能直接重复上传；请先在表单中新建本地账号或导入当前会话。");
    const account = accountFromForm(payload);
    validateAccountCredential(account, payloadText("accountCredentialMode", "password") || "password");
    const existing = state.accountPool.find((item) => item.id === account.id);
    if (existing && isCloudAccount(existing) && existing.id !== uiState.editingAccountId) throw new Error("云端已有同 ID 账号，不能重复覆盖；请换一个账号 ID");
    const response = await sendRuntime("uploadAccountToRemote", { account });
    syncSavedState(response.state || {});
    closeAccountForm();
    emitFlow("远程账号池", `已上传 ${account.label || account.username} 到 Worker，凭据由服务端加密保存`, "ok");
  }

  async function uploadLocalAccountRemote(accountId) {
    const account = state.accountPool.find((item) => item.id === accountId);
    if (!account) throw new Error(`未找到账号：${accountId}`);
    if (isCloudAccount(account)) throw new Error("该账号已经是云端摘要，不需要重复上传");
    const response = await sendRuntime("uploadLocalAccountToRemote", { accountId });
    syncSavedState(response.state || {});
    emitFlow("远程账号池", `已上传 ${accountTitle(account)}，账号池已更新为云端只读摘要`, "ok");
  }

  async function downloadFullVideo(movieId = currentMovieId()) {
    const id = String(movieId || currentMovieId()).trim();
    if (!id) throw new Error("当前页面不是视频详情页，无法识别视频编号");
    if (downloadLocks.has(id)) {
    emitFlow("视频下载", `视频 ${id} 下载任务已经在创建中，请稍候`, "ok");
      showToast("下载任务已经在创建中", "ok");
      return { ok: true, locked: true, movieId: id };
    }
    downloadLocks.add(id);
    emitFlow("视频下载", `开始获取视频 ${id}`);
    emitFlow("云端账号", `正在为视频 ${id} 轮换可用账号`);
    showToast("正在获取视频链接");
    try {
      const bootstrapSession = await collectSession();
      const response = await sendRuntime("downloadFullVideo", {
        movieId: id,
        movieTitle: currentMovieTitle(),
        accountId: state.selectedFullAccountId,
        bootstrapSession
      });
      if (response.state) syncSavedState(response.state);
      const mode = response.mode === "m3u8-merged-ts" ? "m3u8 分片合并" : "直接下载";
      emitFlow("视频下载", `${mode} 已创建下载任务：${response.filename || id}`, "ok");
      showToast(`${mode}任务已创建`, "ok");
      if (response.summary) {
        emitCloudAccountFlow(response.summary, id);
        state.fullDetails.push({
          ...response.summary,
          movieId: response.summary.movieId || id,
          playLink: response.summary.playLink || response.url || ""
        });
        state.fullDetails = state.fullDetails.slice(-80);
        renderFullDetails();
      }
      return response;
    } catch (err) {
      emitFlow("视频下载失败", err?.message || String(err), "error");
      emitFlow("云端账号失败", err?.message || String(err), "error");
      showToast(`下载失败：${err?.message || String(err)}`, "error");
      throw err;
    } finally {
      window.setTimeout(() => downloadLocks.delete(id), 1200);
    }
  }

  async function saveDownloadRecords() {
    const response = await sendRuntime("saveDownloadSnapshot");
    syncSavedState(response.state || {});
    emitFlow("下载管理", `已保存当前下载记录：${response.snapshot?.label || "下载记录"}`, "ok");
    showToast("下载记录已保存", "ok");
  }

  async function copyDownloadRecords() {
    const payload = {
      tasks: downloadTasksArray(),
      snapshots: Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots : [],
      exportedAt: new Date().toISOString()
    };
    await copyText(JSON.stringify(payload, null, 2), "下载数据");
  }

  async function copyDownloadUrl(taskId = "") {
    const task = (state.downloadTasks || {})[taskId];
    await copyFullUrl(task?.url || "", "完整下载链接");
  }

  async function copyFilteredDownloadUrls(taskIds = []) {
    const ids = Array.isArray(taskIds) ? taskIds.map((item) => String(item || "")) : [];
    const idSet = new Set(ids.filter(Boolean));
    const tasks = downloadTasksArray().filter((task) => !idSet.size || idSet.has(String(task.taskId || "")));
    // 批量复制仍统一补全域名，保证每一行都是可直接使用的完整下载地址。
    const urls = [];
    for (const task of tasks) {
      const url = normalizeUrl(task.url || "");
      if (url && !urls.includes(url)) urls.push(url);
    }
    await copyText(urls.join("\n"), "筛选下载完整链接");
  }

  async function copyDownloadSnapshot(snapshotId = "") {
    const snapshot = (state.downloadSnapshots || []).find((item) => item.id === snapshotId);
    await copyText(snapshot ? JSON.stringify(snapshot, null, 2) : "", "保存记录");
  }

  async function saveDownloadDevice(taskId = "") {
    const response = await sendRuntime("saveDownloadToDevice", { taskId });
    syncSavedState(response.state || {});
    emitFlow("下载管理", "已弹出保存到设备窗口或完成保存", "ok");
    showToast("已处理保存到设备", "ok");
  }

  async function saveReadyDownloads(taskIds = []) {
    const ids = Array.isArray(taskIds) ? taskIds.map((item) => String(item || "")).filter(Boolean) : [];
    if (!ids.length) {
      emitFlow("下载管理", "当前筛选没有可保存任务", "error");
      return;
    }
    let success = 0;
    let lastState = null;
    const errors = [];
    // 浏览器下载保存可能弹出系统确认，批量入口按顺序处理，避免同时打开过多保存任务。
    for (const taskId of ids) {
      try {
        const response = await sendRuntime("saveDownloadToDevice", { taskId });
        success += 1;
        lastState = response.state || lastState;
      } catch (err) {
        errors.push(err?.message || String(err));
      }
    }
    if (lastState) syncSavedState(lastState);
    else await refreshLocalDownloadState();
    if (errors.length) emitFlow("下载管理", `已处理 ${success} 个可保存任务，${errors.length} 个失败`, success ? "ok" : "error");
    else emitFlow("下载管理", `已处理 ${success} 个可保存任务`, "ok");
    showToast(`已处理 ${success} 个可保存任务`, success ? "ok" : "error");
  }

  async function removeDownloadTask(taskId = "", movieId = "") {
    const response = await sendRuntime("removeDownloadTask", { taskId, movieId });
    syncSavedState(response.state || {});
    emitFlow("下载管理", `已删除视频 ${movieId || taskId} 的下载任务`, "ok");
  }

  async function clearDownloadTasks() {
    const ok = window.confirm("将清空插件面板里的当前下载任务记录，不会删除已经保存到浏览器下载目录的文件。是否继续？");
    if (!ok) return;
    const response = await sendRuntime("clearDownloadTasks");
    syncSavedState(response.state || {});
    emitFlow("下载管理", "已清空当前下载任务记录", "ok");
  }

  async function clearDownloadSnapshots() {
    const ok = window.confirm("将清空下载页里的保存记录，不会删除当前任务和本地文件。是否继续？");
    if (!ok) return;
    const response = await sendRuntime("clearDownloadSnapshots");
    syncSavedState(response.state || {});
    emitFlow("下载管理", "已清空保存记录", "ok");
  }

  async function openDownloadFolder() {
    await sendRuntime("openDownloadFolder");
    emitFlow("下载管理", "已请求浏览器打开下载目录", "ok");
  }

  async function selectAccount(accountId) {
    const account = state.accountPool.find((item) => item.id === accountId);
    if (account && isCloudAccount(account)) {
      emitFlow("账号池", "云端账号由系统按金币数量自动轮换，不支持手动固定选择", "ok");
      renderAccounts();
      return;
    }
    const response = await sendRuntime("selectAccount", { accountId });
    syncSavedState(response.state || {});
    emitFlow("账号池", `已选择 ${accountTitle(selectedAccount())}`, "ok");
  }

  async function verifyAccount(accountId = state.selectedFullAccountId) {
    emitFlow("账号检查", `开始检查 ${accountId || "选中账号"}`);
    const session = await collectSession();
    const response = await sendRuntime("verifyAccount", { accountId, bootstrapSession: session });
    syncSavedState(response.state || {});
    const account = response.account || selectedAccount();
    emitFlow("账号检查", `${accountTitle(account)} 状态正常`, "ok");
  }

  async function removeAccount(accountId) {
    const response = await sendRuntime("removeAccount", { accountId });
    syncSavedState(response.state || {});
    emitFlow("账号池", "已移除账号或保留默认种子账号", "ok");
  }

  async function importCurrentSession() {
    const session = await collectSession();
    const response = await sendRuntime("importAccountSession", { session, label: session.nickname ? `${session.nickname} 页面会话` : "" });
    syncSavedState(response.state || {});
    emitFlow("账号池", "已导入当前页面 token/deviceId 为账号池账号", "ok");
  }

  function installHook() {
    injectMainWorldScript("nav_guard.js", "txzzNavGuardInjected");
    injectMainWorldScript("page_hook.js", "txzzPageHookInjected");
  }

  function togglePanel(force) {
    if (ignoreNextToggle && force !== true) {
      ignoreNextToggle = false;
      return;
    }
    syncViewportVars();
    state.expanded = typeof force === "boolean" ? force : !state.expanded;
    publishState();
    if (state.expanded) {
      collectSession().catch(() => {});
      loadSavedState(false).catch(() => {});
      remindRepositoryUpdateOnPanelOpen();
    }
  }

  async function refreshFullDetail(movieId = currentMovieId()) {
    const id = String(movieId || currentMovieId()).trim();
    if (!id) throw new Error("当前页面不是视频详情页，无法识别视频编号");
    emitFlow("播放资源", `正在刷新视频 ${id} 的播放线路`);
    showToast("正在刷新播放资源");
    const bootstrapSession = await collectSession();
    const response = await sendRuntime("getFullDetail", {
      movieId: id,
      movieTitle: currentMovieTitle(),
      accountId: state.selectedFullAccountId,
      bootstrapSession
    });
    if (response.state) syncSavedState(response.state);
    if (response.summary) {
      emitCloudAccountFlow(response.summary, id);
      emitFlow(
        response.summary.playLink || response.summary.backupLink ? "播放资源" : "播放资源缺少链接",
        response.summary.playLink || response.summary.backupLink
          ? `已刷新 ${response.summary.movieId || id} 的播放线路`
          : `视频 ${response.summary.movieId || id} 未返回可播放链接`,
        response.summary.playLink || response.summary.backupLink ? "ok" : "error"
      );
    }
    renderFullDetails();
    showToast("播放资源已刷新", "ok");
    return response;
  }

  function switchTab(tab) {
    const targetTab = PAGE_TITLES[tab] ? tab : "overview";
    if (views.pageTitle) views.pageTitle.textContent = PAGE_TITLES[targetTab] || "功能面板";
  }

  function syncActionPayloadToFields(payload = {}) {
    uiState.lastActionPayload = payload || {};
    const mapping = {
      remoteBaseUrl: "remoteBaseUrl",
      accountSourceMode: "accountSourceMode",
      showInvalidCloudAccounts: "showInvalidCloudAccounts",
      accountCredentialMode: "accountCredentialMode",
      accountLabel: "accountLabel",
      accountNickname: "accountNickname",
      accountUsername: "accountUsername",
      accountPassword: "accountPassword",
      accountDeviceId: "accountDeviceId",
      accountToken: "accountToken",
      accountQrcode: "accountQrcode",
      accountNotes: "accountNotes"
    };
    Object.entries(mapping).forEach(([key, fieldName]) => {
      if (!(key in payload) || !fields[fieldName]) return;
      const field = fields[fieldName];
      if (field.type === "checkbox") {
        field.checked = Boolean(payload[key]);
      } else {
        field.value = String(payload[key] ?? "");
      }
    });
    if (payload.accountNickname && fields.accountLabel) fields.accountLabel.value = String(payload.accountNickname || "");
    if (payload.accountCredentialMode) setAccountCredentialMode(String(payload.accountCredentialMode));
    if (Object.prototype.hasOwnProperty.call(payload, "showInvalidCloudAccounts")) {
      uiState.showInvalidCloudAccounts = Boolean(payload.showInvalidCloudAccounts);
      renderAccounts();
    }
  }

  async function handleTxzzAction(action, payload = {}) {
    if (!action) return;
    syncActionPayloadToFields(payload);
    const accountId = payload.accountId || state.selectedFullAccountId;
    try {
      if (action === "noop") return;
      if (action === "toggle") togglePanel(typeof payload.force === "boolean" ? payload.force : undefined);
      if (action === "close") togglePanel(false);
      if (action === "about") {
        openRepositoryHome();
        emitFlow("关于", "已打开糖心志者项目主页", "ok");
      }
      if (action === "refresh") {
        await collectSession();
        await loadSavedState(false);
        emitFlow("刷新状态", "已重新读取当前页面会话与账号池", "ok");
      }
      if (action === "apply") await applyDisplayPatch();
      if (action === "set-role-full") {
        state.role = "full";
        await collectSession();
        emitFlow("会话角色", "已标记为账号池会话", "ok");
      }
      if (action === "set-role-guest") {
        state.role = "guest";
        await collectSession();
        emitFlow("会话角色", "已标记为当前页面会话", "ok");
      }
      if (action === "load-saved") await loadSavedState();
      if (action === "copy-latest") {
        const latest = [...state.playback].reverse().find((item) => item.url && !["play-api", "video-api"].includes(item.category)) || state.playback[state.playback.length - 1];
        await copyPlayableUrl(latest?.url || "", "最新完整播放链接");
      }
      if (action === "copy-full-link") {
        const latest = state.fullDetails[state.fullDetails.length - 1];
        await copyPlayableUrl(latest?.playLink || latest?.backupLink || "", "最近完整播放链接");
      }
      if (action === "copy-play-link") {
        const latest = state.fullDetails[state.fullDetails.length - 1];
        await copyPlayableUrl(payload.url || latest?.playLink || "", payload.label || "主线路完整链接");
      }
      if (action === "copy-backup-link") {
        const latest = state.fullDetails[state.fullDetails.length - 1];
        await copyPlayableUrl(payload.url || latest?.backupLink || "", payload.label || "备用线路完整链接");
      }
      if (action === "copy-playback-health-report") {
        await copyText(String(payload.report || ""), "播放资源体检报告");
      }
      if (action === "copy-observations") {
        await copyText(JSON.stringify(state.observations.slice(-80), null, 2), "判定记录");
      }
      if (action === "select-account") await selectAccount(accountId);
      if (action === "verify-account") await verifyAccount(accountId);
      if (action === "show-account-summary") {
        const account = state.accountPool.find((item) => item.id === accountId);
        const status = accountStatusInfo(account);
        emitFlow("云端账号摘要", `${accountNickname(account)} / ${status.label} / ${status.reason}`, status.ok ? "ok" : "error");
      }
      if (action === "open-account-form") openAccountForm();
      if (action === "close-account-form") closeAccountForm();
      if (action === "choose-account-type") openAccountForm(null, payload.credentialMode || payload.accountCredentialMode || "password");
      if (action === "back-account-type") backAccountTypePicker();
      if (action === "edit-account") {
        const account = state.accountPool.find((item) => item.id === accountId);
        if (!account) throw new Error(`未找到账号：${accountId}`);
        openAccountForm(account);
      }
      if (action === "remove-account") await removeAccount(accountId);
      if (action === "save-account") await saveAccount(payload);
      if (action === "save-remote") await saveRemoteConfig(payload);
      if (action === "sync-remote") await syncRemoteAccounts();
      if (action === "upload-account-remote") await uploadAccountRemote(payload);
      if (action === "upload-local-account-remote") await uploadLocalAccountRemote(accountId);
      if (action === "refresh-full-detail") await refreshFullDetail(payload.movieId || currentMovieId());
      if (action === "download-full-video") await downloadFullVideo(payload.movieId || currentMovieId());
      if (action === "refresh-downloads") {
        await refreshLocalDownloadState();
        emitFlow("下载管理", "已刷新下载任务状态", "ok");
      }
      if (action === "save-downloads") await saveDownloadRecords();
      if (action === "copy-downloads") await copyDownloadRecords();
      if (action === "copy-download-url") await copyDownloadUrl(payload.taskId || "");
      if (action === "copy-filtered-download-urls") await copyFilteredDownloadUrls(payload.taskIds || []);
      if (action === "copy-download-snapshot") await copyDownloadSnapshot(payload.snapshotId || "");
      if (action === "save-download-device") await saveDownloadDevice(payload.taskId || "");
      if (action === "save-ready-downloads") await saveReadyDownloads(payload.taskIds || []);
      if (action === "remove-download-task") await removeDownloadTask(payload.taskId || "", payload.movieId || "");
      if (action === "clear-downloads") await clearDownloadTasks();
      if (action === "clear-download-snapshots") await clearDownloadSnapshots();
      if (action === "open-download-folder") await openDownloadFolder();
      if (action === "import-current-session") await importCurrentSession();
      if (action === "export") {
        const trace = await exportTrace();
        if (views.exportBox) views.exportBox.textContent = JSON.stringify(trace, null, 2);
        if (state.role === "guest" && fields.guestTrace) fields.guestTrace.value = JSON.stringify(trace, null, 2);
        if (state.role === "full" && fields.fullTrace) fields.fullTrace.value = JSON.stringify(trace, null, 2);
        emitFlow("导出记录", `已导出 ${trace.playback.length} 条播放记录，${trace.observations.length} 条接口记录`, "ok");
      }
      if (action === "save") {
        const trace = await exportTrace();
        await sendRuntime("saveTrace", trace);
        if (views.exportBox) views.exportBox.textContent = JSON.stringify(trace, null, 2);
        emitFlow("保存记录", "已保存到扩展本地存储", "ok");
      }
      if (action === "clear") {
        state.playback = [];
        state.requests = [];
        state.observations = [];
        state.flow = [];
        renderPlayback();
        renderObservations();
        renderFlow();
        if (views.exportBox) views.exportBox.textContent = "{}";
        emitFlow("清空", "已清空当前会话捕获记录", "ok");
      }
      if (action === "clear-cache") await clearDataCache();
      if (action === "check-update") await checkRepositoryUpdate(true, { realtime: true });
      if (action === "download-latest") {
        const latest = await checkRepositoryUpdate(true, { realtime: true, silent: true });
        const response = await sendRuntime("downloadRepositoryArchive", {
          version: latest?.remote?.version || uiState.repositoryUpdate?.remote?.version || "",
          build: latest?.remote?.build || uiState.repositoryUpdate?.remote?.build || "",
          url: latest?.downloadUrl || uiState.repositoryUpdate?.downloadUrl || ""
        });
        emitFlow("版本更新", response.downloadId ? `已开始下载最新版压缩包：${response.filename}` : "已提交最新版下载任务", "ok");
      }
      if (action === "show-update-dialog") {
        if (uiState.repositoryUpdate?.updateAvailable) showRepositoryUpdateDialog(uiState.repositoryUpdate);
        else await checkRepositoryUpdate(true);
      }
      if (action === "compare") await compareTraces();
    } catch (err) {
      emitFlow("操作失败", err?.message || String(err), "error");
    }
  }

  window.addEventListener("txzz:ui-action", (event) => {
    const detail = event.detail || {};
    handleTxzzAction(detail.action, detail.payload || {}).catch((err) => {
      emitFlow("操作失败", err?.message || String(err), "error");
    });
  });

  window.addEventListener("txzz:ui-ready", () => {
    publishState();
  });

  function startDrag(event) {
    if (event.type === "mousedown" && event.button !== 0) return;
    const fromBall = Boolean(event.target.closest(".txzz-ball"));
    if (!fromBall && event.target.closest("button,input,textarea,select,a,[data-action],[data-tab]")) return;
    if (state.expanded && isCompactViewport()) return;
    const point = event.touches ? event.touches[0] : event;
    const target = state.expanded ? shell : ball;
    if (state.expanded && !event.target.closest("[data-drag-handle]")) return;
    const rect = target.getBoundingClientRect();
    drag = {
      target,
      x: point.clientX,
      y: point.clientY,
      left: rect.left,
      top: rect.top,
      panel: state.expanded,
      touch: Boolean(event.touches) || event.pointerType === "touch",
      moved: false
    };
    if (event.cancelable) event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag) return;
    const point = event.touches ? event.touches[0] : event;
    const dx = point.clientX - drag.x;
    const dy = point.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    const visual = window.visualViewport;
    const minLeft = Math.round(visual?.offsetLeft || 0) + 8;
    const minTop = Math.round(visual?.offsetTop || 0) + 8;
    const viewportWidth = Math.round(visual?.width || window.innerWidth || document.documentElement.clientWidth || 390);
    const viewportHeight = Math.round(visual?.height || window.innerHeight || document.documentElement.clientHeight || 640);
    const maxLeft = Math.max(minLeft, minLeft + viewportWidth - drag.target.offsetWidth - 16);
    const maxTop = Math.max(minTop, minTop + viewportHeight - drag.target.offsetHeight - 16);
    const left = Math.min(Math.max(minLeft, drag.left + dx), maxLeft);
    const top = Math.min(Math.max(minTop, drag.top + dy), maxTop);
    if (drag.panel) {
      shell.style.setProperty("--txzz-left", `${left}px`);
      shell.style.setProperty("--txzz-top", `${top}px`);
      panel.classList.add("txzz-dragged");
    } else {
      ball.style.left = `${left}px`;
      ball.style.top = `${top}px`;
      ball.style.right = "auto";
      ball.style.bottom = "auto";
    }
    if (event.cancelable) event.preventDefault();
  }

  function endDrag(event) {
    const current = drag;
    if (current?.touch && !current.panel && !current.moved) {
      togglePanel(true);
      ignoreNextToggle = true;
      window.setTimeout(() => {
        ignoreNextToggle = false;
      }, 350);
      if (event?.cancelable) event.preventDefault();
    } else if (current?.moved && !current.panel) {
      ignoreNextToggle = true;
      window.setTimeout(() => {
        ignoreNextToggle = false;
      }, 120);
    }
    drag = null;
  }

  function pointerOpenFallback(event) {
    if (state.expanded || drag?.moved || ignoreNextToggle) return;
    togglePanel(true);
    ignoreNextToggle = true;
    window.setTimeout(() => {
      ignoreNextToggle = false;
    }, 250);
    if (event?.cancelable) event.preventDefault();
  }

  function handleNativeDownloadClick(event) {
    const movieId = currentMovieId();
    const trigger = findDownloadTrigger(event.target);
    if (!movieId || !trigger) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    emitFlow("视频下载", `已接管详情页下载按钮：${movieId}`);
    showToast("已接管下载按钮，正在创建任务");
    downloadFullVideo(movieId).catch(() => {});
    return true;
  }

  function bindVisibleDownloadButtons() {
    if (!currentMovieId()) return;
    const selectors = [
      ".van-grid-item",
      ".van-grid-item__content",
      ".van-grid-item__text",
      ".van-button",
      ".van-cell",
      "button",
      "a",
      "[role='button']"
    ].join(",");
    document.querySelectorAll(selectors).forEach((el) => {
      if (el.dataset?.txzzDownloadBound === "1") return;
      if (!findDownloadTrigger(el)) return;
      el.dataset.txzzDownloadBound = "1";
      el.addEventListener("click", handleNativeDownloadClick, true);
      el.setAttribute("data-txzz-download-trigger", "1");
    });
  }

  function installDownloadInterceptor() {
    document.addEventListener("click", handleNativeDownloadClick, true);
    const observer = new MutationObserver(() => bindVisibleDownloadButtons());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(bindVisibleDownloadButtons, 1200);
    bindVisibleDownloadButtons();
  }

  async function handleFullDetailRequest(payload) {
    emitFlow("播放资源", `记录视频详情接口，视频 ${payload.movieId}`);
    emitFlow("云端账号", `正在为视频 ${payload.movieId} 轮换可用账号`);
    try {
      const bootstrapSession = await collectSession();
      const response = await sendRuntime("getFullDetail", {
        movieId: payload.movieId,
        visitorDetail: payload.visitorDetail,
        accountId: state.selectedFullAccountId,
        bootstrapSession
      });
      window.postMessage({
        source: "txzz-content",
        kind: "full-detail-response",
        id: payload.id,
        payload: { ok: true, ...response }
      }, "*");
      if (response.summary) {
        const fullDetail = response.detail || response.data || {};
        const summary = {
          ...response.summary,
          playLink: response.summary.playLink || fullDetail.play_link || fullDetail.playLink || fullDetail.play_url || fullDetail.playUrl || fullDetail.m3u8_url || fullDetail.m3u8 || "",
          backupLink: response.summary.backupLink || fullDetail.backup_link || fullDetail.backupLink || fullDetail.backup_url || fullDetail.backupUrl || ""
        };
        state.fullDetails.push(summary);
        state.fullDetails = state.fullDetails.slice(-80);
        renderFullDetails();
        addObservation({
          kind: "fullplay",
          via: "账号池播放详情",
          url: summary.playLink || summary.backupLink || "",
          category: "fullplay",
          flags: [summary.action || "full_detail", `movie:${summary.movieId}`],
          bodyHead: JSON.stringify(summary)
        });
        if (summary.playLink) addPlayback({ kind: "media", via: "fullplay.play_link", url: summary.playLink, category: "m3u8" });
        if (summary.backupLink) addPlayback({ kind: "media", via: "fullplay.backup_link", url: summary.backupLink, category: "m3u8" });
        emitCloudAccountFlow(summary, payload.movieId);
        emitFlow(
          summary.playLink || summary.backupLink ? "播放资源" : "播放资源缺少链接",
          summary.playLink || summary.backupLink
            ? `已返回 ${summary.movieId} / ${summary.accountLabel || summary.accountUser || "自动轮换账号"}`
            : `播放详情 ${summary.movieId} 未返回 play_link 或 backup_link`,
          summary.playLink || summary.backupLink ? "ok" : "error"
        );
      }
      if (response.state) syncSavedState(response.state);
    } catch (err) {
      window.postMessage({
        source: "txzz-content",
        kind: "full-detail-response",
        id: payload.id,
        payload: { ok: false, error: err?.message || String(err) }
      }, "*");
      emitFlow("播放资源失败", err?.message || String(err), "error");
      emitFlow("云端账号失败", err?.message || String(err), "error");
    }
  }

  window.addEventListener("resize", syncViewportVars);
  window.addEventListener("orientationchange", () => window.setTimeout(syncViewportVars, 80));
  window.visualViewport?.addEventListener("resize", syncViewportVars);
  window.visualViewport?.addEventListener("scroll", syncViewportVars);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "txzz-page-hook") return;
    const { kind, payload = {} } = event.data;
    if (kind === "full-detail-request") {
      handleFullDetailRequest(payload);
      return;
    }
    const record = { kind, ...payload };
    if (kind === "request" || kind === "response") {
      state.requests.push(record);
      state.requests = state.requests.slice(-220);
    }
    if (kind === "media" || PLAYBACK_CATEGORIES.has(record.category)) {
      addPlayback(record);
    }
    if (kind === "observation" || kind === "fullplay-hit" || kind === "fullplay-success" || kind === "fullplay-error" || OBSERVATION_CATEGORIES.has(record.category) || (record.flags || []).length) {
      addObservation(record.category ? record : { ...record, category: kind.startsWith("fullplay") ? "fullplay" : "permission-api" });
    }
    for (const mediaUrl of Array.isArray(record.mediaUrls) ? record.mediaUrls : []) {
      addPlayback({ kind: "media", via: `${record.via || kind}.body`, url: mediaUrl, category: /\.(m3u8)(?:[?#]|$)/i.test(mediaUrl) ? "m3u8" : /\.mp4(?:[?#]|$)/i.test(mediaUrl) ? "mp4" : "video-api", ts: record.ts });
    }
    if (kind === "hook") emitFlow("页面监听", `${payload.target} ${payload.status}`, "ok");
    if (kind === "fullplay-status") emitFlow("播放资源", payload.message || "状态更新", payload.level === "error" ? "error" : "ok");
  });

  installHook();
  installDownloadInterceptor();
  syncViewportVars();
  collectSession().catch(() => {});
  applyDisplayPatch().catch(() => {});
  installVisibleDisplayLoop();
  loadSavedState(false).catch((err) => emitFlow("账号池", err?.message || String(err), "error"));
  window.setTimeout(() => checkRepositoryUpdate(false, { showDialog: false, silent: true }).catch(() => {}), 1800);
  window.setInterval(() => {
    if (Object.keys(state.downloadTasks || {}).length) {
      refreshLocalDownloadState().catch(() => {});
    }
  }, 1500);
  renderFlow();
  renderPlayback();
  renderObservations();
  renderFullDetails();
  renderDownloads();
})();
