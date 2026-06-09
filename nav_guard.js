"use strict";

(() => {
  const SOURCE = "txzz-nav-guard";
  const DETAIL_RE = /^\/movie\/detail\/\d+\/?$/;
  const state = window.__txzzNavGuardState || {
    installed: false,
    lastDetailKey: "",
    lastAllowedAt: 0,
    suppressions: [],
    routerTargets: [],
    locationTargets: []
  };
  window.__txzzNavGuardState = state;
  if (state.installed) return;
  state.installed = true;

  function now() {
    return new Date().toISOString();
  }

  function currentDetailKey() {
    if (!DETAIL_RE.test(location.pathname)) return "";
    return `${location.origin}${location.pathname.replace(/\/$/, "")}${location.search}`;
  }

  function targetDetailKey(value) {
    try {
      const url = new URL(String(value || location.href), location.href);
      if (!DETAIL_RE.test(url.pathname)) return "";
      return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
    } catch (_) {
      return "";
    }
  }

  function isSameDetail(value) {
    const current = currentDetailKey();
    const target = targetDetailKey(value);
    return Boolean(current && target && current === target);
  }

  function emit(kind, payload = {}) {
    try {
      window.postMessage({ source: SOURCE, kind, payload: { ts: now(), ...payload } }, "*");
    } catch (_) {}
  }

  function record(kind, value) {
    const item = {
      kind,
      value: String(value || location.href),
      key: currentDetailKey(),
      at: Date.now(),
      ts: now()
    };
    state.suppressions.push(item);
    state.suppressions = state.suppressions.slice(-80);
    emit("suppress", item);
    return item;
  }

  function shouldSuppress(value, kind) {
    if (!isSameDetail(value)) return false;
    const nowMs = Date.now();
    const current = currentDetailKey();
    const firstAllowedForCurrent = state.lastDetailKey !== current;
    state.lastDetailKey = current;
    if (firstAllowedForCurrent) {
      state.lastAllowedAt = nowMs;
      return false;
    }
    if (nowMs - state.lastAllowedAt < 8000) {
      record(kind, value);
      return true;
    }
    state.lastAllowedAt = nowMs;
    return false;
  }

  function patchHistory() {
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      if (typeof original !== "function" || original.__txzzNavGuardPatched) continue;
      const wrapped = function txzzHistoryGuard(historyState, title, url) {
        if (url && shouldSuppress(url, `history.${name}`)) return undefined;
        return original.apply(this, arguments);
      };
      wrapped.__txzzNavGuardPatched = true;
      wrapped.__txzzOriginal = original;
      try {
        Object.defineProperty(history, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: wrapped
        });
      } catch (_) {
        history[name] = wrapped;
      }
    }
  }

  function patchLocationMethod(name) {
    const original = Location.prototype?.[name] || location[name];
    if (typeof original !== "function" || original.__txzzNavGuardPatched) return false;
    const wrapped = function txzzLocationGuard(url) {
      if (url && shouldSuppress(url, `location.${name}`)) return undefined;
      return original.apply(this, arguments);
    };
    wrapped.__txzzNavGuardPatched = true;
    wrapped.__txzzOriginal = original;
    try {
      Object.defineProperty(Location.prototype, name, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrapped
      });
      state.locationTargets.push(`Location.prototype.${name}`);
      return true;
    } catch (_) {
      return false;
    }
  }

  function stringifyRoute(to) {
    if (typeof to === "string") return to;
    if (!to || typeof to !== "object") return "";
    if (to.fullPath) return to.fullPath;
    if (to.path) {
      const query = to.query && typeof to.query === "object"
        ? `?${new URLSearchParams(to.query).toString()}`
        : "";
      return `${to.path}${query}${to.hash || ""}`;
    }
    if (to.name && to.params?.id) return `/movie/detail/${to.params.id}`;
    return "";
  }

  function patchRouterObject(router, label) {
    if (!router || router.__txzzNavGuardRouterPatched) return false;
    let patched = 0;
    for (const name of ["push", "replace"]) {
      const original = router[name];
      if (typeof original !== "function" || original.__txzzNavGuardPatched) continue;
      const wrapped = function txzzRouterGuard(to) {
        const target = stringifyRoute(to);
        if (target && shouldSuppress(target, `${label}.${name}`)) {
          if (typeof Promise !== "undefined") return Promise.resolve(router.currentRoute || undefined);
          return undefined;
        }
        return original.apply(this, arguments);
      };
      wrapped.__txzzNavGuardPatched = true;
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
      router.__txzzNavGuardRouterPatched = true;
      state.routerTargets.push(label);
      state.routerTargets = Array.from(new Set(state.routerTargets)).slice(-30);
      emit("router-patched", { label, patched });
    }
    return Boolean(patched);
  }

  function patchRouters() {
    let patched = 0;
    try { patched += patchRouterObject(window.$nuxt?.$router, "$nuxt.$router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterObject(window.$nuxt?.$root?.$router, "$nuxt.$root.$router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterObject(window.$nuxt?.$options?.router, "$nuxt.$options.router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterObject(window.$nuxt?.context?.app?.router, "$nuxt.context.app.router") ? 1 : 0; } catch (_) {}
    try { patched += patchRouterObject(window.$nuxt?.$root?.context?.app?.router, "$nuxt.$root.context.app.router") ? 1 : 0; } catch (_) {}
    return patched;
  }

  function install() {
    state.lastDetailKey = currentDetailKey() || state.lastDetailKey;
    state.lastAllowedAt = state.lastAllowedAt || Date.now();
    patchHistory();
    patchLocationMethod("assign");
    patchLocationMethod("replace");
    patchRouters();
    emit("installed", {
      key: currentDetailKey(),
      locationTargets: state.locationTargets.slice(),
      routerTargets: state.routerTargets.slice()
    });
  }

  window.__txzzNavGuard = {
    state,
    install,
    patchRouters,
    shouldSuppress,
    isSameDetail,
    currentDetailKey,
    suppressions() {
      return state.suppressions.slice();
    }
  };

  install();
  [50, 150, 350, 800, 1600, 3000, 6000].forEach((delay) => {
    window.setTimeout(() => {
      patchHistory();
      patchRouters();
    }, delay);
  });
  try {
    window.addEventListener("load", () => patchRouters(), true);
    document.addEventListener("readystatechange", () => patchRouters(), true);
    if (typeof window.onNuxtReady === "function") window.onNuxtReady(() => patchRouters());
  } catch (_) {}
})();
