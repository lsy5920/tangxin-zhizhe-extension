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
  const ASSET_URLS = {
    heroConsole: chrome.runtime.getURL("assets/hero-console.png"),
    emptyState: chrome.runtime.getURL("assets/empty-state.png"),
    iconSheet: chrome.runtime.getURL("assets/icon-sheet.png"),
    pageIllustrations: chrome.runtime.getURL("assets/page-illustrations.png"),
    mobileTexture: chrome.runtime.getURL("assets/mobile-texture.png"),
    floatingBall: chrome.runtime.getURL("assets/floating-ball.png"),
    flowBadgeBg: chrome.runtime.getURL("assets/flow-badge-bg.png"),
    navIcon0: chrome.runtime.getURL("assets/nav-icon-overview.png"),
    navIcon1: chrome.runtime.getURL("assets/nav-icon-trace.png"),
    navIcon2: chrome.runtime.getURL("assets/nav-icon-permission.png"),
    navIcon3: chrome.runtime.getURL("assets/nav-icon-fullplay.png"),
    navIcon4: chrome.runtime.getURL("assets/nav-icon-downloads.png"),
    navIcon5: chrome.runtime.getURL("assets/nav-icon-accounts.png"),
    navIcon6: chrome.runtime.getURL("assets/nav-icon-compare.png"),
    navIcon7: chrome.runtime.getURL("assets/nav-icon-tools.png")
  };
  const EMPTY_STATE_IMAGE = ASSET_URLS.emptyState;

  function cssImageUrl(url) {
    return `url("${String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
  }

  function applyAssetVars(target) {
    if (!target?.style) return;
    target.style.setProperty("--txzz-hero-image", cssImageUrl(ASSET_URLS.heroConsole));
    target.style.setProperty("--txzz-empty-image", cssImageUrl(ASSET_URLS.emptyState));
    target.style.setProperty("--txzz-icon-sheet", cssImageUrl(ASSET_URLS.iconSheet));
    target.style.setProperty("--txzz-page-illustrations", cssImageUrl(ASSET_URLS.pageIllustrations));
    target.style.setProperty("--txzz-mobile-texture", cssImageUrl(ASSET_URLS.mobileTexture));
    target.style.setProperty("--txzz-floating-ball", cssImageUrl(ASSET_URLS.floatingBall));
    target.style.setProperty("--txzz-flow-badge-bg", cssImageUrl(ASSET_URLS.flowBadgeBg));
    for (let index = 0; index < 8; index += 1) {
      target.style.setProperty(`--txzz-nav-icon-${index}`, cssImageUrl(ASSET_URLS[`navIcon${index}`]));
    }
  }

  function applyFlowBadgeVisual(target) {
    if (!target?.style) return;
    target.style.setProperty("--txzz-flow-badge-bg", cssImageUrl(ASSET_URLS.flowBadgeBg));
    target.style.backgroundImage = `linear-gradient(90deg, rgba(15, 17, 25, 0.54), rgba(15, 17, 25, 0.68)), ${cssImageUrl(ASSET_URLS.flowBadgeBg)}`;
    target.style.backgroundSize = "cover";
    target.style.backgroundPosition = "center";
  }

  const panel = document.createElement("section");
  panel.id = "txzz-panel";
  panel.className = "txzz-closed";
  applyAssetVars(panel);
  panel.innerHTML = `
    <button class="txzz-ball" data-action="toggle" title="展开糖心志者" aria-label="展开糖心志者">
      <span>志</span>
    </button>
    <div class="txzz-toast" data-view="toast" aria-live="polite"></div>
    <div class="txzz-shell" role="dialog" aria-label="糖心志者功能管理面板">
      <aside class="txzz-sidebar">
        <div class="txzz-brand" data-drag-handle>
          <i>志</i>
          <div>
            <strong>糖心志者</strong>
            <small data-view="subtitle">账号池、播放与下载管理</small>
          </div>
        </div>
        <div class="txzz-side-status">
          <span>当前账号</span>
          <strong data-view="sideAccount">读取中</strong>
          <small data-view="sideAccountMeta">等待页面会话</small>
        </div>
        <nav class="txzz-tabs" aria-label="糖心志者页面导航">
          <button class="is-active" data-tab="overview" data-icon="0"><i aria-hidden="true"></i><span>总览</span></button>
          <button data-tab="accounts" data-icon="5"><i aria-hidden="true"></i><span>账号池</span></button>
          <button data-tab="fullplay" data-icon="3"><i aria-hidden="true"></i><span>播放</span></button>
          <button data-tab="downloads" data-icon="4"><i aria-hidden="true"></i><span>下载</span></button>
          <button data-tab="tools" data-icon="7"><i aria-hidden="true"></i><span>设置</span></button>
        </nav>
      </aside>
      <section class="txzz-workspace">
        <header class="txzz-head">
          <div class="txzz-page-title">
            <span>功能面板</span>
            <strong data-view="pageTitle">总览</strong>
          </div>
          <div class="txzz-head-actions">
            <button class="txzz-about-btn" data-action="about" title="打开项目主页" aria-label="打开项目主页">关于</button>
            <button data-action="refresh" title="刷新状态" aria-label="刷新状态">刷新</button>
            <button data-action="close" title="关闭面板" aria-label="关闭面板">关闭</button>
          </div>
        </header>
        <button class="txzz-update-banner" data-action="show-update-dialog" data-view="updateBanner" hidden>
          <span>发现更新</span>
          <strong data-view="updateBannerTitle">远程仓库有新版本</strong>
          <small data-view="updateBannerDetail">点击查看更新详情</small>
        </button>
        <main class="txzz-main">
          <section class="txzz-view is-active" data-view-panel="overview">
            <div class="txzz-overview-rail">
              <article class="txzz-focus-card" data-page="overview">
                <div>
                  <span>糖心志者</span>
                  <strong>账号池管理 · 播放状态展示 · 下载任务管理 · 版本更新</strong>
                  <small data-view="rightsMeta">当前状态读取中</small>
                </div>
                <span class="txzz-page-art" data-art="overview" aria-hidden="true"></span>
                <button class="txzz-primary" data-action="apply">应用展示覆盖</button>
              </article>
              <article class="txzz-flow-card">
                <div class="txzz-section-head txzz-section-head-tight">
                  <strong>最近流程</strong>
                  <button data-tab="fullplay">查看播放</button>
                </div>
                <div class="txzz-flow" data-view="flow"></div>
              </article>
            </div>
            <section class="txzz-grid">
              <article>
                <span>当前账号</span>
                <strong data-view="account">读取中</strong>
                <small data-view="accountMeta">等待页面会话</small>
              </article>
              <article>
                <span>页面展示</span>
                <strong data-view="rights">待应用</strong>
                <small>客户端展示状态</small>
              </article>
              <article>
                <span>账号池</span>
                <strong data-view="poolCount">0</strong>
                <small data-view="poolMeta">未选择账号</small>
              </article>
              <article>
                <span>播放记录</span>
                <strong data-view="fullplayCount">0</strong>
                <small data-view="latestFullplay">等待记录</small>
              </article>
            </section>
            <section class="txzz-grid txzz-grid-secondary">
              <article>
                <span>下载任务</span>
                <strong data-view="overviewDownloads">0</strong>
                <small data-view="overviewDownloadMeta">等待下载任务</small>
              </article>
            </section>
            <div class="txzz-quick-actions">
              <button data-action="refresh">刷新状态</button>
              <button data-action="sync-remote">同步云端</button>
              <button data-action="refresh-downloads">刷新下载</button>
              <button data-action="check-update">检查更新</button>
            </div>
          </section>

          <section class="txzz-view" data-view-panel="fullplay">
            <div class="txzz-page-card" data-page="fullplay">
              <div>
                <span>播放</span>
                <strong>播放状态与下载入口</strong>
                <small>展示最近视频、播放状态和下载入口。</small>
              </div>
              <span class="txzz-page-art" data-art="fullplay" aria-hidden="true"></span>
              <button class="txzz-primary" data-action="download-full-video">下载当前视频</button>
            </div>
            <div class="txzz-content-card">
              <div class="txzz-fullplay-card" data-view="fullplaySummary"></div>
              <div class="txzz-section-head">
                <strong>播放记录</strong>
                <small>按获取时间倒序显示</small>
              </div>
              <div class="txzz-list" data-view="fullplayList"></div>
            </div>
          </section>

          <section class="txzz-view" data-view-panel="downloads">
            <div class="txzz-page-card" data-page="downloads">
              <div>
                <span>下载</span>
                <strong>下载任务管理</strong>
                <small data-view="downloadMeta">等待下载任务</small>
              </div>
              <span class="txzz-page-art" data-art="downloads" aria-hidden="true"></span>
              <button class="txzz-primary" data-action="refresh-downloads">刷新下载</button>
            </div>
            <div class="txzz-download-stats" data-view="downloadSummary"></div>
            <div class="txzz-download-actions">
              <button data-action="open-download-folder">打开下载目录</button>
              <button class="txzz-danger-action" data-action="clear-downloads">清空任务</button>
            </div>
            <div class="txzz-content-card">
              <div class="txzz-section-head">
                <strong>当前任务</strong>
                <small>下载、合并、保存状态</small>
              </div>
              <div class="txzz-download-list" data-view="downloadList"></div>
            </div>
          </section>

          <section class="txzz-view" data-view-panel="accounts">
            <div class="txzz-account-console">
              <div class="txzz-page-card" data-page="accounts">
                <div>
                  <span>账号池</span>
                  <strong>账号池控制台</strong>
                  <small data-view="accountPoolMeta">云端账号默认只显示可用账号</small>
                </div>
                <span class="txzz-page-art" data-art="accounts" aria-hidden="true"></span>
                <div class="txzz-account-top-actions">
                  <button type="button" class="txzz-primary" data-action="open-account-form">添加账号</button>
                  <button type="button" data-action="sync-remote">同步云端</button>
                  <button type="button" data-action="verify-account">检查本地</button>
                </div>
              </div>

            <div class="txzz-account-summary" data-view="accountPoolSummary"></div>

            <details class="txzz-remote-box" open>
              <summary>
                <span>远程配置</span>
                <small data-view="remoteMeta">远程未配置</small>
              </summary>
              <div class="txzz-remote-grid">
                <label>
                  Worker URL
                  <input data-field="remoteBaseUrl" placeholder="https://txzzsecure.lsy20.top">
                </label>
                <label>
                  账号来源
                  <select data-field="accountSourceMode">
                    <option value="cloud">云端自动轮换</option>
                    <option value="local">本地选中账号</option>
                    <option value="cloud-first">云端优先，本地兜底</option>
                  </select>
                </label>
              </div>
              <div class="txzz-form-actions">
                <button type="button" data-action="save-remote">保存配置</button>
                <button type="button" data-action="sync-remote">同步云端</button>
              </div>
            </details>

            <div class="txzz-account-filter">
              <div>
                <strong>账号列表</strong>
                <small data-view="accountFilterMeta">默认隐藏失效云端账号</small>
              </div>
              <label class="txzz-switch">
                <input data-field="showInvalidCloudAccounts" type="checkbox">
                <span>查看已失效云端账号</span>
              </label>
            </div>

            <div class="txzz-account-pool" data-view="accountPool"></div>

            <div class="txzz-account-modal" data-view="accountModal" hidden>
              <button type="button" class="txzz-account-modal-mask" data-action="close-account-form" aria-label="关闭添加账号弹窗"></button>
              <div class="txzz-account-dialog" role="dialog" aria-label="添加账号">
                <div class="txzz-form-title">
                  <div>
                    <strong data-view="accountFormTitle">添加本地账号</strong>
                    <small data-view="accountFormHint">先选择保存方式，再填写对应内容</small>
                  </div>
                  <button type="button" data-action="close-account-form">关闭</button>
                </div>

                <div class="txzz-account-type-picker" data-view="accountTypePicker">
                  <button type="button" data-action="choose-account-type" data-credential-mode="password">
                    <b>账号密码</b>
                    <span>填写用户名和密码，适合长期自动维护。</span>
                  </button>
                  <button type="button" data-action="choose-account-type" data-credential-mode="qrcode">
                    <b>账号凭证</b>
                    <span>粘贴账号凭证内容，本地保存后可上传云端加密。</span>
                  </button>
                  <button type="button" data-action="choose-account-type" data-credential-mode="token">
                    <b>token/deviceId</b>
                    <span>导入已有会话的 deviceId 和 userToken。</span>
                  </button>
                </div>

                <form class="txzz-account-form" data-view="accountForm" autocomplete="off">
                  <input data-field="accountCredentialMode" type="hidden" value="password">
                  <div class="txzz-selected-type">
                    <span data-view="accountCredentialLabel">账号密码</span>
                    <button type="button" data-action="back-account-type">更换类型</button>
                  </div>
                  <label>
                    账号 ID
                    <input data-field="accountId" placeholder="留空自动生成">
                  </label>
                  <label>
                    账号昵称
                    <input data-field="accountLabel" placeholder="例如：账号池账号 01">
                  </label>
                  <label data-credential="password">
                    用户名
                    <input data-field="accountUsername" placeholder="账号用户名">
                  </label>
                  <label data-credential="password">
                    密码
                    <input data-field="accountPassword" type="password" placeholder="保存后可用于服务端登录">
                  </label>
                  <label data-credential="token">
                    deviceId
                    <input data-field="accountDeviceId" placeholder="导入 token 时必填">
                  </label>
                  <label data-credential="token">
                    userToken
                    <input data-field="accountToken" placeholder="xxxxxxxx_userid">
                  </label>
                  <label class="txzz-wide" data-credential="qrcode">
                    账号凭证内容
                    <textarea data-field="accountQrcode" spellcheck="false" placeholder="粘贴从账号凭证二维码解析出的明文"></textarea>
                  </label>
                  <label class="txzz-wide">
                    备注
                    <input data-field="accountNotes" placeholder="用途、状态范围或维护说明">
                  </label>
                  <div class="txzz-form-actions">
                    <button type="button" data-action="save-account">保存本地</button>
                    <button type="button" data-action="upload-account-remote">保存并上传云端</button>
                    <button type="button" data-action="import-current-session">导入当前会话</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        <section class="txzz-view" data-view-panel="tools">
          <div class="txzz-page-card" data-page="tools">
            <div>
              <span>设置</span>
              <strong>设置与更新</strong>
              <small>管理版本更新、缓存清理和项目主页。</small>
            </div>
            <span class="txzz-page-art" data-art="tools" aria-hidden="true"></span>
            <button data-action="check-update">检查更新</button>
          </div>
          <div class="txzz-content-card">
            <div class="txzz-tools">
              <button data-action="refresh">刷新状态</button>
              <button data-action="about">关于项目</button>
              <button data-action="check-update">检查更新</button>
              <button data-action="download-latest">下载最新版</button>
              <button class="txzz-danger-action" data-action="clear-cache">清除数据缓存</button>
            </div>
          </div>
        </section>
        </main>
      </section>
    </div>
  `;
  document.documentElement.appendChild(panel);

  const flowBadge = document.createElement("div");
  flowBadge.id = "txzz-flow-badge";
  flowBadge.className = "txzz-flow-badge";
  flowBadge.setAttribute("aria-live", "polite");
  flowBadge.hidden = true;
  applyAssetVars(flowBadge);
  applyFlowBadgeVisual(flowBadge);
  document.documentElement.appendChild(flowBadge);

  const updateDialog = document.createElement("div");
  updateDialog.id = "txzz-update-dialog";
  updateDialog.className = "txzz-update-dialog";
  updateDialog.hidden = true;
  applyAssetVars(updateDialog);
  updateDialog.innerHTML = `
    <div class="txzz-update-mask" data-update-action="dismiss"></div>
    <section class="txzz-update-card" role="dialog" aria-label="糖心志者更新提醒">
      <div class="txzz-update-icon">志</div>
      <div class="txzz-update-body">
        <span>糖心志者发现新版本</span>
        <strong data-update-view="title">远程仓库有新的版本清单</strong>
        <p data-update-view="detail">点击查看项目仓库，获取最新版本和说明。</p>
        <code data-update-view="line"></code>
        <div class="txzz-update-actions">
          <button type="button" data-update-action="download">下载最新版</button>
          <button type="button" data-update-action="open">查看更新</button>
          <button type="button" data-update-action="dismiss">稍后提醒</button>
        </div>
      </div>
    </section>
  `;
  document.documentElement.appendChild(updateDialog);

  const views = Object.fromEntries(Array.from(panel.querySelectorAll("[data-view]")).map((el) => [el.dataset.view, el]));
  views.flowBadge = flowBadge;
  views.updateDialog = updateDialog;
  views.updateTitle = updateDialog.querySelector('[data-update-view="title"]');
  views.updateDetail = updateDialog.querySelector('[data-update-view="detail"]');
  views.updateLine = updateDialog.querySelector('[data-update-view="line"]');
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

  const uiState = {
    accountFormOpen: false,
    accountTypePicking: true,
    showInvalidCloudAccounts: false,
    editingAccountId: "",
    repositoryUpdate: null
  };

  let drag = null;
  let ignoreNextToggle = false;
  let toastTimer = 0;
  let flowBadgeTimer = 0;
  let flowBadgeActive = false;
  let repositoryUpdateCheckTask = null;
  const flowBadgeQueue = [];
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
      || ["remote", "qrcode", "remote-seed", "seed"].includes(source);
  }

  function cloudHasAccount(accountId = "") {
    return state.accountPool.some((item) => item.id === accountId && isCloudAccount(item));
  }

  function isUsableCloudAccount(account = {}) {
    if (!isCloudAccount(account)) return false;
    const status = accountStatusInfo(account);
    return Boolean(status.ok && (account.status === "ok" || account.status === "imported" || account.lastVerifiedAt));
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
    updateFlowBadge(item);
    publishState();
  }

  function isKeyFlowTitle(title = "") {
    const value = String(title || "");
    return FLOW_BADGE_TITLES.some((item) => value === item || value.startsWith(item));
  }

  function updateFlowBadge(item = {}) {
    const badge = views.flowBadge;
    if (!badge || !isKeyFlowTitle(item.title)) return;
    if (state.expanded) {
      flowBadgeQueue.length = 0;
      flowBadgeActive = false;
      window.clearTimeout(flowBadgeTimer);
      badge.className = "txzz-flow-badge";
      badge.hidden = true;
      return;
    }
    flowBadgeQueue.push(item);
    if (flowBadgeQueue.length > 8) flowBadgeQueue.splice(0, flowBadgeQueue.length - 8);
    showNextFlowBadge();
  }

  function flowBadgeDuration(item = {}) {
    if (item.level === "error") return 10000;
    return 2000;
  }

  function showNextFlowBadge() {
    const badge = views.flowBadge;
    if (!badge || flowBadgeActive || state.expanded) return;
    const item = flowBadgeQueue.shift();
    if (!item) return;
    flowBadgeActive = true;
    window.clearTimeout(flowBadgeTimer);
    const level = item.level === "error" ? "is-error" : item.level === "ok" ? "is-ok" : "is-running";
    badge.hidden = false;
    badge.className = `txzz-flow-badge is-show ${level}`;
    badge.innerHTML = `
      <span>${escapeHtml(item.level === "error" ? "异常" : item.level === "ok" ? "完成" : "进行中")}</span>
      <strong>${escapeHtml(item.title || "糖心志者")}</strong>
      <small>${escapeHtml(clipText(item.detail || "", 42))}</small>
    `;
    flowBadgeTimer = window.setTimeout(() => {
      badge.className = "txzz-flow-badge";
      badge.hidden = true;
      flowBadgeActive = false;
      window.setTimeout(showNextFlowBadge, 220);
    }, flowBadgeDuration(item));
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

  function emptyState(title, detail = "等待新的运行数据") {
    return `
      <div class="txzz-empty">
        <img src="${escapeHtml(EMPTY_STATE_IMAGE)}" alt="">
        <b>${escapeHtml(title)}</b>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
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
    `).join("") || emptyState("等待流程记录", "页面操作、账号池轮换和下载进度会显示在这里");
  }

  function renderStats() {
    const selected = selectedAccount();
    const latestCloud = latestUsedAccount();
    views.poolCount.textContent = String(state.accountPool.length);
    views.poolMeta.textContent = latestCloud
      ? `最近使用 ${accountTitle(latestCloud)}`
      : selected ? `${accountTitle(selected)} / ${selected.status || "idle"}` : "未选择账号";
    views.fullplayCount.textContent = String(state.fullDetails.length);
    const latest = state.fullDetails[state.fullDetails.length - 1];
    views.latestFullplay.textContent = latest ? `${latest.movieId} / ${latest.action || "full_detail"}` : "等待记录";
    const downloadStats = downloadTaskStats();
    if (views.overviewDownloads) views.overviewDownloads.textContent = String(downloadStats.total);
    if (views.overviewDownloadMeta) {
      views.overviewDownloadMeta.textContent = downloadStats.total
        ? `进行中 ${downloadStats.running} / 完成 ${downloadStats.completed} / 失败 ${downloadStats.failed}`
        : "等待下载任务";
    }
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
    return task.movieId ? `视频 ${task.movieId}` : "视频任务";
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
    if (views.overviewDownloads) views.overviewDownloads.textContent = String(stats.total);
    if (views.overviewDownloadMeta) {
      views.overviewDownloadMeta.textContent = stats.total
        ? `进行中 ${stats.running} / 完成 ${stats.completed} / 失败 ${stats.failed}`
        : "等待下载任务";
    }
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
      }).join("") || emptyState("还没有下载任务", "进入视频详情页点击「下载」，或在「播放详情」页点击「下载视频」");
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
      `).join("") || emptyState("暂无保存记录", "点击「保存当前记录」后会在这里留档");
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
    if (views.sideAccount) views.sideAccount.textContent = views.account.textContent;
    if (views.sideAccountMeta) views.sideAccountMeta.textContent = views.accountMeta.textContent;
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
    if (!views.playback) return;
    views.playback.innerHTML = state.playback.slice(-28).reverse().map((item) => `
      <article>
        <b>${escapeHtml(categoryLabel(item.category))}</b>
        <span>${escapeHtml([item.via, item.status ? `HTTP ${item.status}` : "", item.method || ""].filter(Boolean).join(" / "))}</span>
        <code>${escapeHtml(item.url || "")}</code>
      </article>
    `).join("") || emptyState("等待播放资源", "打开视频详情或播放页后会显示 M3U8、MP4、播放接口与媒体源");
  }

  function renderObservations() {
    if (!views.observations) return;
    views.observations.innerHTML = state.observations.slice(-32).reverse().map((item) => `
      <article>
        <b>${escapeHtml(categoryLabel(item.category))}</b>
        <span>${escapeHtml([item.via, item.status ? `HTTP ${item.status}` : "", (item.flags || []).join(", ")].filter(Boolean).join(" / "))}</span>
        <code>${escapeHtml(item.url || "")}</code>
        ${item.bodyHead ? `<p>${escapeHtml(clipText(item.bodyHead, 260))}</p>` : ""}
      </article>
    `).join("") || emptyState("等待账号状态记录", "购买、金币、余额或账号状态接口会显示在这里");
  }

  function renderAccounts() {
    const remote = state.remote || {};
    renderStats();
    if (fields.remoteBaseUrl) fields.remoteBaseUrl.value = remote.baseUrl || "";
    if (fields.accountSourceMode) fields.accountSourceMode.value = remote.accountSourceMode || "cloud";
    if (fields.showInvalidCloudAccounts) fields.showInvalidCloudAccounts.checked = uiState.showInvalidCloudAccounts;
    if (views.remoteMeta) {
      const sourceLabel = remoteSourceLabel(remote.accountSourceMode);
      views.remoteMeta.textContent = remote.baseUrl
        ? `已配置 / 来源=${sourceLabel} / ${remote.lastError ? `错误：${remote.lastError}` : remote.lastSyncAt ? `上次同步 ${remote.lastSyncAt}` : "等待同步"}`
        : "远程未配置；本地账号可上传到 Worker/Supabase 后再同步。";
    }
    const stats = accountPoolStats();
    if (views.accountPoolMeta) {
      views.accountPoolMeta.textContent = `共 ${stats.total} 个账号 / 云端可用 ${stats.availableCloud} / 本地 ${stats.local}${stats.invalidCloud ? ` / 已隐藏失效 ${stats.invalidCloud}` : ""}`;
    }
    if (views.accountFilterMeta) {
      views.accountFilterMeta.textContent = uiState.showInvalidCloudAccounts
        ? `正在显示 ${stats.invalidCloud} 个已失效云端账号`
        : stats.invalidCloud ? `已隐藏 ${stats.invalidCloud} 个失效云端账号` : "当前没有失效云端账号";
    }
    if (views.accountPoolSummary) {
      views.accountPoolSummary.innerHTML = [
        ["全部", stats.total],
        ["云端可用", stats.availableCloud],
        ["本地", stats.local],
        ["失效", stats.invalidCloud]
      ].map(([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `).join("");
    }
    if (views.accountModal) views.accountModal.hidden = !uiState.accountFormOpen;
    views.accountTypePicker?.classList.toggle("is-active", uiState.accountFormOpen && uiState.accountTypePicking);
    views.accountForm?.classList.toggle("is-open", uiState.accountFormOpen && !uiState.accountTypePicking);
    setAccountCredentialMode(fields.accountCredentialMode?.value || "password");

    const visibleAccounts = visibleAccountPool();
    const activeCloudAccountId = latestUsedAccountId();
    views.accountPool.innerHTML = visibleAccounts.map((account) => {
      const cloudReadonly = isCloudAccount(account);
      const isSelected = !cloudReadonly && account.id === state.selectedFullAccountId;
      const isActiveCloud = cloudReadonly && activeCloudAccountId && account.id === activeCloudAccountId;
      const alreadyCloud = !cloudReadonly && cloudHasAccount(account.id);
      const status = accountStatusInfo(account);
      const rights = accountRightsInfo(account);
      const title = accountNickname(account);
      const meta = [
        cloudReadonly ? "云端账号" : "本地账号",
        credentialLabel(account),
        account.username ? `用户名 ${account.username}` : "",
        account.userInfo?.id ? `用户 ID ${account.userInfo.id}` : "",
        account.id
      ].filter(Boolean).join(" / ");
      return `
        <article class="${["txzz-account-card", isSelected ? "is-selected" : "", isActiveCloud ? "is-active-cloud" : "", cloudReadonly ? "is-cloud" : "is-local", status.ok ? "is-usable" : "is-invalid"].filter(Boolean).join(" ")}">
          <div class="txzz-account-card-main">
            <div class="txzz-account-card-title">
              <b>${escapeHtml(title)}</b>
              <div class="txzz-account-badges">
                ${isActiveCloud ? `<em class="txzz-status-running">最近使用</em>` : ""}
                ${cloudReadonly ? `<em class="txzz-status-cloud">自动轮换</em>` : ""}
                <em class="txzz-status-${escapeHtml(status.tone)}">${escapeHtml(status.label)}</em>
              </div>
            </div>
            <span>${escapeHtml(meta)}</span>
            <div class="txzz-account-rights" aria-label="账号权益摘要">
              <span class="txzz-right-${escapeHtml(rights.vip.tone)}"><i>普通 VIP</i><b>${escapeHtml(rights.vip.label)}</b></span>
              <span class="txzz-right-${escapeHtml(rights.dark.tone)}"><i>尤物圈</i><b>${escapeHtml(rights.dark.label)}</b></span>
              <span class="txzz-right-${escapeHtml(rights.coin.tone)}"><i>金币</i><b>${escapeHtml(rights.coin.label)}</b></span>
            </div>
            <p>${escapeHtml(status.ok ? status.reason : `不可用原因：${status.reason}`)}</p>
            ${cloudReadonly ? `<code>云端摘要：${escapeHtml(account.tokenMasked || account.qrcodeMasked || account.passwordMasked || "凭据仅服务端可见")}</code>` : `<code>${escapeHtml(account.tokenMasked || (account.hasToken ? "token 已保存" : "本地凭据可编辑"))}</code>`}
          </div>
          <div class="txzz-account-actions">
            ${cloudReadonly ? `<button data-action="noop" disabled>自动轮换</button>` : `<button data-action="select-account" data-account-id="${escapeHtml(account.id)}">${isSelected ? "已选择" : "选择"}</button>`}
            ${cloudReadonly ? "" : `<button data-action="verify-account" data-account-id="${escapeHtml(account.id)}">检查</button>`}
            ${cloudReadonly ? `<button data-action="show-account-summary" data-account-id="${escapeHtml(account.id)}">摘要</button>` : `<button data-action="edit-account" data-account-id="${escapeHtml(account.id)}">编辑</button>`}
            ${cloudReadonly ? "" : `<button data-action="${alreadyCloud ? "noop" : "upload-local-account-remote"}" data-account-id="${escapeHtml(account.id)}" ${alreadyCloud ? "disabled" : ""}>${alreadyCloud ? "已在云端" : "上传云端"}</button>`}
            ${cloudReadonly ? "" : `<button data-action="remove-account" data-account-id="${escapeHtml(account.id)}">移除</button>`}
          </div>
        </article>
      `;
    }).join("") || emptyState(
      stats.invalidCloud && !uiState.showInvalidCloudAccounts ? "已隐藏失效云端账号" : "账号池为空",
      stats.invalidCloud && !uiState.showInvalidCloudAccounts ? "打开「查看已失效云端账号」后可查看待检查或不可用账号" : "点击「添加账号」保存本地账号，或同步云端账号池"
    );
  }

  function renderFullDetails() {
    const latest = state.fullDetails[state.fullDetails.length - 1];
    if (views.fullplaySummary) {
      views.fullplaySummary.innerHTML = latest ? `
      <div>
        <span>最近记录</span>
        <strong>${escapeHtml(latest.movieId || "")}</strong>
        <small>${escapeHtml([latest.accountLabel || latest.accountUser, latest.action, latest.hasBuy ? `has_buy=${latest.hasBuy}` : ""].filter(Boolean).join(" / "))}</small>
      </div>
      <div>
        <span>完整 M3U8</span>
        <strong>${escapeHtml(latest.fullStat?.segments ?? "?")} 片</strong>
        <small>${escapeHtml(latest.fullStat?.duration ? `${latest.fullStat.duration}s` : latest.fullStat?.error || "等待统计")}</small>
      </div>
    ` : emptyState("等待播放详情", "打开视频详情页后会记录完整播放资源");
    }
    if (views.fullplayList) {
      views.fullplayList.innerHTML = state.fullDetails.slice(-24).reverse().map((item) => `
      <article>
        <b>${escapeHtml(item.movieId)} 路 ${escapeHtml(item.action || "full_detail")}</b>
        <span>${escapeHtml([item.accountLabel || item.accountUser, item.fullStat?.segments ? `${item.fullStat.segments} 片` : "", item.fullStat?.duration ? `${item.fullStat.duration}s` : ""].filter(Boolean).join(" / "))}</span>
        <code>${escapeHtml(item.playLink || "")}</code>
        ${item.backupLink ? `<code>${escapeHtml(item.backupLink)}</code>` : ""}
        <div class="txzz-account-actions">
          <button data-action="download-full-video" data-movie-id="${escapeHtml(item.movieId || "")}">下载视频</button>
        </div>
      </article>
    `).join("") || emptyState("还没有播放详情记录", "获取完整播放资源后会在这里展示");
    }
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
    const hasUpdate = Boolean(update?.updateAvailable && update?.remote?.id);
    uiState.repositoryUpdate = hasUpdate ? update : null;
    renderRepositoryUpdateBanner(uiState.repositoryUpdate);
    return hasUpdate;
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
    views.updateDialog.hidden = false;
    views.updateDialog.classList.add("is-open");
    emitFlow("更新提醒", "远程仓库发现新的版本清单", "ok");
  }

  async function closeRepositoryUpdateDialog(mode = "dismissed") {
    const updateId = uiState.repositoryUpdate?.remote?.id || "";
    views.updateDialog.classList.remove("is-open");
    views.updateDialog.hidden = true;
    if (updateId) {
      await sendRuntime("markRepositoryUpdateNotified", { updateId, mode }).catch(() => {});
    }
  }

  async function checkRepositoryUpdate(force = false, options = {}) {
    const showDialog = options.showDialog ?? Boolean(force);
    const silent = Boolean(options.silent);
    if (repositoryUpdateCheckTask) return repositoryUpdateCheckTask;
    repositoryUpdateCheckTask = (async () => {
      try {
        const response = await sendRuntime("checkRepositoryUpdate", { force });
        const hasUpdate = rememberRepositoryUpdate(response);
        if (hasUpdate && showDialog) showRepositoryUpdateDialog(response);
        else if (force && !silent) {
          emitFlow("更新提醒", "当前已是最新版本", "ok");
        }
        return response;
      } catch (err) {
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

  function accountFromForm() {
    const label = fields.accountLabel.value.trim();
    const username = fields.accountUsername.value.trim();
    const slugSource = username || label;
    const slugValue = slugSource.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
    const id = fields.accountId.value.trim() || (slugValue ? `full-${slugValue}` : `full-local-${Date.now()}`);
    const mode = fields.accountCredentialMode?.value || "password";
    const account = {
      id,
      label: label || username || id,
      username: mode === "password" ? username : "",
      password: mode === "password" ? fields.accountPassword.value : "",
      deviceId: mode === "token" ? fields.accountDeviceId.value.trim() : "",
      userToken: mode === "token" ? fields.accountToken.value.trim() : "",
      qrcode: mode === "qrcode" ? fields.accountQrcode.value.trim() : "",
      notes: fields.accountNotes.value.trim(),
      source: id === "full-lsyhook" ? "seed" : "manual"
    };
    if (mode === "qrcode" && !account.label && !account.id) account.label = "账号凭证";
    return account;
  }

  function validateAccountCredential(account = {}, mode = fields.accountCredentialMode?.value || "password") {
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

  async function saveAccount() {
    const selected = uiState.editingAccountId ? state.accountPool.find((item) => item.id === uiState.editingAccountId) : null;
    if (selected && isCloudAccount(selected)) throw new Error("云端账号只显示脱敏摘要，不能在插件前端修改；请先切换到本地账号或新建本地账号。");
    const account = accountFromForm();
    validateAccountCredential(account);
    const existing = state.accountPool.find((item) => item.id === account.id);
    if (existing && isCloudAccount(existing) && existing.id !== uiState.editingAccountId) throw new Error("云端账号只显示摘要，不能用同 ID 覆盖；请换一个账号 ID");
    const response = await sendRuntime("upsertAccount", { account });
    syncSavedState(response.state || {});
    closeAccountForm();
    emitFlow("账号池", `已保存 ${account.label || account.username}`, "ok");
  }

  async function saveRemoteConfig() {
    const response = await sendRuntime("saveRemoteConfig", {
      remote: {
        baseUrl: fields.remoteBaseUrl.value.trim(),
        accountSourceMode: fields.accountSourceMode?.value || "cloud",
        fixedAccountId: "",
        enabled: true,
        fallbackLocal: fields.accountSourceMode?.value === "cloud-first"
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

  async function uploadAccountRemote() {
    const selected = uiState.editingAccountId ? state.accountPool.find((item) => item.id === uiState.editingAccountId) : null;
    if (selected && isCloudAccount(selected)) throw new Error("云端账号只显示脱敏摘要，不能直接重复上传；请先在表单中新建本地账号或导入当前会话。");
    const account = accountFromForm();
    validateAccountCredential(account);
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
    panel.classList.toggle("txzz-open", state.expanded);
    panel.classList.toggle("txzz-closed", !state.expanded);
    if (state.expanded && views.flowBadge) {
      flowBadgeQueue.length = 0;
      flowBadgeActive = false;
      window.clearTimeout(flowBadgeTimer);
      views.flowBadge.className = "txzz-flow-badge";
      views.flowBadge.hidden = true;
    }
    publishState();
    if (state.expanded) {
      panel.classList.remove("txzz-dragged");
      shell.style.removeProperty("--txzz-left");
      shell.style.removeProperty("--txzz-top");
      collectSession().catch(() => {});
      loadSavedState(false).catch(() => {});
      remindRepositoryUpdateOnPanelOpen();
    }
  }

  function switchTab(tab) {
    const targetTab = PAGE_TITLES[tab] ? tab : "overview";
    panel.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === targetTab));
    panel.querySelectorAll("[data-view-panel]").forEach((view) => view.classList.toggle("is-active", view.dataset.viewPanel === targetTab));
    if (views.pageTitle) views.pageTitle.textContent = PAGE_TITLES[targetTab] || "功能面板";
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
        await copyText(latest?.url || "", "最新播放链接");
      }
      if (action === "copy-full-link") {
        const latest = state.fullDetails[state.fullDetails.length - 1];
        await copyText(latest?.playLink || latest?.backupLink || "", "最近播放链接");
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
      if (action === "choose-account-type") openAccountForm(null, actionEl.dataset.credentialMode || "password");
      if (action === "back-account-type") backAccountTypePicker();
      if (action === "edit-account") {
        const account = state.accountPool.find((item) => item.id === accountId);
        if (!account) throw new Error(`未找到账号：${accountId}`);
        openAccountForm(account);
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
      if (action === "check-update") await checkRepositoryUpdate(true);
      if (action === "download-latest") {
        const response = await sendRuntime("downloadRepositoryArchive", {
          version: uiState.repositoryUpdate?.remote?.version || "",
          build: uiState.repositoryUpdate?.remote?.build || ""
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
    event.preventDefault();
  });

  updateDialog.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-update-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.updateAction;
    try {
      if (action === "open") {
        openRepositoryHome();
        await closeRepositoryUpdateDialog("notified");
        emitFlow("更新提醒", "已打开糖心志者项目仓库", "ok");
      }
      if (action === "download") {
        const response = await sendRuntime("downloadRepositoryArchive", {
          version: uiState.repositoryUpdate?.remote?.version || "",
          build: uiState.repositoryUpdate?.remote?.build || ""
        });
        await closeRepositoryUpdateDialog("notified");
        emitFlow("更新提醒", response.downloadId ? `已开始下载最新版压缩包：${response.filename}` : "已提交最新版下载任务", "ok");
      }
      if (action === "dismiss") {
        await closeRepositoryUpdateDialog("dismissed");
        emitFlow("更新提醒", "已关闭本次更新提醒", "ok");
      }
    } catch (err) {
      emitFlow("更新提醒", err?.message || String(err), "error");
    }
    event.preventDefault();
  });

  panel.addEventListener("submit", (event) => {
    if (event.target.closest(".txzz-account-form")) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  panel.addEventListener("change", (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;
    if (field.dataset.field === "showInvalidCloudAccounts") {
      uiState.showInvalidCloudAccounts = Boolean(field.checked);
      renderAccounts();
    }
    if (field.dataset.field === "accountCredentialMode") {
      setAccountCredentialMode(field.value || "password");
    }
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
