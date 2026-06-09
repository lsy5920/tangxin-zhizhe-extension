"use strict";

(() => {
  const patch = {
    is_vip: "y",
    is_dark_vip: "y",
    group_name: "糖心王冠永久卡",
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

  const userHints = /user|info|member|vip|dark|wallet|balance|mine|profile|account|group|ticket|coin|gold|nickname|avatar/i;
  const valueHints = /is_vip|is_dark_vip|group_name|group_end_time|balance|ticket|vip_end_time|dark_vip/i;
  let domTextPatchRoute = "";
  let domTextPatchAt = 0;
  let displayRoutePatchKey = "";

  function routeKey() {
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

  function assignPatch(obj) {
    if (!obj || typeof obj !== "object") return false;
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      try {
        obj[key] = value;
        changed = true;
      } catch (_) {}
    }
    return changed;
  }

  function looksLikeUser(obj, path) {
    if (!obj || typeof obj !== "object") return false;
    let keys = [];
    try {
      keys = Object.keys(obj);
    } catch (_) {
      return false;
    }
    const joined = keys.join("|");
    if (valueHints.test(joined)) return true;
    return /userInfo|user_info|memberInfo|profile|mine|accountInfo/i.test(path || "");
  }

  function walk(root, path, depth, seen) {
    if (!root || typeof root !== "object" || depth > 6 || seen.has(root)) return 0;
    seen.add(root);
    let patched = 0;
    if (looksLikeUser(root, path)) patched += assignPatch(root) ? 1 : 0;
    let keys = [];
    try {
      keys = Object.keys(root);
    } catch (_) {
      return patched;
    }
    for (const key of keys) {
      if (depth > 1 && !userHints.test(key)) continue;
      try {
        const value = root[key];
        if (value && typeof value === "object") patched += walk(value, path ? `${path}.${key}` : key, depth + 1, seen);
      } catch (_) {}
    }
    return patched;
  }

  function patchStorageArea(area) {
    if (!area) return 0;
    let count = 0;
    for (let i = 0; i < area.length; i += 1) {
      const key = area.key(i);
      const raw = area.getItem(key);
      if (!raw || !/(vip|dark|group|balance|user|member|profile|ticket)/i.test(`${key} ${raw.slice(0, 400)}`)) continue;
      try {
        const parsed = JSON.parse(raw);
        const before = JSON.stringify(parsed);
        walk(parsed, key, 0, new WeakSet());
        if (looksLikeUser(parsed, key)) assignPatch(parsed);
        const after = JSON.stringify(parsed);
        if (after !== before) {
          area.setItem(key, after);
          count += 1;
        }
      } catch (_) {}
    }
    return count;
  }

  function patchDomText(force = false) {
    const root = document.body;
    if (!root) return;
    const currentRoute = routeKey();
    const now = Date.now();
    if (!force && domTextPatchRoute === currentRoute && now - domTextPatchAt < 5000) return;
    domTextPatchRoute = currentRoute;
    domTextPatchAt = now;
    const replacements = [
      [/免费观影\s*\(游客\)\s*[:：]\s*\d+\s*\/\s*\d+/g, "永久会员观影：999/999"],
      [/免费观影\s*\(游客\)/g, "永久会员观影"],
      [/余额\s*[:：]?\s*0\b/g, "余额 999"],
      [/开通会员/g, "永久会员"],
      [/享无限观看，购彩折扣等权益/g, "永久权益已开通"],
      [/享无限观看/g, "永久权益已开通"],
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
      [/开通暗网/g, "尤物圈已开通"],
      [/暗网VIP/g, "尤物圈永久会员"],
      [/尤物圈权限/g, "尤物圈永久权限"],
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

  function ensureStyle() {
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
      "html[data-txzz-vip='permanent'] .txzz-visible-chip{display:inline-flex!important;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:rgba(255,211,106,.16);color:#ffd36a!important;font-size:11px!important}",
      "#txzz-dark-status-card{margin:10px 14px 8px;padding:10px 12px;border:1px solid rgba(255,79,115,.34);border-radius:12px;background:linear-gradient(135deg,#27111b,#0d0608 56%,#211526);color:#fff;font-family:inherit;box-shadow:0 12px 26px rgba(0,0,0,.26)}",
      "#txzz-dark-status-card span{display:block;color:#ff8fa7;font-size:12px}",
      "#txzz-dark-status-card strong{display:block;margin-top:4px;color:#fff;font-size:16px}",
      "#txzz-dark-status-card small{display:block;margin-top:5px;color:rgba(255,250,246,.68);font-size:11px}",
      "html[data-txzz-full-account='true'] .main.blur{filter:none!important}",
      "html[data-txzz-full-account='true'] .txzz-hidden-vip-dialog{display:none!important;visibility:hidden!important;pointer-events:none!important}"
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  function patchMineVisible() {
    removeVisibleStatusCards();
    return;
    const existingCard = document.getElementById("txzz-mine-status-card");
    if (existingCard?.dataset.txzzRendered === "1") return;
    if (existingCard) existingCard.dataset.txzzRendered = "1";
    ensureStyle();
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
    const pageText = container.innerText || "";
    if (!/永久会员|永久尤物圈/.test(pageText)) {
      const chip = document.createElement("span");
      chip.className = "txzz-visible-chip";
      chip.textContent = "永久会员";
      const target = container.querySelector(".info") || container.querySelector(".nav") || container;
      target.appendChild(chip);
    }
  }

  function patchVueInstances() {
    const seen = new WeakSet();
    function patchVm(vm) {
      if (!vm || typeof vm !== "object" || seen.has(vm)) return;
      seen.add(vm);
      try {
        if (Object.prototype.hasOwnProperty.call(vm, "vipTipsPanelShow")) vm.vipTipsPanelShow = false;
        if (vm.$data && Object.prototype.hasOwnProperty.call(vm.$data, "vipTipsPanelShow")) vm.$data.vipTipsPanelShow = false;
        if (vm.$options?.name === "dark" || vm.$route?.path === "/dark") {
          if (Object.prototype.hasOwnProperty.call(vm, "vipTipsPanelShow")) vm.vipTipsPanelShow = false;
          if (vm.u && typeof vm.u === "object") assignPatch(vm.u);
        }
        if (vm.$store?.state?.userInfo) assignPatch(vm.$store.state.userInfo);
        if (vm.$store?.state?.refresh) vm.$store.state.refresh.dark = false;
        if (Array.isArray(vm.$children)) vm.$children.forEach(patchVm);
      } catch (_) {}
    }
    try {
      patchVm(window.$nuxt);
    } catch (_) {}
    try {
      document.querySelectorAll("*").forEach((el) => {
        if (el.__vue__) patchVm(el.__vue__);
      });
    } catch (_) {}
  }

  function patchDarkVisible() {
    removeVisibleStatusCards();
    ensureStyle();
    try {
      patchVueInstances();
    } catch (_) {}
    document.querySelectorAll(".main.blur").forEach((el) => el.classList.remove("blur"));
    const darkPage = location.pathname.replace(/\/$/, "") === "/dark" || /尤物圈/.test(document.body?.innerText || "");
    if (false && darkPage) {
      const container = document.querySelector(".bg-page") || document.querySelector(".app-container") || document.body;
      if (container && !document.getElementById("txzz-dark-status-card")) {
        const card = document.createElement("section");
        card.id = "txzz-dark-status-card";
        card.dataset.txzzRendered = "1";
        card.innerHTML = '<span>尤物圈权限</span><strong>永久尤物圈已开通</strong><small>权限弹窗与模糊遮罩已解除，可继续浏览当前列表</small>';
        const anchor = container.querySelector(".main") || container.firstElementChild;
        if (anchor?.parentNode) anchor.parentNode.insertBefore(card, anchor);
        else container.insertBefore(card, container.firstChild);
      }
    }
    document.querySelectorAll(".van-dialog,.van-overlay,.van-popup").forEach((el) => {
      const text = el.innerText || "";
      if (/尤物|会员|VIP|开通|权限|暗网/.test(text)) {
        el.classList.add("txzz-hidden-vip-dialog");
        try {
          el.style.setProperty("display", "none", "important");
        } catch (_) {}
      }
    });
    document.body?.classList?.remove("van-overflow-hidden");
  }

  function applyToStore(options = {}) {
    try {
      if (window.$nuxt?.$store?.state?.userInfo) assignPatch(window.$nuxt.$store.state.userInfo);
    } catch (_) {}
    try {
      if (window.__NUXT__?.state?.userInfo) assignPatch(window.__NUXT__.state.userInfo);
    } catch (_) {}
    try {
      walk(window.$nuxt?.$store?.state, "$store.state", 0, new WeakSet());
    } catch (_) {}
    try {
      walk(window.$nuxt?.$store?.getters, "$store.getters", 0, new WeakSet());
    } catch (_) {}
    try {
      walk(window.__NUXT__?.state, "__NUXT__.state", 0, new WeakSet());
    } catch (_) {}
    try {
      patchStorageArea(localStorage);
    } catch (_) {}
    try {
      patchStorageArea(sessionStorage);
    } catch (_) {}
    try {
      removeVisibleStatusCards();
      if (isAccountDisplayRoute()) patchDomText(Boolean(options.forceText));
    } catch (_) {}
    try {
      if (location.pathname.replace(/\/$/, "") === "/mine") patchMineVisible();
    } catch (_) {}
    try {
      patchDarkVisible();
    } catch (_) {}
    window.__txzzDisplayPatch = { active: true, patch, appliedAt: new Date().toISOString() };
    document.documentElement.dataset.txzzVip = "permanent";
    document.documentElement.dataset.txzzFullAccount = "true";
  }

  window.__txzzApplyDisplayPatch = (options = {}) => applyToStore({ ...options, forceText: true });
  if (!window.__txzzDisplayMessageBound) {
    window.__txzzDisplayMessageBound = true;
    window.addEventListener("message", (event) => {
      const data = event?.data || {};
      if (event.source !== window || data.source !== "txzz-content" || data.kind !== "display-apply") return;
      applyToStore({ forceText: true });
    }, true);
  }
  applyToStore({ forceText: true });
  try {
    if (!window.__txzzDisplayObserver) {
      let pending = false;
      let lastRun = 0;
      const schedule = (forceText = false) => {
        if (pending) return;
        pending = true;
        window.setTimeout(() => {
          pending = false;
          const now = Date.now();
          const currentRoute = routeKey();
          const routeChanged = currentRoute !== displayRoutePatchKey;
          if (!forceText && !routeChanged && now - lastRun < 1500) return;
          displayRoutePatchKey = currentRoute;
          lastRun = now;
          applyToStore({ forceText: forceText || routeChanged });
        }, 600);
      };
      window.__txzzDisplayObserver = new MutationObserver((mutations) => {
        const meaningful = mutations.some((mutation) => {
          if (mutation.target?.closest?.("#txzz-panel,#txzz-mine-status-card,#txzz-dark-status-card")) return false;
          return Array.from(mutation.addedNodes || []).some((node) => node.nodeType === Node.ELEMENT_NODE);
        });
        if (meaningful) schedule(false);
      });
      window.__txzzDisplayObserver.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", () => schedule(true), true);
      window.addEventListener("hashchange", () => schedule(true), true);
      window.addEventListener("focus", () => schedule(false), true);
      [500, 1800, 3500].forEach((delay) => window.setTimeout(() => schedule(delay === 500), delay));
    }
  } catch (_) {}
})();
