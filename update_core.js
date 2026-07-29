"use strict";

(function installUpdateDecisionCore(root) {
  function parseVersionParts(version = "") {
    return String(version || "")
      .split(".")
      .map((item) => Number.parseInt(item.replace(/[^\d]/g, ""), 10))
      .map((item) => Number.isFinite(item) ? item : 0);
  }

  function compareVersions(left = "", right = "") {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const length = Math.max(leftParts.length, rightParts.length, 3);
    for (let index = 0; index < length; index += 1) {
      const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  function parseBuildStamp(value = "") {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (digits.length < 12) return null;
    const compact = digits.slice(0, 12);
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const hour = Number(compact.slice(8, 10));
    const minute = Number(compact.slice(10, 12));
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    return Date.UTC(year, month - 1, day, hour, minute);
  }

  function compareBuilds(left = "", right = "") {
    const leftStamp = parseBuildStamp(left);
    const rightStamp = parseBuildStamp(right);
    if (Number.isFinite(leftStamp) && Number.isFinite(rightStamp)) return leftStamp - rightStamp;
    return String(left || "").localeCompare(String(right || ""), "zh-CN", { numeric: true, sensitivity: "base" });
  }

  function shouldUpdate(remote = {}, localVersion = "", localBuild = "") {
    const remoteVersion = String(remote.version || "").trim();
    const remoteBuild = String(remote.build || "").trim();
    const currentVersion = String(localVersion || "").trim();
    const currentBuild = String(localBuild || "").trim();
    if (!remoteVersion) return false;
    const versionDifference = compareVersions(remoteVersion, currentVersion);
    if (versionDifference > 0) return true;
    if (versionDifference < 0) return false;
    if (!remoteBuild) return false;
    if (!currentBuild) return true;
    return compareBuilds(remoteBuild, currentBuild) > 0;
  }

  function localIdentityMatches(cachedResult = {}, localVersion = "", localBuild = "") {
    return String(cachedResult?.local?.version || "") === String(localVersion || "")
      && String(cachedResult?.local?.build || "") === String(localBuild || "");
  }

  function canReuseSuccessCache({
    cachedResult,
    lastCheckedAt,
    now = Date.now(),
    ttlMs,
    localVersion,
    localBuild,
    force = false,
    realtime = false
  } = {}) {
    const age = Math.max(0, Number(now || 0) - Number(lastCheckedAt || 0));
    return Boolean(
      !force
      && !realtime
      && cachedResult?.ok
      && Number(lastCheckedAt || 0) > 0
      && age < Number(ttlMs || 0)
      // 更新后的 Service Worker 可能仍读到旧安装版本写下的 15 分钟缓存；
      // 本地身份不一致时必须重新比较，旧的 updateAvailable 不能跨版本复用。
      && localIdentityMatches(cachedResult, localVersion, localBuild)
    );
  }

  root.TxzzUpdateCore = Object.freeze({
    canReuseSuccessCache,
    compareBuilds,
    compareVersions,
    localIdentityMatches,
    parseBuildStamp,
    shouldUpdate
  });
})(globalThis);
