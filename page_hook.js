"use strict";

(() => {
  if (window.__txzzHookInstalled) return;
  window.__txzzHookInstalled = true;

  const SOURCE = "txzz-page-hook";
  const CONTENT_SOURCE = "txzz-content";
  const PLAYBACK_HINTS = [".m3u8", ".mp4", ".ts?", "/play", "/video", "vod", "media", "m3u8"];
  const PURCHASE_HINTS = [
    "buy",
    "purchase",
    "gold",
    "coin",
    "unlock",
    "pay",
    "order",
    "wallet",
    "balance",
    "consume",
    "recharge",
    "has_buy",
    "buyed",
    "bought",
    "购买",
    "金币",
    "解锁",
    "支付",
    "订单",
    "余额"
  ];
  const PERMISSION_HINTS = [
    "vip",
    "member",
    "dark",
    "permission",
    "privilege",
    "auth",
    "can_play",
    "allow_play",
    "need_vip",
    "need_buy",
    "need_pay",
    "is_vip",
    "is_dark_vip",
    "尤物",
    "会员",
    "权限",
    "试看",
    "付费"
  ];

  const fullplay = {
    enabled: true,
    hits: [],
    errors: [],
    installedTargets: [],
    patchRuns: [],
    pending: new Map(),
    cache: new Map(),
    lastMessage: "糖心志者完整播放 Hook 已安装"
  };

  function now() {
    return new Date().toISOString();
  }

  function safeString(value, limit = 1600) {
    try {
      if (typeof value === "string") return value.slice(0, limit);
      if (value instanceof URLSearchParams) return value.toString().slice(0, limit);
      if (value instanceof FormData) {
        return JSON.stringify(Array.from(value.entries()).map(([key, item]) => [key, item?.name || item])).slice(0, limit);
      }
      return JSON.stringify(value).slice(0, limit);
    } catch (_) {
      return String(value).slice(0, limit);
    }
  }

  function emit(kind, payload) {
    window.postMessage({ source: SOURCE, kind, payload: { ts: now(), ...payload } }, "*");
  }

  function norm(value) {
    return String(value || "").toLowerCase();
  }

  function hasAny(value, hints) {
    const s = norm(value);
    return hints.some((hint) => s.includes(norm(hint)));
  }

  function sameMovieDetailUrl(value) {
    try {
      const next = new URL(String(value || location.href), location.href);
      return /^\/movie\/detail\/\d+\/?$/.test(location.pathname) &&
        next.origin === location.origin &&
        next.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "") &&
        next.search === location.search;
    } catch (_) {
      return false;
    }
  }

  function installSameDetailNavigationGuard() {
    try {
      if (window.__txzzNavGuard?.install) {
        window.__txzzNavGuard.install();
        emit("fullplay-status", { message: "同详情页早期导航守卫已接管", movieId: getMovieId(null, location.href), background: true });
      }
    } catch (_) {}
    if (window.__txzzSameDetailNavigationGuard) return;
    window.__txzzSameDetailNavigationGuard = true;
    let lastSameDetailAt = 0;
    const shouldSuppress = (value) => {
      try {
        if (window.__txzzNavGuard?.shouldSuppress) return window.__txzzNavGuard.shouldSuppress(value, "page-hook.history");
      } catch (_) {}
      if (!sameMovieDetailUrl(value)) return false;
      const nowTime = Date.now();
      const suppress = nowTime - lastSameDetailAt < 5000;
      lastSameDetailAt = nowTime;
      return suppress;
    };
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      if (typeof original !== "function") continue;
      history[name] = function txzzHistoryGuard(state, title, url) {
        if (url && shouldSuppress(url)) {
          emit("fullplay-status", { message: "同详情页重复导航已静默处理", movieId: getMovieId(null, location.href), background: true });
          return undefined;
        }
        return original.apply(this, arguments);
      };
    }
  }

  function routeTargetUrl(to) {
    if (typeof to === "string") return to;
    if (!to || typeof to !== "object") return "";
    if (to.fullPath) return to.fullPath;
    if (to.path) {
      let query = "";
      try {
        if (to.query && typeof to.query === "object") query = `?${new URLSearchParams(to.query).toString()}`;
      } catch (_) {}
      return `${to.path}${query}${to.hash || ""}`;
    }
    if (to.params?.id) return `/movie/detail/${to.params.id}`;
    return "";
  }

  function shouldSuppressDetailNavigation(value, kind) {
    try {
      if (window.__txzzNavGuard?.shouldSuppress) return window.__txzzNavGuard.shouldSuppress(value, kind);
    } catch (_) {}
    return sameMovieDetailUrl(value);
  }

  function patchRouterNavigationTarget(router, label) {
    if (!router || router.__txzzFullplayRouterPatched) return false;
    let patched = 0;
    for (const name of ["push", "replace"]) {
      const original = router[name];
      if (typeof original !== "function" || original.__txzzFullplayNavPatched) continue;
      const wrapped = function txzzRouterNavigationGuard(to) {
        const target = routeTargetUrl(to);
        if (target && shouldSuppressDetailNavigation(target, `${label}.${name}`)) {
          emit("fullplay-status", { message: "同详情页路由重进已静默处理", movieId: getMovieId(null, location.href), background: true });
          if (typeof Promise !== "undefined") return Promise.resolve(router.currentRoute || undefined);
          return undefined;
        }
        return original.apply(this, arguments);
      };
      wrapped.__txzzFullplayNavPatched = true;
      wrapped.__txzzOriginal = original;
      try {
        Object.defineProperty(router, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: wrapped
        });
      } catch (_) {
        router[name] = wrapped;
      }
      patched += 1;
    }
    if (patched) {
      router.__txzzFullplayRouterPatched = true;
      emit("hook", { target: `${label}.navigation`, status: "patched" });
    }
    return Boolean(patched);
  }

  function patchRouterNavigation() {
    let patched = 0;
    try { patched += patchRouterNavigationTarget(window.$nuxt?.$router, "$nuxt.$router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterNavigationTarget(window.$nuxt?.$root?.$router, "$nuxt.$root.$router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterNavigationTarget(window.$nuxt?.$options?.router, "$nuxt.$options.router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterNavigationTarget(window.$nuxt?.context?.app?.router, "$nuxt.context.app.router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterNavigationTarget(window.$nuxt?.$root?.context?.app?.router, "$nuxt.$root.context.app.router") ? 1 : 0; } catch (_) {}
    try { patched += window.__txzzNavGuard?.patchRouters?.() || 0; } catch (_) {}
    return patched;
  }

  function classifyUrl(url) {
    const s = norm(url);
    if (s.includes(".m3u8")) return "m3u8";
    if (s.includes(".mp4")) return "mp4";
    if (/\.ts(?:[?#/]|$)/i.test(String(url || ""))) return "segment";
    if (hasAny(s, ["buy", "purchase", "unlock", "consume", "gold", "coin", "购买", "金币", "解锁"])) return "purchase-api";
    if (hasAny(s, ["pay", "order", "recharge", "支付", "订单"])) return "payment-api";
    if (hasAny(s, ["balance", "wallet", "余额"])) return "balance-api";
    if (hasAny(s, PERMISSION_HINTS)) return "permission-api";
    if (hasAny(s, ["/play", "play/", "play?", "play_", "getplay"])) return "play-api";
    if (hasAny(s, ["/video", "video/", "video?", "vod", "/movie/detail"])) return "video-api";
    return "request";
  }

  function classifyBody(text) {
    const s = String(text || "");
    const flags = [];
    if (hasAny(s, ["need_vip", "vip_required", "is_vip", "会员", "开通会员"])) flags.push("vip");
    if (hasAny(s, ["need_buy", "need_pay", "has_buy", "buyed", "bought", "已购买", "未购买", "需要购买"])) flags.push("purchase");
    if (hasAny(s, ["gold", "coin", "金币", "余额", "balance"])) flags.push("balance");
    if (hasAny(s, ["m3u8", ".mp4", "play_url", "play_link", "backup_link", "video_url", "media_url", "url"])) flags.push("playback");
    if (hasAny(s, ["permission", "privilege", "can_play", "allow_play", "权限", "试看"])) flags.push("permission");
    if (hasAny(s, ["insufficient", "not enough", "不足"])) flags.push("insufficient-balance");
    return Array.from(new Set(flags));
  }

  function isInterestingUrl(url) {
    const category = classifyUrl(url);
    return category !== "request" || hasAny(url, PLAYBACK_HINTS) || hasAny(url, PURCHASE_HINTS) || hasAny(url, PERMISSION_HINTS);
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

  function extractMediaUrls(text) {
    const source = String(text || "");
    const urls = new Set();
    const absolute = /https?:\/\/[^\s"'<>\\]+/gi;
    const relative = /(?:\/|\.\/|\.\.\/)[^\s"'<>\\]*(?:\.m3u8|\.mp4|\.ts)(?:[^\s"'<>\\]*)?/gi;
    for (const match of source.matchAll(absolute)) {
      const url = normalizeUrl(match[0].replace(/[),.;]+$/g, ""));
      if (classifyUrl(url) !== "request" || hasAny(url, PLAYBACK_HINTS)) urls.add(url);
    }
    for (const match of source.matchAll(relative)) {
      const url = normalizeUrl(match[0].replace(/[),.;]+$/g, ""));
      if (hasAny(url, PLAYBACK_HINTS)) urls.add(url);
    }
    return Array.from(urls).slice(0, 24);
  }

  function inspectBody(via, method, url, status, bodyHead) {
    const flags = classifyBody(bodyHead);
    const mediaUrls = extractMediaUrls(bodyHead);
    const category = classifyUrl(url);
    const shouldObserve = flags.length || ["purchase-api", "payment-api", "balance-api", "permission-api", "play-api", "video-api"].includes(category);
    if (shouldObserve) {
      emit("observation", {
        via,
        method,
        url: String(url || ""),
        status,
        category,
        flags,
        mediaUrls,
        bodyHead: safeString(bodyHead, 900)
      });
    }
    for (const mediaUrl of mediaUrls) {
      emit("media", { via: `${via}.body`, url: mediaUrl, category: classifyUrl(mediaUrl) });
    }
  }

  function requestMeta(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = init?.method || input?.method || "GET";
    const body = init?.body || input?.body || "";
    return { url: String(url || ""), method: String(method || "GET").toUpperCase(), bodyHead: safeString(body, 500) };
  }

  function getMovieId(params, api) {
    if (params && typeof params === "object") {
      if (params.id) return String(params.id);
      if (params.movie_id) return String(params.movie_id);
      if (params.movieId) return String(params.movieId);
    }
    if (typeof params === "string") {
      try {
        const parsed = JSON.parse(params);
        return getMovieId(parsed, api);
      } catch (_) {
        const query = new URLSearchParams(params.includes("=") ? params : "");
        const id = query.get("id") || query.get("movie_id") || query.get("movieId");
        if (id) return id;
      }
    }
    const m = String(api || location.href).match(/\/movie\/detail\/(\d+)/);
    return m ? m[1] : "";
  }

  function recordHit(event) {
    fullplay.hits.push({ time: now(), ...event });
    fullplay.hits = fullplay.hits.slice(-100);
  }

  function recordError(error, extra = {}) {
    fullplay.errors.push({
      time: now(),
      message: error?.message || String(error),
      ...extra
    });
    fullplay.errors = fullplay.errors.slice(-60);
  }

  function setMessage(message, level = "info") {
    fullplay.lastMessage = message;
    emit(level === "error" ? "fullplay-error" : "fullplay-status", { message, level });
  }

  function fullUserPatch(info = {}) {
    if (!info || typeof info !== "object") return info;
    return {
      ...info,
      is_vip: "y",
      is_dark_vip: "y",
      vip: "y",
      dark_vip: "y",
      has_vip: "y",
      has_dark_vip: "y",
      group_name: info.group_name && /永久/.test(String(info.group_name)) ? info.group_name : "糖心王冠永久卡",
      group_end_time: info.group_end_time && /永久/.test(String(info.group_end_time)) ? info.group_end_time : "VIP永久有效",
      balance: info.balance && Number(info.balance) > 999 ? info.balance : "999",
      balance_income: info.balance_income && Number(info.balance_income) > 999 ? info.balance_income : "999",
      coin: info.coin && Number(info.coin) > 999 ? info.coin : "999",
      gold: info.gold && Number(info.gold) > 999 ? info.gold : "999",
      ticket: info.ticket || "6",
      __txzz_full_account: true
    };
  }

  function fullVipPatch(data) {
    const patchCard = (item = {}) => ({
      ...item,
      has_buy: "y",
      is_buy: "y",
      buyed: "y",
      end_time: item.end_time || "永久",
      group_end_time: item.group_end_time || "VIP永久有效",
      __txzz_full_account: true
    });
    if (Array.isArray(data)) return data.map(patchCard);
    if (data && typeof data === "object") return patchCard(data);
    return data;
  }

  function requestFullDetail(movieId, visitorDetail) {
    const cached = fullplay.cache.get(String(movieId));
    if (cached) return Promise.resolve(cached);
    const requestId = `txzz_full_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        fullplay.pending.delete(requestId);
        reject(new Error(`完整详情请求超时：${movieId}`));
      }, 15000);
      fullplay.pending.set(requestId, { resolve, reject, timer });
      emit("full-detail-request", {
        id: requestId,
        movieId,
        visitorDetail,
        href: location.href
      });
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== CONTENT_SOURCE) return;
    if (event.data?.kind === "clear-runtime-cache") {
      fullplay.pending.forEach((item) => {
        try {
          window.clearTimeout(item.timer);
          item.reject(new Error("插件数据缓存已清除"));
        } catch (_) {}
      });
      fullplay.pending.clear();
      fullplay.cache.clear();
      fullplay.hits = [];
      fullplay.errors = [];
      fullplay.patchRuns = [];
      setMessage("插件数据缓存已清除，请刷新页面后继续测试", "ok");
      emit("fullplay-status", { message: "页面 Hook 运行缓存已清除", level: "ok" });
      return;
    }
    if (event.data?.kind !== "full-detail-response") return;
    const id = event.data.id || event.data.payload?.id;
    const pending = fullplay.pending.get(id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    fullplay.pending.delete(id);
    const payload = event.data.payload || {};
    if (payload.ok) {
      const cachedMovieId = payload.summary?.movieId || payload.data?.id || payload.detail?.id || payload.movieId || "";
      if (cachedMovieId) fullplay.cache.set(String(cachedMovieId), payload);
      pending.resolve(payload);
    }
    else pending.reject(new Error(payload.error || "完整详情请求失败"));
  });

  async function maybeReplaceMovieDetail(api, params, visitorDetail) {
    if (!fullplay.enabled || api !== "/movie/detail") return visitorDetail;
    const movieId = getMovieId(params, api);
    if (!movieId) return visitorDetail;
    setMessage(`命中详情接口，正在获取完整线路：${movieId}`);
    emit("fullplay-hit", {
      movieId,
      visitorHasBuy: visitorDetail?.has_buy,
      visitorLayerType: visitorDetail?.layer_type,
      visitorPlayLink: visitorDetail?.play_link
    });
    let payload = null;
    try {
      payload = await requestFullDetail(movieId, visitorDetail);
    } catch (error) {
      recordError(error, { api, movieId, background: true });
      emit("fullplay-status", { api, movieId, error: error.message, background: true });
      return visitorDetail;
    }
    const fullDetail = payload.data || payload.detail;
    if (!fullDetail) return visitorDetail;
    const summary = payload.summary || {};
    const merged = {
      ...visitorDetail,
      ...fullDetail,
      __txzz_fullplay: {
        enabled: true,
        movieId,
        visitor: {
          has_buy: visitorDetail?.has_buy,
          layer_type: visitorDetail?.layer_type,
          money: visitorDetail?.money,
          play_link: visitorDetail?.play_link,
          backup_link: visitorDetail?.backup_link
        },
        summary
      }
    };
    recordHit({
      api,
      movieId,
      visitorHasBuy: visitorDetail?.has_buy,
      visitorLayerType: visitorDetail?.layer_type,
      visitorPlayLink: visitorDetail?.play_link,
      fullHasBuy: fullDetail?.has_buy,
      fullLayerType: fullDetail?.layer_type,
      fullPlayLink: fullDetail?.play_link,
      fullSegments: summary?.fullStat?.segments || null,
      fullDuration: summary?.fullStat?.duration || null,
      action: summary?.action || ""
    });
    setMessage(`完整线路已替换：${movieId}，分片 ${summary?.fullStat?.segments ?? "?"}`, "ok");
    emit("fullplay-success", {
      movieId,
      summary,
      fullDetail: {
        has_buy: fullDetail?.has_buy,
        layer_type: fullDetail?.layer_type,
        play_link: fullDetail?.play_link,
        backup_link: fullDetail?.backup_link
      }
    });
    if (fullDetail?.play_link) emit("media", { via: "fullplay.detail", url: fullDetail.play_link, category: classifyUrl(fullDetail.play_link) });
    if (fullDetail?.backup_link) emit("media", { via: "fullplay.backup", url: fullDetail.backup_link, category: classifyUrl(fullDetail.backup_link) });
    return merged;
  }

  function normalizeApi(api) {
    const raw = String(api || "");
    try {
      const url = new URL(raw, location.href);
      return url.pathname.replace(/^\/h5/, "");
    } catch (_) {
      return raw.replace(/^\/h5/, "");
    }
  }

  function patchRequestTarget(target, key, label) {
    if (!target || typeof target[key] !== "function" || target[key].__txzzFullplayPatched) return false;
    const original = target[key];
    const wrapped = async function txzzRequestHook(api, params, mute) {
      const normalizedApi = normalizeApi(api);
      if (normalizedApi === "/user/info") {
        const info = await original.apply(this, arguments);
        const patched = fullUserPatch(info);
        emit("full-account-display", { api: normalizedApi, via: label });
        return patched;
      }
      if (normalizedApi === "/user/vip") {
        const vip = await original.apply(this, arguments);
        const patched = fullVipPatch(vip);
        emit("full-account-display", { api: normalizedApi, via: label });
        return patched;
      }
      if (normalizedApi !== "/movie/detail") {
        return original.apply(this, arguments);
      }
      const visitorDetail = await original.apply(this, arguments);
      try {
        return await maybeReplaceMovieDetail(normalizedApi, params, visitorDetail);
      } catch (error) {
        recordError(error, { api: normalizedApi, params: safeString(params, 300) });
        setMessage(`完整线路获取失败：${error.message}`, "error");
        emit("fullplay-status", { api: normalizedApi, movieId: getMovieId(params, api), error: error.message, background: true });
        return visitorDetail;
      }
    };
    wrapped.__txzzFullplayPatched = true;
    wrapped.__txzzOriginal = original;
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: wrapped
      });
    } catch (_) {
      target[key] = wrapped;
    }
    fullplay.installedTargets.push(label);
    emit("hook", { target: label, status: "patched" });
    return true;
  }

  function patchNuxtRequests() {
    let patched = 0;
    try {
      const app = window.$nuxt;
      patched += patchRequestTarget(app, "$request", "$nuxt.$request") ? 1 : 0;
      patched += patchRequestTarget(app?.$root?.$options, "$request", "$nuxt.$root.$options.$request") ? 1 : 0;
      patched += patchRequestTarget(app?.$options, "$request", "$nuxt.$options.$request") ? 1 : 0;
      patched += patchRequestTarget(app?.context?.app, "$request", "$nuxt.context.app.$request") ? 1 : 0;
      patched += patchRequestTarget(app?.$root?.context?.app, "$request", "$nuxt.$root.context.app.$request") ? 1 : 0;
      patched += patchRequestTarget(app?.$options?.context?.app, "$request", "$nuxt.$options.context.app.$request") ? 1 : 0;
      patched += patchRequestTarget(app?.$root?.$options?.context?.app, "$request", "$nuxt.$root.$options.context.app.$request") ? 1 : 0;
    } catch (_) {}
    try {
      const vueProto = window.Vue?.prototype;
      patched += patchRequestTarget(vueProto, "$request", "Vue.prototype.$request") ? 1 : 0;
    } catch (_) {}
    return patched;
  }

  function repatchNuxtRequests(reason = "timer") {
    const patched = patchNuxtRequests();
    const navPatched = patchRouterNavigation();
    fullplay.patchRuns.push({
      time: now(),
      reason,
      patched,
      navPatched,
      targets: fullplay.installedTargets.slice(-12)
    });
    fullplay.patchRuns = fullplay.patchRuns.slice(-80);
    return patched;
  }

  const rawFetch = window.fetch;
  if (typeof rawFetch === "function") {
    window.fetch = async function txzzFetch(input, init) {
      const meta = requestMeta(input, init);
      const category = classifyUrl(meta.url);
      if (isInterestingUrl(meta.url)) emit("request", { via: "fetch", ...meta, category });
      const response = await rawFetch.apply(this, arguments);
      const responseUrl = String(response.url || meta.url || "");
      const responseCategory = classifyUrl(responseUrl);
      const contentType = response.headers?.get?.("content-type") || "";
      const shouldReadBody = isInterestingUrl(responseUrl) || /json|text|javascript|mpegurl|octet-stream/i.test(contentType);
      if (shouldReadBody) {
        response.clone().text().then((text) => {
          const bodyHead = safeString(text, 1400);
          emit("response", {
            via: "fetch",
            method: meta.method,
            url: responseUrl,
            status: response.status,
            category: responseCategory,
            contentType,
            bodyHead
          });
          inspectBody("fetch", meta.method, responseUrl, response.status, bodyHead);
        }).catch(() => {
          emit("response", {
            via: "fetch",
            method: meta.method,
            url: responseUrl,
            status: response.status,
            category: responseCategory,
            contentType
          });
        });
      } else if (isInterestingUrl(responseUrl)) {
        emit("response", {
          via: "fetch",
          method: meta.method,
          url: responseUrl,
          status: response.status,
          category: responseCategory,
          contentType
        });
      }
      return response;
    };
  }

  const rawOpen = XMLHttpRequest.prototype.open;
  const rawSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function txzzOpen(method, url) {
    this.__txzz = { method: String(method || "GET").toUpperCase(), url: String(url || "") };
    if (isInterestingUrl(url)) {
      emit("request", { via: "xhr", method: this.__txzz.method, url: this.__txzz.url, category: classifyUrl(url) });
    }
    return rawOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function txzzSend(body) {
    if (this.__txzz) this.__txzz.bodyHead = safeString(body, 500);
    this.addEventListener("loadend", () => {
      const hit = this.__txzz;
      if (!hit) return;
      let bodyHead = "";
      try {
        if (!this.responseType || this.responseType === "text" || this.responseType === "json") {
          bodyHead = safeString(this.responseText || this.response || "", 1400);
        }
      } catch (_) {}
      const interesting = isInterestingUrl(hit.url) || classifyBody(bodyHead).length;
      if (!interesting) return;
      const category = classifyUrl(hit.url);
      emit("response", {
        via: "xhr",
        method: hit.method,
        url: hit.url,
        status: this.status,
        category,
        bodyHead
      });
      inspectBody("xhr", hit.method, hit.url, this.status, bodyHead);
    });
    return rawSend.apply(this, arguments);
  };

  function hookSrc(proto, tag) {
    const desc = Object.getOwnPropertyDescriptor(proto, "src");
    if (!desc || !desc.set || !desc.get) return;
    Object.defineProperty(proto, "src", {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(value) {
        if (isInterestingUrl(value)) emit("media", { via: `${tag}.src`, url: String(value), category: classifyUrl(value) });
        return desc.set.call(this, value);
      }
    });
  }

  try {
    hookSrc(HTMLMediaElement.prototype, "media");
    hookSrc(HTMLSourceElement.prototype, "source");
  } catch (_) {}

  const rawSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function txzzSetAttribute(name, value) {
    if (String(name).toLowerCase() === "src" && isInterestingUrl(value)) {
      emit("media", { via: `${this.tagName.toLowerCase()}.setAttribute`, url: String(value), category: classifyUrl(value) });
    }
    return rawSetAttribute.apply(this, arguments);
  };

  const hlsPatchTimer = window.setInterval(() => {
    try {
      const Hls = window.Hls;
      if (!Hls || !Hls.prototype || Hls.prototype.__txzzPatched) return;
      const rawLoadSource = Hls.prototype.loadSource;
      if (typeof rawLoadSource !== "function") return;
      Hls.prototype.loadSource = function txzzLoadSource(url) {
        emit("media", { via: "Hls.loadSource", url: String(url || ""), category: classifyUrl(url) });
        return rawLoadSource.apply(this, arguments);
      };
      Hls.prototype.__txzzPatched = true;
      emit("hook", { target: "Hls.loadSource", status: "patched" });
    } catch (_) {}
  }, 700);

  [250, 800, 1600, 3000, 6000].forEach((delay) => {
    window.setTimeout(() => repatchNuxtRequests(`timer:${delay}`), delay);
  });

  window.setTimeout(() => window.clearInterval(hlsPatchTimer), 20000);
  try {
    window.addEventListener("load", () => repatchNuxtRequests("load"));
    document.addEventListener("readystatechange", () => repatchNuxtRequests(`ready:${document.readyState}`));
    if (typeof window.onNuxtReady === "function") window.onNuxtReady(() => repatchNuxtRequests("onNuxtReady"));
  } catch (_) {}

  window.__txzzFullPlay = {
    state: fullplay,
    enable() {
      fullplay.enabled = true;
      setMessage("完整播放 Hook 已开启", "ok");
    },
    disable() {
      fullplay.enabled = false;
      setMessage("完整播放 Hook 已关闭");
    },
    hits() {
      return fullplay.hits.slice();
    },
    errors() {
      return fullplay.errors.slice();
    },
    repatch(reason = "manual") {
      return repatchNuxtRequests(reason);
    },
    patches() {
      return fullplay.patchRuns.slice();
    },
    async requestDetail(movieId) {
      const request = window.$nuxt?.$root?.$options?.$request || window.$nuxt?.$request || window.$nuxt?.$options?.$request || window.Vue?.prototype?.$request;
      if (typeof request !== "function") {
        const payload = await requestFullDetail(movieId, null);
        const fullDetail = payload.data || payload.detail;
        if (!fullDetail) throw new Error("完整详情响应为空");
        return {
          ...fullDetail,
          __txzz_fullplay: {
            enabled: true,
            movieId: String(movieId),
            visitor: null,
            summary: payload.summary || {}
          }
        };
      }
      const detail = await request.call(window.$nuxt || window, "/movie/detail", { id: String(movieId) });
      if (detail?.__txzz_fullplay) return detail;
      return await maybeReplaceMovieDetail("/movie/detail", { id: String(movieId) }, detail);
    }
  };

  installSameDetailNavigationGuard();
  repatchNuxtRequests("install");
  emit("hook", { target: "fetch/xhr/media/hls/fullplay", status: "installed" });
})();
