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
    "permission-api": "权限判定",
    "fullplay": "完整播放",
    "account": "账号池",
    "request": "请求"
  };
  const PLAYBACK_CATEGORIES = new Set(["m3u8", "mp4", "segment", "play-api", "video-api"]);
  const OBSERVATION_CATEGORIES = new Set(["purchase-api", "payment-api", "balance-api", "permission-api", "fullplay", "account"]);

  const panel = document.createElement("section");
  panel.id = "txzz-panel";
  panel.className = "txzz-closed";
  panel.innerHTML = `
    <button class="txzz-ball" data-action="toggle" title="展开糖心志者" aria-label="展开糖心志者">
      <span>志</span>
    </button>
    <div class="txzz-toast" data-view="toast" aria-live="polite"></div>
    <div class="txzz-shell" role="dialog" aria-label="糖心志者安全测试面板">
      <header class="txzz-head">
        <div class="txzz-brand" data-drag-handle>
          <i>志</i>
          <div>
            <strong>糖心志者</strong>
            <small data-view="subtitle">账号池驱动的完整播放链路验证</small>
          </div>
        </div>
        <div class="txzz-head-actions">
          <button data-action="refresh" title="刷新状态" aria-label="刷新状态">刷</button>
          <button data-action="close" title="关闭面板" aria-label="关闭面板">关</button>
        </div>
      </header>
      <main class="txzz-main">
        <section class="txzz-hero">
          <div>
            <span>糖心志者 · 沙箱权限验证</span>
            <strong>永久会员 · 永久尤物圈 · 999 余额</strong>
            <small>完整账号池、游客链路替换、金币视频购买判定与播放源对比</small>
          </div>
          <button class="txzz-primary" data-action="apply">应用展示覆盖</button>
        </section>

        <section class="txzz-grid">
          <article>
            <span>当前账号</span>
            <strong data-view="account">读取中</strong>
            <small data-view="accountMeta">等待页面会话</small>
          </article>
          <article>
            <span>账号状态</span>
            <strong data-view="rights">待应用</strong>
            <small data-view="rightsMeta">会员 / 尤物圈 / 余额</small>
          </article>
          <article>
            <span>完整账号池</span>
            <strong data-view="poolCount">0</strong>
            <small data-view="poolMeta">未选择完整账号</small>
          </article>
          <article>
            <span>完整播放</span>
            <strong data-view="fullplayCount">0</strong>
            <small data-view="latestFullplay">等待命中</small>
          </article>
        </section>

        <section class="txzz-tabs">
          <button class="is-active" data-tab="trace">链路</button>
          <button data-tab="permission">权限</button>
          <button data-tab="fullplay">完整播放</button>
          <button data-tab="downloads">下载</button>
          <button data-tab="accounts">账号池</button>
          <button data-tab="compare">对比</button>
          <button data-tab="tools">工具</button>
        </section>

        <section class="txzz-view is-active" data-view-panel="trace">
          <div class="txzz-flow" data-view="flow"></div>
          <div class="txzz-section-head">
            <strong>播放链路</strong>
            <button data-action="copy-latest">复制最新播放链接</button>
          </div>
          <div class="txzz-list" data-view="playback"></div>
        </section>

        <section class="txzz-view" data-view-panel="permission">
          <div class="txzz-section-head">
            <strong>权限与交易判定</strong>
            <button data-action="copy-observations">复制判定记录</button>
          </div>
          <div class="txzz-list txzz-observations" data-view="observations"></div>
        </section>

        <section class="txzz-view" data-view-panel="fullplay">
          <div class="txzz-section-head">
            <strong>完整播放命中</strong>
            <button data-action="copy-full-link">复制最近完整链接</button>
          </div>
          <div class="txzz-fullplay-card" data-view="fullplaySummary"></div>
          <div class="txzz-list" data-view="fullplayList"></div>
        </section>

        <section class="txzz-view" data-view-panel="downloads">
          <div class="txzz-download-hero">
            <div>
              <span>糖心志者 · 下载中枢</span>
              <strong>管理完整视频任务、保存记录和下载目录</strong>
              <small>实时显示完整链接任务状态，支持查看、复制、保存和清理。</small>
            </div>
            <button class="txzz-primary" data-action="refresh-downloads">刷新下载</button>
          </div>
          <div class="txzz-download-stats" data-view="downloadSummary"></div>
          <div class="txzz-download-actions">
            <button data-action="save-downloads">保存当前记录</button>
            <button data-action="copy-downloads">复制下载数据</button>
            <button data-action="open-download-folder">打开下载目录</button>
            <button class="txzz-danger-action" data-action="clear-downloads">清空任务</button>
          </div>
          <div class="txzz-section-head">
            <strong>当前任务</strong>
            <small data-view="downloadMeta">等待下载任务</small>
          </div>
          <div class="txzz-download-list" data-view="downloadList"></div>
          <div class="txzz-section-head">
            <strong>保存记录</strong>
            <button data-action="clear-download-snapshots">清空保存记录</button>
          </div>
          <div class="txzz-download-snapshots" data-view="downloadSnapshots"></div>
        </section>

        <section class="txzz-view" data-view-panel="accounts">
          <div class="txzz-remote-box">
            <div class="txzz-section-head txzz-section-head-tight">
              <strong>远程账号池</strong>
              <button data-action="sync-remote">同步远程</button>
            </div>
            <div class="txzz-remote-grid">
              <label>
                Worker URL
                <input data-field="remoteBaseUrl" placeholder="https://txzz-secure-pool.3199912548.workers.dev">
              </label>
              <label>
                Client Token
                <input data-field="remoteClientToken" type="password" placeholder="已内置，留空即可">
              </label>
              <label>
                Admin Token
                <input data-field="remoteAdminToken" type="password" placeholder="仅上传账号时填写，日常留空">
              </label>
              <label>
                账号来源
                <select data-field="accountSourceMode">
                  <option value="cloud">云端随机轮换</option>
                  <option value="cloud-fixed">固定云端账号</option>
                  <option value="local">本地选中账号</option>
                  <option value="cloud-first">云端优先，本地兜底</option>
                </select>
              </label>
              <label>
                固定云端账号
                <select data-field="remoteFixedAccountId">
                  <option value="">未选择</option>
                </select>
              </label>
            </div>
            <div class="txzz-form-actions">
              <button data-action="save-remote">保存远程配置</button>
              <button data-action="upload-account-remote">上传当前表单账号</button>
            </div>
            <small data-view="remoteMeta">远程未配置</small>
          </div>
          <div class="txzz-account-layout">
            <div>
              <div class="txzz-section-head txzz-section-head-tight">
                <strong>完整权限账号池</strong>
                <button data-action="verify-account">验证选中账号</button>
              </div>
              <div class="txzz-account-pool" data-view="accountPool"></div>
            </div>
            <form class="txzz-account-form" autocomplete="off">
              <label>
                账号 ID
                <input data-field="accountId" placeholder="留空按用户名生成">
              </label>
              <label>
                显示名称
                <input data-field="accountLabel" placeholder="例如：完整权限 01">
              </label>
              <label>
                用户名
                <input data-field="accountUsername" placeholder="lsyhook">
              </label>
              <label>
                密码
                <input data-field="accountPassword" type="password" placeholder="保存后可用于自动登录">
              </label>
              <label>
                deviceId
                <input data-field="accountDeviceId" placeholder="可选，导入 token 时必填">
              </label>
              <label>
                userToken
                <input data-field="accountToken" placeholder="可选：xxxxxxxx_userid">
              </label>
              <label class="txzz-wide">
                账号凭证二维码内容
                <textarea data-field="accountQrcode" spellcheck="false" placeholder="可选：从账号凭证二维码解析出的明文"></textarea>
              </label>
              <label class="txzz-wide">
                备注
                <input data-field="accountNotes" placeholder="用途、来源、权限说明">
              </label>
              <div class="txzz-form-actions">
                <button data-action="save-account">保存/更新账号</button>
                <button data-action="import-current-session">导入当前会话为完整账号</button>
              </div>
            </form>
          </div>
        </section>

        <section class="txzz-view" data-view-panel="compare">
          <div class="txzz-compare">
            <div>
              <label>完整权限账号链路 JSON</label>
              <textarea data-field="fullTrace" spellcheck="false" placeholder="完整权限侧导出的链路，或账号池自动获取的 fullDetails"></textarea>
            </div>
            <div>
              <label>游客账号链路 JSON</label>
              <textarea data-field="guestTrace" spellcheck="false" placeholder="游客侧自动生成，也可手动粘贴"></textarea>
            </div>
          </div>
          <button data-action="compare">生成对比</button>
          <pre data-view="compareResult">{}</pre>
        </section>

        <section class="txzz-view" data-view-panel="tools">
          <div class="txzz-tools">
            <button data-action="set-role-full">完整权限会话</button>
            <button data-action="set-role-guest">游客会话</button>
            <button data-action="load-saved">载入保存链路</button>
            <button data-action="export">导出链路</button>
            <button data-action="save">保存当前链路</button>
            <button data-action="clear">清空记录</button>
            <button class="txzz-danger-action" data-action="clear-cache">清除数据缓存</button>
          </div>
          <pre data-view="exportBox">{}</pre>
        </section>
      </main>
    </div>
  `;
  document.documentElement.appendChild(panel);

  const views = Object.fromEntries(Array.from(panel.querySelectorAll("[data-view]")).map((el) => [el.dataset.view, el]));
  const fields = Object.fromEntries(Array.from(panel.querySelectorAll("[data-field]")).map((el) => [el.dataset.field, el]));
  const shell = panel.querySelector(".txzz-shell");
  const ball = panel.querySelector(".txzz-ball");

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

  let drag = null;
  let ignoreNextToggle = false;
  let toastTimer = 0;
  const downloadLocks = new Set();
  const announcedDownloadStages = new Set();

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
    return role === "full" ? "完整权限会话" : "游客会话";
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
    return account?.label || account?.username || account?.id || "完整账号";
  }

  function selectedAccount() {
    return state.accountPool.find((item) => item.id === state.selectedFullAccountId) || state.accountPool[0] || null;
  }

  function remoteSourceLabel(mode) {
    if (mode === "local") return "本地选中账号";
    if (mode === "cloud-first") return "云端优先，本地兜底";
    if (mode === "cloud-fixed") return "固定云端账号";
    return "云端随机轮换";
  }

  function isCloudAccount(account = {}) {
    return ["remote", "qrcode", "remote-seed", "seed"].includes(account.source);
  }

  function cloudHasAccount(accountId = "") {
    return state.accountPool.some((item) => item.id === accountId && isCloudAccount(item));
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
    card.innerHTML = '<div class="txzz-row"><div><span>账号状态</span><strong>永久会员 · 永久尤物圈</strong><small>糖心志者展示覆盖已应用，当前页面按完整权限展示</small></div><div class="txzz-balance"><span>余额</span><strong>999</strong></div></div>';
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
      card.innerHTML = '<span>尤物圈权限</span><strong>永久尤物圈已开通</strong><small>权限弹窗与模糊遮罩已解除，可继续浏览当前列表</small>';
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
      panel.dataset.txzzState = JSON.stringify({
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
        publishedAt: new Date().toISOString()
      });
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
    views.flow.innerHTML = state.flow.slice(-8).map((item, index) => `
      <div class="txzz-step ${item.level === "ok" ? "is-ok" : item.level === "error" ? "is-error" : ""}">
        <i>${index + 1}</i>
        <div>
          <b>${escapeHtml(item.title)}</b>
          <span>${escapeHtml(item.detail)}</span>
        </div>
      </div>
    `).join("") || `<div class="txzz-empty">等待链路事件</div>`;
  }

  function renderStats() {
    const selected = selectedAccount();
    views.poolCount.textContent = String(state.accountPool.length);
    views.poolMeta.textContent = selected ? `${accountTitle(selected)} / ${selected.status || "idle"}` : "未选择完整账号";
    views.fullplayCount.textContent = String(state.fullDetails.length);
    const latest = state.fullDetails[state.fullDetails.length - 1];
    views.latestFullplay.textContent = latest ? `${latest.movieId} / ${latest.action || "full_detail"}` : "等待命中";
    publishState();
  }

  function downloadStageLabel(stage) {
    if (stage === "queued") return "已排队";
    if (stage === "playlist") return "读取播放列表";
    if (stage === "segments") return "准备分片";
    if (stage === "segment") return "下载分片";
    if (stage === "ready") return "合并完成，待保存";
    if (stage === "save-dialog") return "选择保存位置";
    if (stage === "complete") return "已保存到设备";
    if (stage === "error") return "下载失败";
    return stage || "下载任务";
  }

  function downloadFormatLabel(task = {}) {
    if (task.format === "mp4" || /\.mp4(?:[?#]|$)/i.test(task.filename || "")) return "MP4";
    if (task.format === "ts" || /\.ts(?:[?#]|$)/i.test(task.filename || "")) return "TS 兜底";
    return task.mode === "direct" ? "原始格式" : "转封装中";
  }

  function downloadStageTone(stage) {
    if (stage === "ready" || stage === "complete") return "is-ok";
    if (stage === "error") return "is-error";
    if (["queued", "playlist", "segments", "segment", "save-dialog"].includes(String(stage || ""))) return "is-running";
    return "";
  }

  function downloadProgress(task = {}) {
    const total = Number(task.total || 0);
    const current = Number(task.current || 0);
    if (task.stage === "complete") return 100;
    if (task.stage === "ready") return 100;
    if (!total) return task.stage === "queued" ? 2 : task.stage === "playlist" ? 6 : 0;
    return Math.max(0, Math.min(99, Math.round((current / total) * 100)));
  }

  function downloadCardTitle(task = {}) {
    const title = String(task.titleSnippet || task.movieTitle || "").trim();
    if (title) return title.length > 14 ? `${title.slice(0, 14)}...` : title;
    return task.movieId ? `完整视频 ${task.movieId}` : "完整视频";
  }

  function canSaveDownload(task = {}) {
    return task.stage === "ready" || task.stage === "complete" || (task.mode === "direct" && Boolean(task.url));
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return "未记录";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatTime(value) {
    if (!value) return "未记录";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function downloadTasksArray() {
    return Object.values(state.downloadTasks || {})
      .filter((task) => task && typeof task === "object")
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function downloadTaskStats(tasks = downloadTasksArray()) {
    return {
      total: tasks.length,
      running: tasks.filter((task) => ["queued", "playlist", "segments", "segment", "save-dialog"].includes(String(task.stage || ""))).length,
      completed: tasks.filter((task) => task.stage === "complete").length,
      failed: tasks.filter((task) => task.stage === "error").length
    };
  }

  function renderDownloads() {
    const tasks = downloadTasksArray();
    const stats = downloadTaskStats(tasks);
    if (views.downloadSummary) {
      views.downloadSummary.innerHTML = [
        ["总任务", stats.total],
        ["进行中", stats.running],
        ["已完成", stats.completed],
        ["失败", stats.failed]
      ].map(([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `).join("");
    }
    if (views.downloadMeta) {
      const latest = tasks[0];
      views.downloadMeta.textContent = latest
        ? `最近更新：${downloadStageLabel(latest.stage)} / ${formatTime(latest.updatedAt)}`
        : "等待下载任务";
    }
    if (views.downloadList) {
      views.downloadList.innerHTML = tasks.map((task) => {
        const percent = downloadProgress(task);
        const count = task.total ? `${Number(task.current || 0)}/${Number(task.total || 0)} 片` : "等待分片统计";
        const tone = downloadStageTone(task.stage);
        const canSave = canSaveDownload(task);
        const title = downloadCardTitle(task);
        const fullTitle = task.movieTitle || task.filename || title;
        return `
          <article class="txzz-download-card ${tone}">
            <div class="txzz-download-card-head">
              <div>
                <b title="${escapeHtml(fullTitle)}">${escapeHtml(title)}</b>
                <span>${escapeHtml([task.movieId ? `视频 ${task.movieId}` : "", downloadFormatLabel(task), downloadStageLabel(task.stage)].filter(Boolean).join(" / "))}</span>
              </div>
              <i>${escapeHtml(`${percent}%`)}</i>
            </div>
            <div class="txzz-progress" aria-label="下载进度">
              <span style="width:${percent}%"></span>
            </div>
            <div class="txzz-download-meta">
              <span>${escapeHtml(count)}</span>
              <span>${escapeHtml(formatBytes(task.bytes))}</span>
              <span>${escapeHtml(formatTime(task.updatedAt))}</span>
            </div>
            ${task.error ? `<p class="txzz-download-error">${escapeHtml(task.error)}</p>` : ""}
            ${task.transmuxError ? `<p class="txzz-download-warn">MP4 转封装失败，已保留 TS 兜底：${escapeHtml(task.transmuxError)}</p>` : ""}
            <p class="txzz-download-file">${escapeHtml(task.filename || "等待生成文件名")}</p>
            <code>${escapeHtml(task.url || "")}</code>
            <div class="txzz-account-actions">
              <button data-action="save-download-device" data-task-id="${escapeHtml(task.taskId || "")}" ${canSave ? "" : "disabled"}>${task.stage === "complete" ? "重新保存" : "保存到设备"}</button>
              <button data-action="copy-download-url" data-task-id="${escapeHtml(task.taskId || "")}">复制链接</button>
              <button data-action="remove-download-task" data-task-id="${escapeHtml(task.taskId || "")}" data-movie-id="${escapeHtml(task.movieId || "")}">删除</button>
              <button data-action="open-download-folder">打开目录</button>
            </div>
          </article>
        `;
      }).join("") || `<div class="txzz-empty">还没有下载任务。进入视频详情页点击「下载」，或在「完整播放」页点击「下载完整视频」。</div>`;
    }
    if (views.downloadSnapshots) {
      const snapshots = Array.isArray(state.downloadSnapshots) ? state.downloadSnapshots.slice().reverse() : [];
      views.downloadSnapshots.innerHTML = snapshots.map((snapshot) => `
        <article>
          <div>
            <b>${escapeHtml(snapshot.label || snapshot.id || "下载记录")}</b>
            <span>${escapeHtml(`保存时间：${formatTime(snapshot.savedAt)} / 总任务 ${snapshot.total || 0} / 完成 ${snapshot.completed || 0} / 失败 ${snapshot.failed || 0}`)}</span>
          </div>
          <div class="txzz-account-actions">
            <button data-action="copy-download-snapshot" data-snapshot-id="${escapeHtml(snapshot.id || "")}">复制记录</button>
          </div>
        </article>
      `).join("") || `<div class="txzz-empty">暂无保存记录。点击「保存当前记录」后会在这里留档。</div>`;
    }
  }

  function announceDownloadTasks() {
    for (const task of Object.values(state.downloadTasks || {})) {
      const key = `${task.taskId}:${task.stage}:${task.current || 0}:${task.total || 0}:${task.error || ""}`;
      if (announcedDownloadStages.has(key)) continue;
      announcedDownloadStages.add(key);
      const count = task.total ? ` ${task.current || 0}/${task.total}` : "";
      const detail = task.stage === "error"
        ? `${task.movieId || ""} ${task.error || "未知错误"}`
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
    const session = state.session || {};
    views.account.textContent = session.nickname || session.userId || "未读取";
    views.accountMeta.textContent = session.token ? `${labelForRole(state.role)} / ${session.tokenMasked}` : `${labelForRole(state.role)} / 等待 token`;
    views.rights.innerHTML = `
      <span>永久会员</span>
      <span>永久尤物圈</span>
      <span>999 余额</span>
    `;
    views.rightsMeta.textContent = "客户端展示覆盖已启用";
    renderStats();
    publishState();
  }

  function renderPlayback() {
    views.playback.innerHTML = state.playback.slice(-28).reverse().map((item) => `
      <article>
        <b>${escapeHtml(categoryLabel(item.category))}</b>
        <span>${escapeHtml([item.via, item.status ? `HTTP ${item.status}` : "", item.method || ""].filter(Boolean).join(" / "))}</span>
        <code>${escapeHtml(item.url || "")}</code>
      </article>
    `).join("") || `<div class="txzz-empty">打开视频详情或播放页后，这里会显示 M3U8、MP4、播放接口与媒体源。</div>`;
  }

  function renderObservations() {
    views.observations.innerHTML = state.observations.slice(-32).reverse().map((item) => `
      <article>
        <b>${escapeHtml(categoryLabel(item.category))}</b>
        <span>${escapeHtml([item.via, item.status ? `HTTP ${item.status}` : "", (item.flags || []).join(", ")].filter(Boolean).join(" / "))}</span>
        <code>${escapeHtml(item.url || "")}</code>
        ${item.bodyHead ? `<p>${escapeHtml(clipText(item.bodyHead, 260))}</p>` : ""}
      </article>
    `).join("") || `<div class="txzz-empty">还没有命中购买、金币、余额或权限判定接口。</div>`;
  }

  function renderAccounts() {
    const selected = selectedAccount();
    const remote = state.remote || {};
    renderStats();
    if (fields.remoteBaseUrl) fields.remoteBaseUrl.value = remote.baseUrl || "";
    if (fields.remoteClientToken) fields.remoteClientToken.value = "";
    if (fields.remoteAdminToken) fields.remoteAdminToken.value = "";
    if (fields.accountSourceMode) fields.accountSourceMode.value = remote.accountSourceMode || "cloud";
    if (fields.remoteFixedAccountId) {
      const fixedId = remote.fixedAccountId || state.selectedFullAccountId || "";
      const cloudAccounts = state.accountPool.filter(isCloudAccount);
      fields.remoteFixedAccountId.innerHTML = `<option value="">未选择</option>` + cloudAccounts.map((account) => `
        <option value="${escapeHtml(account.id)}"${account.id === fixedId ? " selected" : ""}>${escapeHtml(accountTitle(account))} / ${escapeHtml(account.id)}</option>
      `).join("");
      fields.remoteFixedAccountId.value = fixedId;
    }
    if (views.remoteMeta) {
      const sourceLabel = remoteSourceLabel(remote.accountSourceMode);
      const fixedText = remote.accountSourceMode === "cloud-fixed" ? ` / 固定=${remote.fixedAccountId || state.selectedFullAccountId || "未选择"}` : "";
      views.remoteMeta.textContent = remote.baseUrl
        ? `已配置 / 来源=${sourceLabel}${fixedText} / client=${remote.hasClientToken ? remote.clientTokenMasked || "set" : "未设置"} / admin=${remote.hasAdminToken ? remote.adminTokenMasked || "set" : "未设置"} / ${remote.lastError ? `错误：${remote.lastError}` : remote.lastSyncAt ? `上次同步 ${remote.lastSyncAt}` : "等待同步"}`
        : "远程未配置；完整账号可上传到 Cloudflare Worker/Supabase 后再同步。";
    }
    views.accountPool.innerHTML = state.accountPool.map((account) => {
      const isSelected = account.id === state.selectedFullAccountId;
      const status = account.status === "ok" ? "已验证" : account.status === "error" ? "异常" : account.status === "imported" ? "已导入" : "待验证";
      const cloudReadonly = isCloudAccount(account);
      const alreadyCloud = !cloudReadonly && cloudHasAccount(account.id);
      return `
        <article class="${isSelected ? "is-selected" : ""}">
          <div>
            <b>${escapeHtml(accountTitle(account))}</b>
            <span>${escapeHtml([account.username || account.source || "未填写用户名", status, account.hasQrcode ? "二维码凭证" : "", cloudReadonly ? "云端只读摘要" : "", account.userInfo?.id ? `ID ${account.userInfo.id}` : ""].filter(Boolean).join(" / "))}</span>
            <code>${escapeHtml(account.tokenMasked || (account.hasToken ? "token 已保存" : "token 未导入"))}</code>
            ${account.lastError ? `<p>${escapeHtml(account.lastError)}</p>` : ""}
          </div>
          <div class="txzz-account-actions">
            <button data-action="select-account" data-account-id="${escapeHtml(account.id)}">${isSelected ? "已选择" : "选择"}</button>
            <button data-action="verify-account" data-account-id="${escapeHtml(account.id)}">验证</button>
            ${cloudReadonly ? `<button data-action="show-account-summary" data-account-id="${escapeHtml(account.id)}">摘要</button>` : `<button data-action="${alreadyCloud ? "noop" : "upload-local-account-remote"}" data-account-id="${escapeHtml(account.id)}" ${alreadyCloud ? "disabled" : ""}>${alreadyCloud ? "已在云端" : "上传云端"}</button>`}
            ${cloudReadonly ? "" : `<button data-action="remove-account" data-account-id="${escapeHtml(account.id)}">移除</button>`}
          </div>
        </article>
      `;
    }).join("") || `<div class="txzz-empty">账号池为空。</div>`;

    setAccountFormReadonly(Boolean(selected && isCloudAccount(selected)));
    if (selected && isCloudAccount(selected)) {
      fields.accountId.value = selected.id || "";
      fields.accountLabel.value = selected.label || "";
      fields.accountUsername.value = selected.username || "";
      fields.accountPassword.value = selected.hasPassword ? "云端已保存，前端不可见" : "";
      fields.accountDeviceId.value = "";
      fields.accountToken.value = selected.hasToken ? "云端已保存，前端不可见" : "";
      fields.accountQrcode.value = selected.hasQrcode ? "云端已保存，前端不可见" : "";
      fields.accountNotes.value = selected.notes || "云端账号只显示摘要，修改请重新上传本地表单或在服务端管理。";
    } else if (selected) {
      fields.accountId.value = selected.id || "";
      fields.accountLabel.value = selected.label || "";
      fields.accountUsername.value = selected.username || "";
      fields.accountPassword.value = "";
      fields.accountDeviceId.value = "";
      fields.accountToken.value = "";
      fields.accountQrcode.value = "";
      fields.accountNotes.value = selected.notes || "";
    } else {
      setAccountFormReadonly(false);
    }
  }

  function renderFullDetails() {
    const latest = state.fullDetails[state.fullDetails.length - 1];
    views.fullplaySummary.innerHTML = latest ? `
      <div>
        <span>最近命中</span>
        <strong>${escapeHtml(latest.movieId || "")}</strong>
        <small>${escapeHtml([latest.accountLabel || latest.accountUser, latest.action, latest.hasBuy ? `has_buy=${latest.hasBuy}` : ""].filter(Boolean).join(" / "))}</small>
      </div>
      <div>
        <span>完整 M3U8</span>
        <strong>${escapeHtml(latest.fullStat?.segments ?? "?")} 片</strong>
        <small>${escapeHtml(latest.fullStat?.duration ? `${latest.fullStat.duration}s` : latest.fullStat?.error || "等待统计")}</small>
      </div>
    ` : `<div class="txzz-empty">等待页面命中 /movie/detail。</div>`;
    views.fullplayList.innerHTML = state.fullDetails.slice(-24).reverse().map((item) => `
      <article>
        <b>${escapeHtml(item.movieId)} 路 ${escapeHtml(item.action || "full_detail")}</b>
        <span>${escapeHtml([item.accountLabel || item.accountUser, item.fullStat?.segments ? `${item.fullStat.segments} 片` : "", item.fullStat?.duration ? `${item.fullStat.duration}s` : ""].filter(Boolean).join(" / "))}</span>
        <code>${escapeHtml(item.playLink || "")}</code>
        ${item.backupLink ? `<code>${escapeHtml(item.backupLink)}</code>` : ""}
        <div class="txzz-account-actions">
          <button data-action="download-full-video" data-movie-id="${escapeHtml(item.movieId || "")}">下载完整视频</button>
        </div>
      </article>
    `).join("") || `<div class="txzz-empty">还没有完整详情记录。</div>`;
    renderStats();
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
      emitFlow("捕获播放链路", `${categoryLabel(normalized.category)} / ${normalized.via || normalized.kind || "runtime"}`, "ok");
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
      emitFlow("权限/交易命中", `${categoryLabel(normalized.category)} / ${flags.join(",") || normalized.status || "observed"}`, "ok");
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
    const full = fields.fullTrace.value.trim() ? parseMaybeJson(fields.fullTrace.value.trim()) : { fullDetails: state.fullDetails };
    const guest = fields.guestTrace.value.trim() ? parseMaybeJson(fields.guestTrace.value.trim()) : await exportTrace();
    if (!full || typeof full !== "object") {
      views.compareResult.textContent = JSON.stringify({ error: "请先粘贴完整权限账号链路 JSON" }, null, 2);
      emitFlow("链路对比", "缺少完整权限账号链路 JSON", "error");
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
        ? "游客侧缺少完整权限播放源；优先确认 /movie/detail 是否已被完整详情覆盖。"
        : "播放链路没有明显缺口；继续观察 HLS 分片、Referer、有效期和播放器实际时长。"
    };
    views.compareResult.textContent = JSON.stringify(result, null, 2);
    emitFlow("链路对比", `完整 ${fullLinks.size} 条，游客 ${guestLinks.size} 条，共享 ${shared.length} 条`, "ok");
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
    if (saved.lastFullTrace) fields.fullTrace.value = JSON.stringify(saved.lastFullTrace, null, 2);
    if (saved.lastGuestTrace) fields.guestTrace.value = JSON.stringify(saved.lastGuestTrace, null, 2);
    views.exportBox.textContent = JSON.stringify(saved, null, 2);
    if (verbose) emitFlow("载入链路", "已读取扩展本地保存记录与账号池", "ok");
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
    fields.fullTrace.value = "";
    fields.guestTrace.value = "";
    views.exportBox.textContent = "{}";
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
    const ok = window.confirm("将清除插件本地数据、账号池缓存、完整详情缓存和保存链路，并重置为当前版本默认状态。新版本覆盖安装时会自动清理旧缓存，此按钮用于手动兜底。是否继续？");
    if (!ok) return;
    window.postMessage({ source: "txzz-content", kind: "clear-runtime-cache" }, "*");
    const response = await sendRuntime("clearAllData");
    resetLocalRuntimeState(response.state || {});
    await collectSession().catch(() => {});
    emitFlow("清除缓存", "已清除插件旧数据缓存，建议刷新当前页面后继续测试", "ok");
  }

  function accountFromForm() {
    const username = fields.accountUsername.value.trim();
    const id = fields.accountId.value.trim() || (username ? `full-${username.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}` : "");
    return {
      id,
      label: fields.accountLabel.value.trim() || username || id,
      username,
      password: fields.accountPassword.value,
      deviceId: fields.accountDeviceId.value.trim(),
      userToken: fields.accountToken.value.trim(),
      qrcode: fields.accountQrcode.value.trim(),
      notes: fields.accountNotes.value.trim(),
      source: id === "full-lsyhook" ? "seed" : "manual"
    };
  }

  async function saveAccount() {
    const selected = selectedAccount();
    if (selected && isCloudAccount(selected)) throw new Error("云端账号只显示脱敏摘要，不能在插件前端修改；请先切换到本地账号或新建本地账号。");
    const account = accountFromForm();
    if (!account.id && !account.username) throw new Error("请至少填写用户名或账号 ID");
    const response = await sendRuntime("upsertAccount", { account });
    syncSavedState(response.state || {});
    emitFlow("账号池", `已保存 ${account.label || account.username}`, "ok");
  }

  async function saveRemoteConfig() {
    const response = await sendRuntime("saveRemoteConfig", {
      remote: {
        baseUrl: fields.remoteBaseUrl.value.trim(),
        clientToken: fields.remoteClientToken.value.trim(),
        adminToken: fields.remoteAdminToken.value.trim(),
        accountSourceMode: fields.accountSourceMode?.value || "cloud",
        fixedAccountId: fields.remoteFixedAccountId?.value || state.selectedFullAccountId || "",
        enabled: true,
        fallbackLocal: fields.accountSourceMode?.value === "cloud-first"
      }
    });
    syncSavedState(response.state || {});
    emitFlow("远程账号池", "已保存 Worker 配置并尝试同步账号池", "ok");
  }

  async function syncRemoteAccounts() {
    const response = await sendRuntime("syncRemoteAccounts");
    syncSavedState(response.state || {});
    const remote = response.state?.remote || {};
    if (remote.lastError) emitFlow("远程账号池同步失败", remote.lastError, "error");
    else emitFlow("远程账号池", `已从 Cloudflare Worker 同步 ${(response.state?.accountPool || []).length} 个账号`, "ok");
  }

  async function uploadAccountRemote() {
    const selected = selectedAccount();
    if (selected && isCloudAccount(selected)) throw new Error("云端账号只显示脱敏摘要，不能直接重复上传；请先在表单中新建本地账号或导入当前会话。");
    const account = accountFromForm();
    if (!account.id && !account.username) throw new Error("请至少填写用户名或账号 ID");
    const response = await sendRuntime("uploadAccountToRemote", { account });
    syncSavedState(response.state || {});
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
      emitFlow("完整下载", `视频 ${id} 下载任务已经在创建中，请稍候`, "ok");
      showToast("下载任务已经在创建中", "ok");
      return { ok: true, locked: true, movieId: id };
    }
    downloadLocks.add(id);
    emitFlow("完整下载", `开始获取完整视频 ${id}`);
    showToast("正在获取完整视频链接");
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
      emitFlow("完整下载", `${mode} 已创建下载任务：${response.filename || id}`, "ok");
      showToast(`${mode}任务已创建`, "ok");
      if (response.summary) {
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
      emitFlow("完整下载失败", err?.message || String(err), "error");
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
    await copyText(task?.url || "", "下载链接");
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
    const response = await sendRuntime("selectAccount", { accountId });
    syncSavedState(response.state || {});
    emitFlow("账号池", `已选择 ${accountTitle(selectedAccount())}`, "ok");
  }

  async function verifyAccount(accountId = state.selectedFullAccountId) {
    emitFlow("账号验证", `开始验证 ${accountId || "选中账号"}`);
    const session = await collectSession();
    const response = await sendRuntime("verifyAccount", { accountId, bootstrapSession: session });
    syncSavedState(response.state || {});
    const account = response.account || selectedAccount();
    emitFlow("账号验证", `${accountTitle(account)} 验证通过`, "ok");
  }

  async function removeAccount(accountId) {
    const response = await sendRuntime("removeAccount", { accountId });
    syncSavedState(response.state || {});
    emitFlow("账号池", "已移除账号或保留默认种子账号", "ok");
  }

  async function importCurrentSession() {
    const session = await collectSession();
    const response = await sendRuntime("importAccountSession", { session, label: session.nickname ? `${session.nickname} 完整会话` : "" });
    syncSavedState(response.state || {});
    emitFlow("账号池", "已导入当前页面 token/deviceId 为完整账号", "ok");
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
    panel.classList.toggle("txzz-open", state.expanded);
    panel.classList.toggle("txzz-closed", !state.expanded);
    publishState();
    if (state.expanded) {
      panel.classList.remove("txzz-dragged");
      shell.style.removeProperty("--txzz-left");
      shell.style.removeProperty("--txzz-top");
      collectSession().catch(() => {});
      loadSavedState(false).catch(() => {});
    }
  }

  function switchTab(tab) {
    panel.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
    panel.querySelectorAll("[data-view-panel]").forEach((view) => view.classList.toggle("is-active", view.dataset.viewPanel === tab));
  }

  panel.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    const tabEl = event.target.closest("[data-tab]");
    if (tabEl) {
      switchTab(tabEl.dataset.tab);
      event.preventDefault();
      return;
    }
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const accountId = actionEl.dataset.accountId || state.selectedFullAccountId;
    try {
      if (action === "noop") return;
      if (action === "toggle") togglePanel();
      if (action === "close") togglePanel(false);
      if (action === "refresh") {
        await collectSession();
        await loadSavedState(false);
        emitFlow("刷新状态", "已重新读取当前页面会话与账号池", "ok");
      }
      if (action === "apply") await applyDisplayPatch();
      if (action === "set-role-full") {
        state.role = "full";
        await collectSession();
        emitFlow("会话角色", "已标记为完整权限会话", "ok");
      }
      if (action === "set-role-guest") {
        state.role = "guest";
        await collectSession();
        emitFlow("会话角色", "已标记为游客会话", "ok");
      }
      if (action === "load-saved") await loadSavedState();
      if (action === "copy-latest") {
        const latest = [...state.playback].reverse().find((item) => item.url && !["play-api", "video-api"].includes(item.category)) || state.playback[state.playback.length - 1];
        await copyText(latest?.url || "", "最新播放链接");
      }
      if (action === "copy-full-link") {
        const latest = state.fullDetails[state.fullDetails.length - 1];
        await copyText(latest?.playLink || latest?.backupLink || "", "最近完整链接");
      }
      if (action === "copy-observations") {
        await copyText(JSON.stringify(state.observations.slice(-80), null, 2), "判定记录");
      }
      if (action === "select-account") await selectAccount(accountId);
      if (action === "verify-account") await verifyAccount(accountId);
      if (action === "show-account-summary") {
        const account = state.accountPool.find((item) => item.id === accountId);
        emitFlow("云端账号摘要", `${accountTitle(account)} / ${account?.status || "idle"} / ${account?.lastError ? `错误：${account.lastError}` : "凭证明文仅保存在服务端"}`, account?.status === "error" ? "error" : "ok");
      }
      if (action === "remove-account") await removeAccount(accountId);
      if (action === "save-account") await saveAccount();
      if (action === "save-remote") await saveRemoteConfig();
      if (action === "sync-remote") await syncRemoteAccounts();
      if (action === "upload-account-remote") await uploadAccountRemote();
      if (action === "upload-local-account-remote") await uploadLocalAccountRemote(accountId);
      if (action === "download-full-video") await downloadFullVideo(actionEl.dataset.movieId || currentMovieId());
      if (action === "refresh-downloads") {
        await refreshLocalDownloadState();
        emitFlow("下载管理", "已刷新下载任务状态", "ok");
      }
      if (action === "save-downloads") await saveDownloadRecords();
      if (action === "copy-downloads") await copyDownloadRecords();
      if (action === "copy-download-url") await copyDownloadUrl(actionEl.dataset.taskId || "");
      if (action === "copy-download-snapshot") await copyDownloadSnapshot(actionEl.dataset.snapshotId || "");
      if (action === "save-download-device") await saveDownloadDevice(actionEl.dataset.taskId || "");
      if (action === "remove-download-task") await removeDownloadTask(actionEl.dataset.taskId || "", actionEl.dataset.movieId || "");
      if (action === "clear-downloads") await clearDownloadTasks();
      if (action === "clear-download-snapshots") await clearDownloadSnapshots();
      if (action === "open-download-folder") await openDownloadFolder();
      if (action === "import-current-session") await importCurrentSession();
      if (action === "export") {
        const trace = await exportTrace();
        views.exportBox.textContent = JSON.stringify(trace, null, 2);
        if (state.role === "guest") fields.guestTrace.value = JSON.stringify(trace, null, 2);
        if (state.role === "full") fields.fullTrace.value = JSON.stringify(trace, null, 2);
        emitFlow("导出链路", `已导出 ${trace.playback.length} 条播放记录，${trace.observations.length} 条判定记录`, "ok");
      }
      if (action === "save") {
        const trace = await exportTrace();
        await sendRuntime("saveTrace", trace);
        views.exportBox.textContent = JSON.stringify(trace, null, 2);
        emitFlow("保存链路", "已保存到扩展本地存储", "ok");
      }
      if (action === "clear") {
        state.playback = [];
        state.requests = [];
        state.observations = [];
        state.flow = [];
        renderPlayback();
        renderObservations();
        renderFlow();
        views.exportBox.textContent = "{}";
        emitFlow("清空", "已清空当前会话捕获记录", "ok");
      }
      if (action === "clear-cache") await clearDataCache();
      if (action === "compare") await compareTraces();
    } catch (err) {
      emitFlow("操作失败", err?.message || String(err), "error");
    }
    event.preventDefault();
  });

  function startDrag(event) {
    if (event.type === "mousedown" && event.button !== 0) return;
    if (event.target.closest("button,input,textarea,select,a,[data-action],[data-tab]")) return;
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
    if (state.expanded || drag?.moved) return;
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
    emitFlow("完整下载", `已接管详情页下载按钮：${movieId}`);
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
    emitFlow("完整播放", `命中 /movie/detail，视频 ${payload.movieId}`);
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
          via: "账号池完整详情",
          url: summary.playLink || summary.backupLink || "",
          category: "fullplay",
          flags: [summary.action || "full_detail", `movie:${summary.movieId}`],
          bodyHead: JSON.stringify(summary)
        });
        if (summary.playLink) addPlayback({ kind: "media", via: "fullplay.play_link", url: summary.playLink, category: "m3u8" });
        if (summary.backupLink) addPlayback({ kind: "media", via: "fullplay.backup_link", url: summary.backupLink, category: "m3u8" });
        emitFlow(
          summary.playLink || summary.backupLink ? "完整播放" : "完整播放缺少链接",
          summary.playLink || summary.backupLink
            ? `已返回完整详情 ${summary.movieId} / ${summary.action}`
            : `完整详情 ${summary.movieId} 未返回 play_link 或 backup_link`,
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
      emitFlow("完整播放失败", err?.message || String(err), "error");
    }
  }

  ball.addEventListener("mousedown", startDrag);
  ball.addEventListener("pointerup", pointerOpenFallback);
  ball.addEventListener("touchstart", startDrag, { passive: false });
  ball.addEventListener("touchend", pointerOpenFallback, { passive: false });
  const dragHandle = panel.querySelector("[data-drag-handle]");
  dragHandle.addEventListener("mousedown", startDrag);
  dragHandle.addEventListener("touchstart", startDrag, { passive: false });
  window.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchmove", moveDrag, { passive: false });
  window.addEventListener("touchend", endDrag);
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
    if (kind === "hook") emitFlow("Hook", `${payload.target} ${payload.status}`, "ok");
    if (kind === "fullplay-status") emitFlow("完整播放", payload.message || "状态更新", payload.level === "error" ? "error" : "ok");
  });

  installHook();
  installDownloadInterceptor();
  syncViewportVars();
  collectSession().catch(() => {});
  applyDisplayPatch().catch(() => {});
  installVisibleDisplayLoop();
  loadSavedState(false).catch((err) => emitFlow("账号池", err?.message || String(err), "error"));
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
