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
    pendingByContext: new Map(),
    cache: new Map(),
    latestByContext: new Map(),
    pageEpoch: 0,
    pageKey: "",
    pageMovieId: "",
    pageTransitioning: false,
    activeMovieId: "",
    activeHintAt: 0,
    activePointerAt: 0,
    activeVlogRequestKey: "",
    activeVlogRetryAt: 0,
    nativeVlogAppliedKey: "",
    nativeVlogRestoreTimer: 0,
    nativeVlogAbortController: null,
    contextTrackerInstalled: false,
    contextPollTimer: 0,
    contextInitialTimer: 0,
    vlogHudTimer: 0,
    lastMessage: "糖心志者播放资源监听已安装"
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

  function formatHudDuration(value) {
    const seconds = Number(value || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return "时长待校准";
    const minutes = Math.floor(seconds / 60);
    const remain = Math.floor(seconds % 60);
    return `${minutes}分${String(remain).padStart(2, "0")}秒`;
  }

  /** 网站 Vlog 页的轻量电影票 HUD，只展示当前稳定卡片，不读取或暴露账号凭据。 */
  function renderVlogTicket(info = {}) {
    if (!/^\/vlog(?:\/|$)/i.test(String(location.pathname || ""))) {
      document.getElementById("txzz-vlog-ticket-host")?.remove();
      return;
    }
    let host = document.getElementById("txzz-vlog-ticket-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "txzz-vlog-ticket-host";
      host.style.cssText = "position:fixed;left:max(10px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));z-index:2147483645;pointer-events:auto;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif";
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
        .ticket{min-width:190px;max-width:min(290px,calc(100vw - 20px));padding:10px 12px;border:1px solid rgba(255,255,255,.82);border-radius:18px;background:linear-gradient(135deg,rgba(255,240,248,.96),rgba(238,232,255,.96));box-shadow:0 12px 34px rgba(76,45,110,.22);color:#55415f;transition:.22s ease;backdrop-filter:blur(14px)}
        .ticket[data-compact='1']{min-width:0;max-width:175px;padding:7px 10px;opacity:.72;transform:scale(.94);transform-origin:left top}.ticket[data-compact='1'] .detail,.ticket[data-compact='1'] button{display:none}
        .top{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800}.dot{width:8px;height:8px;border-radius:99px;background:#a77af3;box-shadow:0 0 0 4px rgba(167,122,243,.14)}
        .id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{margin-left:auto;color:#8b5cd6}.detail{margin-top:6px;font-size:10px;line-height:1.5;color:#796b80;word-break:break-all}
        button{margin-top:7px;width:100%;min-height:32px;border:0;border-radius:11px;background:#8e66dc;color:white;font-size:10px;font-weight:800;cursor:pointer}button:focus-visible{outline:2px solid #fff;box-shadow:0 0 0 4px #8e66dc}
      </style><section class="ticket" role="status" aria-live="polite"><div class="top"><span class="dot"></span><span class="id"></span><span class="status"></span></div><div class="detail"></div><button type="button">重新同步当前卡片</button></section>`;
      root.querySelector("button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        renderVlogTicket({ movieId: fullplay.pageMovieId, status: "重新检票", detail: "正在核对当前活动卡片与完整线路" });
        ensureActiveVlogDetail("manual-ticket")?.catch((error) => {
          renderVlogTicket({ movieId: fullplay.pageMovieId, status: "同步失败", detail: error?.message || String(error) });
        });
      });
      root.querySelector(".ticket")?.addEventListener("mouseenter", (event) => { event.currentTarget.dataset.compact = "0"; });
      document.documentElement.appendChild(host);
    }
    const root = host.shadowRoot;
    const ticket = root?.querySelector(".ticket");
    const movieId = String(info.movieId || fullplay.pageMovieId || "");
    if (root?.querySelector(".id")) root.querySelector(".id").textContent = movieId ? `糖果检票 · ${movieId}` : "糖果检票 · 等待卡片";
    if (root?.querySelector(".status")) root.querySelector(".status").textContent = String(info.status || "核对中");
    const duration = info.duration ? ` · ${formatHudDuration(info.duration)}` : "";
    if (root?.querySelector(".detail")) root.querySelector(".detail").textContent = `${String(info.detail || "正在确认当前活动视频")}${duration}`;
    if (ticket) ticket.dataset.compact = "0";
    if (fullplay.vlogHudTimer) window.clearTimeout(fullplay.vlogHudTimer);
    fullplay.vlogHudTimer = window.setTimeout(() => { if (ticket) ticket.dataset.compact = "1"; }, 3_200);
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

  // Bind every async detail request to the current SPA page generation. The feed
  // can prefetch several cards at once, so movieId alone is not an active-item key.
  function currentPageKey(value = location.href) {
    try {
      const url = new URL(String(value || location.href), location.href);
      return `${url.origin}${url.pathname}${url.search}${url.hash}`;
    } catch (_) {
      return String(value || location.href);
    }
  }

  function movieIdFromUrl(value = location.href) {
    try {
      const url = new URL(String(value || location.href), location.href);
      const pathMatch = url.pathname.match(/^\/movie\/detail\/(\d+)\/?$/);
      if (pathMatch) return pathMatch[1];
      for (const key of ["id", "movie_id", "movieId", "vid", "videoId"]) {
        const candidate = String(url.searchParams.get(key) || "").trim();
        if (/^\d+$/.test(candidate)) return candidate;
      }
    } catch (_) {}
    return "";
  }

  function movieIdFromValue(value) {
    const candidate = String(value ?? "").trim();
    return /^\d+$/.test(candidate) ? candidate : "";
  }

  function movieIdFromVueValue(value) {
    if (!value || typeof value !== "object") return movieIdFromValue(value);
    for (const key of ["id", "movieId", "movie_id", "videoId", "vid"]) {
      const id = movieIdFromValue(value[key]);
      if (id) return id;
    }
    return "";
  }

  /**
   * Vlog 是一个固定 /vlog/ 路由下的 Swiper，不会把当前影片编号写进 URL。
   * 生产站点的 Vue 组件仍会把当前项放在 vlog-list.playerInfo、活动 slide 的
   * short-video-detail.r 和 player.currentMovieId 中；只读这些“活动”节点，
   * 不把旁边预加载 slide 的数据当成当前视频。
   */
  function activeVlogMovieId() {
    if (!/^\/vlog(?:\/|$)/i.test(String(location.pathname || ""))) return "";
    try {
      const listVm = document.querySelector(".vlog-list")?.__vue__;
      const activeSlide = document.querySelector(".swiper-slide-active")
        || document.querySelector(".swiper-slide[aria-hidden='false']");
      const activeDetailVm = activeSlide?.querySelector(".short-video-detail")?.__vue__;
      const activeDetailId = movieIdFromVueValue(activeDetailVm?.r || activeDetailVm?.$options?.propsData?.r);
      const activePlayerId = movieIdFromValue(activeSlide?.querySelector(".player")?.__vue__?.currentMovieId);
      let markedActiveId = "";
      for (const element of document.querySelectorAll(".short-video-detail")) {
        const vm = element.__vue__;
        if (vm?.$options?.propsData?.isActive === true) {
          const id = movieIdFromVueValue(vm.r || vm.$options?.propsData?.r);
          if (id) { markedActiveId = id; break; }
        }
      }
      const listId = movieIdFromVueValue(listVm?.playerInfo || listVm?.activeItem || listVm?.currentItem);
      return globalThis.TxzzPageContextCore?.resolveVlogMovieId({
        listId,
        activeSlideId: activeDetailId,
        activeDetailId,
        activeDetailEnabled: activeDetailVm?.$options?.propsData?.isActive !== false,
        activePlayerId,
        markedActiveId
      })?.movieId || activeDetailId || activePlayerId || markedActiveId || listId || "";
    } catch (_) {
      return "";
    }
  }

  function routeMovieId() {
    const fromLocation = movieIdFromUrl(location.href);
    if (fromLocation) return fromLocation;
    const fromVlog = activeVlogMovieId();
    if (fromVlog) return fromVlog;
    try {
      const route = window.$nuxt?.$route || window.$nuxt?.$router?.currentRoute;
      const candidate = getMovieId(route?.params || route?.query || route, route?.fullPath || "");
      if (candidate) return candidate;
    } catch (_) {}
    return "";
  }

  function rejectStalePending(reason = "page context changed") {
    fullplay.pending.forEach((item, id) => {
      if (item.pageKey === fullplay.pageKey && item.pageEpoch === fullplay.pageEpoch) return;
      fullplay.pending.delete(id);
      if (item.contextKey && fullplay.pendingByContext.get(item.contextKey) === item.promise) {
        fullplay.pendingByContext.delete(item.contextKey);
      }
      try {
        window.clearTimeout(item.timer);
        const error = new Error(reason);
        error.code = "STALE_PLAYBACK_REQUEST";
        item.reject(error);
      } catch (_) {}
    });
  }

  function updatePageContext(reason = "route-check") {
    const nextKey = currentPageKey(location.href);
    const detectedMovieId = routeMovieId();
    const isVlog = /^\/vlog(?:\/|$)/i.test(String(location.pathname || ""));
    const reconciled = globalThis.TxzzPageContextCore?.reconcileContext(
      { pageKey: fullplay.pageKey, pageEpoch: fullplay.pageEpoch, movieId: fullplay.pageMovieId },
      { pageKey: nextKey, movieId: detectedMovieId, isVlog }
    ) || {
      pageKey: nextKey,
      pageEpoch: fullplay.pageEpoch,
      movieId: detectedMovieId,
      transitioning: false,
      routeChanged: Boolean(fullplay.pageKey && fullplay.pageKey !== nextKey),
      movieChanged: false,
      changed: Boolean(fullplay.pageKey && fullplay.pageKey !== nextKey)
    };
    const changed = Boolean(reconciled.changed);
    if (changed) {
      if (fullplay.nativeVlogRestoreTimer) window.clearTimeout(fullplay.nativeVlogRestoreTimer);
      fullplay.nativeVlogRestoreTimer = 0;
      fullplay.nativeVlogAbortController?.abort?.();
      fullplay.nativeVlogAbortController = null;
      fullplay.activeMovieId = "";
      fullplay.activeHintAt = 0;
      fullplay.activePointerAt = 0;
      fullplay.activeVlogRequestKey = "";
      fullplay.activeVlogRetryAt = 0;
      fullplay.nativeVlogAppliedKey = "";
    }
    fullplay.pageKey = reconciled.pageKey;
    fullplay.pageEpoch = reconciled.pageEpoch;
    fullplay.pageMovieId = reconciled.movieId;
    fullplay.pageTransitioning = Boolean(reconciled.transitioning);
    if (changed) {
      rejectStalePending(`page context changed: ${reason}`);
      emit("fullplay-context", {
        pageKey: fullplay.pageKey,
        pageEpoch: fullplay.pageEpoch,
        movieId: fullplay.pageMovieId,
        reason
      });
    }
    if (isVlog) renderVlogTicket({
      movieId: fullplay.pageMovieId,
      status: fullplay.pageTransitioning ? "换片中" : "已锁定",
      detail: fullplay.pageTransitioning ? "等待活动卡片稳定" : `代次 ${fullplay.pageEpoch}`
    });
    return {
      pageKey: fullplay.pageKey,
      pageEpoch: fullplay.pageEpoch,
      movieId: fullplay.pageMovieId,
      transitioning: fullplay.pageTransitioning
    };
  }

  function extractElementMovieId(element) {
    let current = element;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      try {
        const href = current.getAttribute?.("href") || current.closest?.("a[href]")?.getAttribute?.("href") || "";
        if (href) {
          const fromHref = movieIdFromUrl(href);
          if (fromHref) return fromHref;
        }
      } catch (_) {}
      for (const key of ["movieId", "movie_id", "videoId", "vid", "id"]) {
        const candidate = String(current.dataset?.[key] || current.getAttribute?.(`data-${key}`) || "").trim();
        if (/^\d+$/.test(candidate)) return candidate;
      }
      // The target is Vue 2; card data is exposed as propsData.data.id.
      try {
        const vm = current.__vue__;
        const candidates = [
          vm?.data?.id,
          vm?.$options?.propsData?.data?.id,
          vm?.$vnode?.componentOptions?.propsData?.data?.id,
          vm?.$vnode?.componentOptions?.propsData?.id
        ];
        const found = candidates.map((item) => String(item || "").trim()).find((item) => /^\d+$/.test(item));
        if (found) return found;
      } catch (_) {}
    }
    return "";
  }

  function markActiveMovie(movieId, via = "interaction") {
    const id = String(movieId || "").trim();
    if (!/^\d+$/.test(id)) return;
    fullplay.activeMovieId = id;
    fullplay.activeHintAt = Date.now();
    emit("fullplay-active", {
      movieId: id,
      pageKey: fullplay.pageKey,
      pageEpoch: fullplay.pageEpoch,
      via
    });
  }

  function markActiveElement(element, via = "interaction") {
    const movieId = extractElementMovieId(element);
    if (movieId) {
      markActiveMovie(movieId, via);
      return;
    }
    // 生产站点的 Vue 卡片没有 href/data-id，构建产物也未必暴露 __vue__。
    // 仍记录一次“用户明确点了视频卡片”的短时提示；同页面中下一次新发起的
    // detail 请求可认领它，已在提示前发起的预加载请求不会被追认。
    if (element?.closest?.(".video-item, [class*='video-item'], [data-video-card]")) {
      const interactionAt = Date.now();
      if (via === "click" && fullplay.activeMovieId && interactionAt - fullplay.activePointerAt <= 1_500) {
        // pointerdown 后站点可能立刻发起当前详情请求并完成认领；随后同一手势的
        // click 捕获不能把已认领 ID 清空，否则 click 阶段的预加载会冒充当前项。
        return;
      }
      fullplay.activeMovieId = "";
      fullplay.activeHintAt = interactionAt;
      if (via === "pointerdown") fullplay.activePointerAt = interactionAt;
      emit("fullplay-active-hint", {
        movieId: "",
        pageKey: fullplay.pageKey,
        pageEpoch: fullplay.pageEpoch,
        via
      });
    }
  }

  function buildRequestContext(movieId) {
    const current = updatePageContext("request");
    const id = String(movieId || "").trim();
    const routeId = current.movieId;
    const hintAge = Date.now() - fullplay.activeHintAt;
    if (!routeId && !fullplay.activeMovieId && id && hintAge >= 0 && hintAge <= 2_500) {
      fullplay.activeMovieId = id;
      emit("fullplay-active", {
        movieId: id,
        pageKey: fullplay.pageKey,
        pageEpoch: fullplay.pageEpoch,
        via: "interaction-request-claim"
      });
    }
    const hintFresh = fullplay.activeMovieId && Date.now() - fullplay.activeHintAt <= 15_000;
    const active = !current.transitioning && (routeId ? routeId === id : Boolean(hintFresh && fullplay.activeMovieId === id));
    return {
      pageKey: current.pageKey,
      pageEpoch: current.pageEpoch,
      pageMovieId: routeId,
      movieId: id,
      contextKey: `${current.pageKey}#${current.pageEpoch}:${id || "feed"}`,
      active
    };
  }

  function installPageContextTracker() {
    if (fullplay.contextTrackerInstalled) return;
    fullplay.contextTrackerInstalled = true;
    updatePageContext("install");
    const routeChanged = () => window.setTimeout(() => updatePageContext("history"), 0);
    ["popstate", "hashchange"].forEach((name) => window.addEventListener(name, routeChanged, true));
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      if (typeof original !== "function" || original.__txzzContextPatched) continue;
      const wrapped = function txzzContextHistory() {
        const result = original.apply(this, arguments);
        routeChanged();
        return result;
      };
      wrapped.__txzzContextPatched = true;
      wrapped.__txzzContextOriginal = original;
      try {
        Object.defineProperty(history, name, { configurable: true, writable: true, value: wrapped });
      } catch (_) {
        history[name] = wrapped;
      }
    }
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target) markActiveElement(target, "click");
    }, true);
    document.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target) markActiveElement(target, "pointerdown");
    }, true);
    const pollContext = () => {
      updatePageContext("poll");
      // Vlog 首屏详情通常早于 page_hook 注入完成，主动为当前活动 slide
      // 补发一次完整详情请求；同一 context 的请求由 pendingByContext 去重。
      ensureActiveVlogDetail("poll")?.catch(() => {});
    };
    fullplay.contextInitialTimer = window.setTimeout(pollContext, 450);
    fullplay.contextPollTimer = window.setInterval(pollContext, 700);
    window.addEventListener("pagehide", () => {
      if (fullplay.contextInitialTimer) window.clearTimeout(fullplay.contextInitialTimer);
      if (fullplay.contextPollTimer) window.clearInterval(fullplay.contextPollTimer);
      if (fullplay.vlogHudTimer) window.clearTimeout(fullplay.vlogHudTimer);
    }, { once: true });
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
      if (params.vid) return String(params.vid);
      if (params.videoId) return String(params.videoId);
    }
    if (typeof params === "string") {
      try {
        const parsed = JSON.parse(params);
        return getMovieId(parsed, api);
      } catch (_) {
        const query = new URLSearchParams(params.includes("=") ? params : "");
        const id = query.get("id") || query.get("movie_id") || query.get("movieId") || query.get("vid") || query.get("videoId");
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

  function requestFullDetail(movieId, visitorDetail, context = buildRequestContext(movieId)) {
    if (!context.active) {
      const error = new Error("inactive prefetch request");
      error.code = "INACTIVE_PREFETCH";
      return Promise.reject(error);
    }
    const cached = fullplay.cache.get(String(movieId));
    if (cached
      && cached.__txzzContext?.movieId === String(movieId)
      && cached.__txzzContext?.pageKey === context.pageKey
      && cached.__txzzContext?.pageEpoch === context.pageEpoch) return Promise.resolve(cached);
    const pendingForContext = fullplay.pendingByContext.get(context.contextKey);
    if (pendingForContext) return pendingForContext;
    const requestId = `txzz_full_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    fullplay.latestByContext.set(context.contextKey, requestId);
    let promise;
    promise = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        fullplay.pending.delete(requestId);
        if (fullplay.pendingByContext.get(context.contextKey) === promise) fullplay.pendingByContext.delete(context.contextKey);
        reject(new Error(`播放详情请求超时：${movieId}`));
      }, 15000);
      fullplay.pending.set(requestId, { resolve, reject, timer, promise, ...context });
      emit("full-detail-request", {
        id: requestId,
        movieId,
        visitorDetail,
        href: location.href,
        pageKey: context.pageKey,
        pageEpoch: context.pageEpoch,
        contextKey: context.contextKey,
        active: context.active
      });
    });
    // Promise executor 会同步执行，创建 pending 记录时 promise 尚未完成赋值；
    // 在此回填引用，页面换代时才能准确清理 pendingByContext。
    const pending = fullplay.pending.get(requestId);
    if (pending) pending.promise = promise;
    fullplay.pendingByContext.set(context.contextKey, promise);
    promise.then(
      () => { if (fullplay.pendingByContext.get(context.contextKey) === promise) fullplay.pendingByContext.delete(context.contextKey); },
      () => { if (fullplay.pendingByContext.get(context.contextKey) === promise) fullplay.pendingByContext.delete(context.contextKey); }
    );
    return promise;
  }

  function activeVlogDetailSnapshot(movieId) {
    if (!/^\/vlog(?:\/|$)/i.test(String(location.pathname || ""))) return null;
    try {
      const listVm = document.querySelector(".vlog-list")?.__vue__;
      const activeSlide = document.querySelector(".swiper-slide-active")
        || document.querySelector(".swiper-slide[aria-hidden='false']");
      const detailVm = activeSlide?.querySelector(".short-video-detail")?.__vue__;
      const candidates = [
        listVm?.playerInfo,
        listVm?.activeItem,
        listVm?.currentItem,
        detailVm?.r,
        detailVm?.$options?.propsData?.r
      ].filter((item) => item && typeof item === "object");
      // Swiper 切换期间活动 class 与 Vue playerInfo 的更新时间可能相差一帧。
      // 必须优先选出与已确认 movieId 一致的快照，避免把相邻预加载项交给取源服务。
      const raw = candidates.find((item) => movieIdFromVueValue(item) === String(movieId))
        || candidates.find((item) => !movieIdFromVueValue(item));
      if (!raw || typeof raw !== "object") return null;
      const snapshot = {};
      for (const key of [
        "id", "movieId", "movie_id", "videoId", "vid", "title", "name", "duration",
        "duration_time", "play_link", "backup_link", "has_buy", "layer_type", "money", "is_buy"
      ]) {
        if (raw[key] != null) snapshot[key] = raw[key];
      }
      if (Array.isArray(raw.lines)) {
        snapshot.lines = raw.lines.slice(0, 12).map((line) => {
          if (!line || typeof line !== "object") return line;
          return Object.fromEntries(["id", "name", "label", "link", "url", "play_link", "backup_link"].filter((key) => line[key] != null).map((key) => [key, line[key]]));
        });
      }
      return snapshot;
    } catch (_) {
      return null;
    }
  }

  function firstPlayableValue(...values) {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text && !/^(?:null|undefined|false|none|nil|0|n|no|暂无|无|未购买|未解锁)$/i.test(text)) return text;
    }
    return "";
  }

  function activeVlogNodes(movieId) {
    if (!/^\/vlog\/?$/i.test(String(location.pathname || ""))) return null;
    const id = String(movieId || "").trim();
    if (!id) return null;
    try {
      const listVm = document.querySelector(".vlog-list")?.__vue__;
      if (!listVm) return null;
      const swiper = listVm.swiper;
      const activeIndex = Number.isInteger(Number(swiper?.activeIndex)) ? Number(swiper.activeIndex) : Number(listVm.activeIndex || 0);
      const realIndex = Number.isInteger(Number(swiper?.realIndex)) ? Number(swiper.realIndex) : Number(listVm.realIndex ?? activeIndex);
      const indexedSlide = swiper?.slides?.[realIndex];
      const activeSlide = indexedSlide instanceof Element
        ? indexedSlide
        : document.querySelector(".swiper-slide-active") || document.querySelector(".swiper-slide[aria-hidden='false']");
      const detailEntries = Array.from(document.querySelectorAll(".short-video-detail")).map((element) => ({
        element,
        vm: element.__vue__
      }));
      const matchingDetail = detailEntries.find((entry) => movieIdFromVueValue(entry.vm?.r || entry.vm?.$options?.propsData?.r) === id);
      const activeDetail = detailEntries.find((entry) => entry.vm?.$options?.propsData?.isActive === true) || matchingDetail;
      const detailVm = matchingDetail?.vm || activeDetail?.vm || activeSlide?.querySelector(".short-video-detail")?.__vue__ || null;
      const poolPlayers = Array.isArray(listVm.$refs?.poolPlayers) ? listVm.$refs.poolPlayers : [];
      const playerVm = poolPlayers.find((player) => String(player?.currentMovieId || player?.movieId || "") === id)
        || poolPlayers[Number(listVm.activePoolIndex)]
        || detailVm?.player
        || null;
      const renderSlides = Array.isArray(listVm.renderData?.slides) ? listVm.renderData.slides : [];
      const virtualSlides = Array.isArray(swiper?.virtual?.slides) ? swiper.virtual.slides : [];
      const candidates = [renderSlides[realIndex], virtualSlides[activeIndex], detailVm?.r, listVm.playerInfo];
      const currentData = candidates.find((item) => movieIdFromVueValue(item) === id) || null;
      return { listVm, swiper, activeIndex, realIndex, activeSlide, detailVm, playerVm, currentData };
    } catch (_) {
      return null;
    }
  }

  /**
   * 主动完整检票错过网站首个 /movie/detail 请求时，不能只更新插件自己的会话；
   * 还要把同一份完整详情写回当前 Vlog 的 Vue 数据，并让复用中的 ArtPlayer/Hls
   * 重新载入完整主线。这样网站原生播放器的试看 Blob 才会切到完整时长。
   */
  function applyNativeVlogDetail(movieId, payload, context, reason = "active-vlog") {
    if (!payload || !context || !/^\/vlog\/?$/i.test(String(location.pathname || ""))) return false;
    const id = String(movieId || "").trim();
    const fullDetail = payload.data || payload.detail || {};
    const summary = payload.summary || {};
    const session = payload.session || {};
    const recommendedSource = Array.isArray(session.sources)
      ? session.sources.find((source) => source?.id === session.decision?.recommendedSourceId && firstPlayableValue(source?.url))
        || session.sources.find((source) => firstPlayableValue(source?.url))
      : null;
    const alternateSource = Array.isArray(session.sources)
      ? session.sources.find((source) => source?.id !== recommendedSource?.id && firstPlayableValue(source?.url))
      : null;
    const nodes = activeVlogNodes(id);
    if (!nodes || fullplay.pageTransitioning || activeVlogMovieId() !== id) return false;
    const current = nodes.currentData || {};
    if (String(current.id || id) !== id) return false;
    const playLink = firstPlayableValue(
      recommendedSource?.url,
      summary.recommendedPlayLink,
      summary.playLink,
      fullDetail.play_link,
      fullDetail.playLink,
      fullDetail.play_url,
      fullDetail.playUrl
    );
    const backupLink = firstPlayableValue(
      alternateSource?.url,
      summary.backupLink,
      fullDetail.backup_link,
      fullDetail.backupLink,
      fullDetail.backup_url,
      fullDetail.backupUrl
    );
    if (!playLink && !backupLink) return false;
    const effectivePlayLink = playLink || backupLink;
    const sourceKey = `${context.contextKey}:${normalizeUrl(effectivePlayLink)}`;
    if (fullplay.nativeVlogAppliedKey === sourceKey) return true;
    const merged = {
      ...current,
      ...fullDetail,
      id,
      play_link: effectivePlayLink,
      backup_link: backupLink || current.backup_link || ""
    };
    const probedDuration = Number(
      recommendedSource?.media?.durationSeconds
      || recommendedSource?.health?.duration
      || summary.recommendedStat?.duration
      || summary.fullStat?.duration
      || 0
    );
    if (Number.isFinite(probedDuration) && probedDuration > 0) {
      // 站点字段统一写秒数；字符串时长或短片摘要不得覆盖完整清单探测值。
      merged.duration_time = probedDuration;
      merged.duration = probedDuration;
    }
    const sourceLines = Array.isArray(fullDetail.lines) && fullDetail.lines.length
      ? fullDetail.lines
        .filter((line) => line && typeof line === "object" && firstPlayableValue(line.link || line.url || line.play_link))
        .map((line) => ({ ...line, link: firstPlayableValue(line.link || line.url || line.play_link) }))
      : [];
    const hasRecommendedLine = sourceLines.some((line) => normalizeUrl(firstPlayableValue(line.link || line.url || line.play_link)) === normalizeUrl(effectivePlayLink));
    merged.lines = hasRecommendedLine
      ? sourceLines
      : [{ id: "recommended", name: "完整推荐线路", link: effectivePlayLink }, ...sourceLines];
    if (backupLink && !merged.lines.some((line) => normalizeUrl(firstPlayableValue(line.link || line.url || line.play_link)) === normalizeUrl(backupLink))) {
      merged.lines.push({ id: "backup", name: "完整备用线", link: backupLink });
    }
    // 完整线路已经由账号/Worker 验证通过；同步放行站点自己的 VIP/试看遮罩。
    merged.has_buy = merged.has_buy || "y";
    merged.is_buy = merged.is_buy || "y";
    merged.buyed = merged.buyed || "y";
    if (merged.layer_type === "money") merged.layer_type = "normal";
    merged.play_tips = "";

    const setReactive = (owner, target, key, value) => {
      try {
        if (typeof owner?.$set === "function") owner.$set(target, key, value);
        else target[key] = value;
      } catch (_) {
        try { target[key] = value; } catch (_) {}
      }
    };
    const list = nodes.listVm;
    if (Array.isArray(list.renderData?.slides) && nodes.realIndex >= 0) setReactive(list, list.renderData.slides, nodes.realIndex, merged);
    if (Array.isArray(nodes.swiper?.virtual?.slides) && nodes.activeIndex >= 0) setReactive(list, nodes.swiper.virtual.slides, nodes.activeIndex, merged);
    if (String(list.playerInfo?.id || "") === id) setReactive(list, list, "playerInfo", merged);
    try { list.initLines?.(merged); } catch (_) {}
    try { nodes.detailVm?.initLines?.(merged); } catch (_) {}

    const player = nodes.playerVm;
    const video = player?.player?.video;
    const previousTime = Number(video?.currentTime);
    const wasPlaying = Boolean(video && !video.paused && !video.ended);
    const currentSource = normalizeUrl(player?.currentSrcValue || player?.player?.url || video?.currentSrc || video?.src || "");
    const nextSource = normalizeUrl(effectivePlayLink);
    const sameSource = currentSource && nextSource && currentSource === nextSource;
    const restorePlayback = () => {
      // 线路切换期间用户可能已经刷到下一条；旧视频的 loadedmetadata/计时回调
      // 不得把进度或暂停状态写回新活动卡片。
      if (fullplay.pageKey !== context.pageKey
        || fullplay.pageEpoch !== context.pageEpoch
        || fullplay.pageMovieId !== id
        || activeVlogMovieId() !== id
        || String(player?.currentMovieId || "") !== id) return;
      if (!video) return;
      if (Number.isFinite(previousTime) && previousTime > 0 && Number.isFinite(video.duration) && video.duration > previousTime) {
        try { video.currentTime = previousTime; } catch (_) {}
      }
      if (!wasPlaying) {
        try { video.pause(); } catch (_) {}
      }
    };
    let applied = sameSource;
    if (player && typeof player.changeSources === "function" && !sameSource) {
      try {
        if (fullplay.nativeVlogRestoreTimer) window.clearTimeout(fullplay.nativeVlogRestoreTimer);
        fullplay.nativeVlogAbortController?.abort?.();
        fullplay.nativeVlogAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (video?.addEventListener) {
          const options = fullplay.nativeVlogAbortController
            ? { once: true, signal: fullplay.nativeVlogAbortController.signal }
            : { once: true };
          video.addEventListener("loadedmetadata", restorePlayback, options);
        }
        player.changeSources(merged, { autoplay: wasPlaying });
        fullplay.nativeVlogRestoreTimer = window.setTimeout(() => {
          restorePlayback();
          fullplay.nativeVlogRestoreTimer = 0;
          fullplay.nativeVlogAbortController?.abort?.();
          fullplay.nativeVlogAbortController = null;
        }, 1_500);
        applied = true;
      } catch (error) {
        recordError(error, { movieId: id, nativeVlog: true, reason });
      }
    } else if (!player && typeof list.insertPlayer === "function" && nodes.activeSlide) {
      try {
        list.insertPlayer(merged, nodes.activeSlide);
        applied = true;
      } catch (error) {
        recordError(error, { movieId: id, nativeVlog: true, reason });
      }
    }
    if (!applied) return false;
    fullplay.nativeVlogAppliedKey = sourceKey;
    renderVlogTicket({
      movieId: id,
      status: "完整线路",
      detail: `${recommendedSource?.label || "推荐线路"} · ${reason}`,
      duration: probedDuration
    });
    emit("fullplay-native-vlog", {
      movieId: id,
      pageKey: context.pageKey,
      pageEpoch: context.pageEpoch,
      contextKey: context.contextKey,
      source: effectivePlayLink,
      backup: backupLink,
      reason,
      duration: probedDuration || merged.duration_time || merged.duration || ""
    });
    setMessage(`网站 Vlog 播放器已切换完整线路：${id}`, "ok");
    return true;
  }

  function ensureActiveVlogDetail(reason = "active-vlog") {
    if (!/^\/vlog\/?$/i.test(String(location.pathname || ""))) return null;
    const movieId = activeVlogMovieId();
    if (!movieId) return null;
    const context = buildRequestContext(movieId);
    if (!context.active) return null;
    const key = context.contextKey;
    if (fullplay.activeVlogRequestKey === key && fullplay.pendingByContext.has(key)) return fullplay.pendingByContext.get(key);
    const cached = fullplay.cache.get(movieId);
    if (cached?.__txzzContext?.contextKey === key) {
      fullplay.activeVlogRequestKey = key;
      return Promise.resolve(cached);
    }
    if (fullplay.activeVlogRequestKey === key && Date.now() < fullplay.activeVlogRetryAt) return null;
    fullplay.activeVlogRequestKey = key;
    const promise = requestFullDetail(movieId, activeVlogDetailSnapshot(movieId), context);
    promise.then(
      (payload) => {
        if (!fullplay.pageTransitioning && fullplay.pageKey === context.pageKey && fullplay.pageEpoch === context.pageEpoch && fullplay.pageMovieId === movieId) {
          try { applyNativeVlogDetail(movieId, payload, context, reason); } catch (error) { recordError(error, { movieId, nativeVlog: true }); }
          setMessage(`Vlog 当前视频已完成完整线路检票：${movieId}`, "ok");
          emit("fullplay-status", { message: `Vlog 当前视频 ${movieId} 已完成完整线路检票`, movieId, reason, background: true });
        }
      },
      (error) => {
        if (!fullplay.pageTransitioning && fullplay.pageKey === context.pageKey && fullplay.pageEpoch === context.pageEpoch && fullplay.pageMovieId === movieId) {
          fullplay.activeVlogRetryAt = Date.now() + 5_000;
          // 保留失败 context 键，确保 700ms 轮询尊重 5 秒退避；到期后同一键可再次发起。
          fullplay.activeVlogRequestKey = key;
          emit("fullplay-status", { message: `Vlog 当前视频 ${movieId} 完整线路获取失败：${error?.message || String(error)}`, movieId, level: "error", background: true });
        }
      }
    );
    return promise;
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
      fullplay.pendingByContext.clear();
      fullplay.cache.clear();
      fullplay.hits = [];
      fullplay.errors = [];
      fullplay.patchRuns = [];
      setMessage("插件数据缓存已清除，请刷新页面后继续使用", "ok");
      emit("fullplay-status", { message: "页面监听运行缓存已清除", level: "ok" });
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
      const latest = fullplay.latestByContext.get(pending.contextKey);
      const contextStillCurrent = pending.pageKey === fullplay.pageKey
        && pending.pageEpoch === fullplay.pageEpoch
        && !fullplay.pageTransitioning
        && String(pending.movieId) === String(fullplay.pageMovieId)
        && latest === id;
      if (!contextStillCurrent || String(cachedMovieId || pending.movieId) !== String(pending.movieId)) {
        const stale = new Error("stale playback response");
        stale.code = "STALE_PLAYBACK_REQUEST";
        pending.reject(stale);
        return;
      }
      if (cachedMovieId) fullplay.cache.set(String(cachedMovieId), { ...payload, __txzzContext: pending });
      pending.resolve(payload);
    }
    else pending.reject(new Error(payload.error || "播放详情请求失败"));
  });

  async function maybeReplaceMovieDetail(api, params, visitorDetail, capturedContext = null) {
    if (!fullplay.enabled || api !== "/movie/detail") return visitorDetail;
    const movieId = getMovieId(params, api);
    if (!movieId) return visitorDetail;
    const currentContext = buildRequestContext(movieId);
    const sameCapturedGeneration = capturedContext
      && capturedContext.pageKey === currentContext.pageKey
      && capturedContext.pageEpoch === currentContext.pageEpoch
      && String(capturedContext.movieId || "") === String(movieId);
    // 同一页面内必须沿用请求发起时的判断，防止较早的预加载响应在用户点击后
    // 被“追认”为当前项；真正发生路由切换时则以新页面上下文重新判定。
    const context = sameCapturedGeneration ? capturedContext : currentContext;
    if (!context.active) {
      emit("fullplay-prefetch", {
        movieId,
        pageKey: context.pageKey,
        pageEpoch: context.pageEpoch,
        active: false
      });
      return visitorDetail;
    }
    setMessage(`记录详情接口，正在获取播放资源：${movieId}`);
    emit("fullplay-hit", {
      movieId,
      visitorHasBuy: visitorDetail?.has_buy,
      visitorLayerType: visitorDetail?.layer_type,
      visitorPlayLink: visitorDetail?.play_link
    });
    let payload = null;
    try {
      payload = await requestFullDetail(movieId, visitorDetail, context);
    } catch (error) {
      recordError(error, { api, movieId, background: true });
      emit("fullplay-status", { api, movieId, error: error.message, background: true });
      return visitorDetail;
    }
    if (context.pageKey !== fullplay.pageKey || context.pageEpoch !== fullplay.pageEpoch || (routeMovieId() && routeMovieId() !== movieId)) {
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
        pageKey: context.pageKey,
        pageEpoch: context.pageEpoch,
        contextKey: context.contextKey,
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
      pageKey: context.pageKey,
      pageEpoch: context.pageEpoch,
      contextKey: context.contextKey,
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
    setMessage(`播放资源已更新：${movieId}，分片 ${summary?.fullStat?.segments ?? "?"}`, "ok");
    emit("fullplay-success", {
      movieId,
      pageKey: context.pageKey,
      pageEpoch: context.pageEpoch,
      contextKey: context.contextKey,
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
    if (/^\/vlog\/?$/i.test(String(location.pathname || ""))) {
      try { applyNativeVlogDetail(movieId, { ...payload, data: fullDetail, detail: fullDetail, summary }, context, "detail-intercept"); } catch (error) {
        recordError(error, { movieId, nativeVlog: true, reason: "detail-intercept" });
      }
    }
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
      const movieId = getMovieId(params, normalizedApi);
      const capturedContext = buildRequestContext(movieId);
      const visitorDetail = await original.apply(this, arguments);
      try {
        return await maybeReplaceMovieDetail(normalizedApi, params, visitorDetail, capturedContext);
      } catch (error) {
        recordError(error, { api: normalizedApi, params: safeString(params, 300) });
        setMessage(`播放资源获取失败：${error.message}`, "error");
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
      setMessage("播放资源监听已开启", "ok");
    },
    disable() {
      fullplay.enabled = false;
      setMessage("播放资源监听已关闭");
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
        if (!fullDetail) throw new Error("播放详情响应为空");
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

  /**
   * 视频详情页：阻止网站自动播放，默认暂停。
   * 用户主动点击播放器区域后才允许 play()。
   */
  function isMovieDetailPath(pathname = location.pathname) {
    return /^\/movie\/detail\/\d+\/?$/.test(String(pathname || ""));
  }

  function installDetailPageAutoplayBlocker() {
    if (window.__txzzDetailAutoplayBlocker) return;
    window.__txzzDetailAutoplayBlocker = true;

    let userAllowedPlay = false;
    let lastDetailKey = "";
    let pauseSweepTimer = 0;

    const detailKey = () => `${location.pathname}${location.search}`;

    const resetForDetail = (reason = "enter") => {
      if (!isMovieDetailPath()) {
        userAllowedPlay = false;
        lastDetailKey = "";
        return;
      }
      const key = detailKey();
      if (key !== lastDetailKey) {
        userAllowedPlay = false;
        lastDetailKey = key;
        emit("fullplay-status", {
          message: "详情页已阻止自动播放，默认暂停（点击播放器后可播）",
          movieId: getMovieId(null, location.href),
          background: true,
          reason
        });
      }
      pauseAllMedia("detail-enter");
      // 首屏几秒内反复清 autoplay，覆盖晚挂载的播放器
      [0, 200, 500, 1000, 2000, 4000, 7000].forEach((delay) => {
        window.setTimeout(() => {
          if (isMovieDetailPath() && !userAllowedPlay && detailKey() === lastDetailKey) {
            pauseAllMedia(`detail-sweep:${delay}`);
          }
        }, delay);
      });
    };

    const pauseAllMedia = (via = "pause") => {
      if (!isMovieDetailPath() || userAllowedPlay) return 0;
      let count = 0;
      document.querySelectorAll("video,audio").forEach((media) => {
        try {
          media.autoplay = false;
          media.removeAttribute("autoplay");
          // 去掉可能触发自动播的属性
          if (media.hasAttribute("muted") && media.dataset.txzzKeepMuted !== "1") {
            // 不强制取消静音，只停播
          }
          if (!media.paused) {
            media.pause();
            count += 1;
          }
          // 部分播放器靠 currentTime/play 连环触发，标记一下便于排查
          media.dataset.txzzAutoplayBlocked = "1";
        } catch (_) {}
      });
      if (count > 0) {
        emit("fullplay-status", {
          message: `详情页已暂停 ${count} 个自动播放媒体`,
          movieId: getMovieId(null, location.href),
          background: true,
          via
        });
      }
      return count;
    };

    // 拦截 play：详情页且用户未点播放器前，直接暂停并吞掉自动 play
    try {
      const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
      if (proto && !proto.__txzzPlayBlocked) {
        const rawPlay = proto.play;
        if (typeof rawPlay === "function") {
          proto.play = function txzzGuardedPlay() {
            if (isMovieDetailPath() && !userAllowedPlay) {
              try {
                this.autoplay = false;
                this.removeAttribute("autoplay");
                this.pause();
              } catch (_) {}
              // 返回 resolved Promise，避免网站播放器卡在 unhandled rejection
              return Promise.resolve();
            }
            return rawPlay.apply(this, arguments);
          };
          proto.__txzzPlayBlocked = true;
        }
      }
    } catch (_) {}

    // 用户点到播放器相关区域后放行（含控制栏按钮）
    const markUserPlayIntent = (event) => {
      if (!isMovieDetailPath()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          "video,audio,button,[role='button'],.art-video-player,.art-video,.xgplayer,.dplayer,.vjs-control-bar,[class*='player'],[class*='Player'],[class*='control'],[class*='Control']"
        )
      ) {
        userAllowedPlay = true;
      }
    };
    document.addEventListener("pointerdown", markUserPlayIntent, true);
    document.addEventListener("click", markUserPlayIntent, true);
    document.addEventListener("touchstart", markUserPlayIntent, true);

    // 新挂载的 video/audio 立刻去掉 autoplay 并暂停
    try {
      const observer = new MutationObserver((mutations) => {
        if (!isMovieDetailPath() || userAllowedPlay) return;
        let hit = false;
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.matches?.("video,audio") || node.querySelector?.("video,audio")) hit = true;
          });
        }
        if (hit) pauseAllMedia("mutation");
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}

    // SPA 路由切换监听
    const onRouteMaybeChanged = () => {
      window.setTimeout(() => resetForDetail("route"), 0);
    };
    try {
      const rawPush = history.pushState;
      const rawReplace = history.replaceState;
      history.pushState = function () {
        const ret = rawPush.apply(this, arguments);
        onRouteMaybeChanged();
        return ret;
      };
      history.replaceState = function () {
        const ret = rawReplace.apply(this, arguments);
        onRouteMaybeChanged();
        return ret;
      };
      window.addEventListener("popstate", onRouteMaybeChanged);
      window.addEventListener("hashchange", onRouteMaybeChanged);
    } catch (_) {}

    // 轻量轮询路径（部分 Nuxt 路由不走 history 包装）
    window.setInterval(() => {
      if (!isMovieDetailPath()) {
        if (lastDetailKey) {
          lastDetailKey = "";
          userAllowedPlay = false;
        }
        return;
      }
      if (detailKey() !== lastDetailKey) resetForDetail("poll");
      else if (!userAllowedPlay && !pauseSweepTimer) {
        // 空闲时偶尔扫一次，防止晚启动的 autoplay
        pauseSweepTimer = window.setTimeout(() => {
          pauseSweepTimer = 0;
          pauseAllMedia("idle-sweep");
        }, 1500);
      }
    }, 800);

    resetForDetail("install");
    emit("hook", { target: "detail-autoplay-block", status: "installed" });
  }

  installPageContextTracker();
  installSameDetailNavigationGuard();
  installDetailPageAutoplayBlocker();
  repatchNuxtRequests("install");
  emit("hook", { target: "fetch/xhr/media/hls/fullplay", status: "installed" });
})();
