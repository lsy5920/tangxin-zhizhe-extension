"use strict";

(() => {
  const script = document.currentScript;
  const id = script?.dataset?.txzzProbeId || "";

  function pickUserInfo() {
    const candidates = [];
    try {
      candidates.push(window.$nuxt?.$store?.state?.userInfo);
      candidates.push(window.__NUXT__?.state?.userInfo);
    } catch (_) {}
    const displayPatch = window.__txzzDisplayPatch?.patch || {};
    const displayPatchApplied =
      window.__txzzDisplayPatch?.active === true ||
      document.documentElement.dataset.txzzVip === "permanent" ||
      document.documentElement.dataset.txzzFullAccount === "true";
    const fallbackPatch = {
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
    for (const value of candidates) {
      if (value && typeof value === "object") {
        const base = {
          id: value.id,
          account_name: value.account_name,
          nickname: value.nickname,
          is_vip: value.is_vip,
          is_dark_vip: value.is_dark_vip,
          group_name: value.group_name,
          group_end_time: value.group_end_time,
          balance: value.balance,
          balance_income: value.balance_income
        };
        return displayPatchApplied ? { ...base, ...fallbackPatch, ...displayPatch } : base;
      }
    }
    return displayPatchApplied ? { ...fallbackPatch, nickname: "永久会员" } : null;
  }

  window.postMessage(
    {
      source: "txzz-page-probe",
      id,
      payload: {
        href: location.href,
        displayPatchApplied:
          window.__txzzDisplayPatch?.active === true ||
          document.documentElement.dataset.txzzVip === "permanent" ||
          document.documentElement.dataset.txzzFullAccount === "true",
        userInfo: pickUserInfo()
      }
    },
    "*"
  );
})();
