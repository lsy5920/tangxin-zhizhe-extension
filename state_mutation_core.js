"use strict";

(function installStateMutationCore(root) {
  const DOWNLOAD_STAGES = new Set([
    "queued", "probing", "downloading", "paused", "recovering", "assembling",
    "ready", "saving", "complete", "cancelled", "stale", "error"
  ]);

  function normalizeDownloadStage(stage = "") {
    const legacy = { playlist: "probing", segments: "downloading", segment: "downloading", "save-dialog": "saving" };
    const normalized = legacy[String(stage || "queued")] || String(stage || "queued");
    return DOWNLOAD_STAGES.has(normalized) ? normalized : "stale";
  }

  function isActiveDownloadTask(task) {
    if (!isPlainObject(task)) return false;
    return new Set(["queued", "probing", "downloading", "recovering", "assembling", "saving"])
      .has(normalizeDownloadStage(task.stage));
  }

  function normalizeDownloadMode(mode = "", url = "") {
    const normalized = String(mode || "");
    if (normalized === "progressive-opfs" || normalized === "hls-opfs") return normalized;
    const path = String(url || "").split(/[?#]/, 1)[0].toLowerCase();
    return path.endsWith(".mp4") ? "progressive-opfs" : "hls-opfs";
  }

  function downloadControlDecision(stage = "", action = "") {
    const normalizedStage = normalizeDownloadStage(stage);
    const normalizedAction = String(action || "");
    const active = new Set(["queued", "probing", "downloading", "recovering", "assembling"]);
    if (normalizedAction === "pause") {
      if (normalizedStage === "paused") return { allowed: false, noop: true, reason: "already-paused" };
      return active.has(normalizedStage)
        ? { allowed: true, noop: false, reason: "" }
        : { allowed: false, noop: false, reason: "task-not-active" };
    }
    if (normalizedAction === "resume") {
      return normalizedStage === "paused"
        ? { allowed: true, noop: false, reason: "" }
        : { allowed: false, noop: normalizedStage === "queued", reason: normalizedStage === "queued" ? "already-queued" : "task-not-paused" };
    }
    if (normalizedAction === "cancel") {
      if (["cancelled", "stale", "error"].includes(normalizedStage)) {
        return { allowed: false, noop: true, reason: "already-stopped" };
      }
      return [...active, "paused"].includes(normalizedStage)
        ? { allowed: true, noop: false, reason: "" }
        : { allowed: false, noop: false, reason: "artifact-ready" };
    }
    return { allowed: false, noop: false, reason: "unknown-action" };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function valuesEqual(left, right) {
    if (Object.is(left, right)) return true;
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (_) {
      return false;
    }
  }

  function mergeConcurrentState(base, incoming, current) {
    if (valuesEqual(incoming, base)) return current;
    if (!isPlainObject(base) || !isPlainObject(incoming) || !isPlainObject(current)) return incoming;
    const merged = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(incoming), ...Object.keys(current)]);
    for (const key of keys) {
      const inBase = Object.prototype.hasOwnProperty.call(base, key);
      const inIncoming = Object.prototype.hasOwnProperty.call(incoming, key);
      const inCurrent = Object.prototype.hasOwnProperty.call(current, key);
      if (!inIncoming) {
        if (inBase) continue;
        if (inCurrent) merged[key] = current[key];
        continue;
      }
      if (!inBase) {
        merged[key] = inCurrent ? mergeConcurrentState(undefined, incoming[key], current[key]) : incoming[key];
        continue;
      }
      merged[key] = mergeConcurrentState(base[key], incoming[key], inCurrent ? current[key] : undefined);
    }
    return merged;
  }

  function validateDownloadEvent(existing, message, deletedTaskIds = []) {
    if (!existing) return { accepted: false, reason: "task-missing" };
    if (deletedTaskIds.includes(String(message.taskId || ""))) return { accepted: false, reason: "task-deleted" };
    if (!message.attemptId || String(message.attemptId) !== String(existing.attemptId || "")) {
      return { accepted: false, reason: "attempt-mismatch" };
    }
    const sequence = Number(message.sequence || 0);
    if (!Number.isFinite(sequence) || sequence <= Number(existing.sequence || 0)) {
      return { accepted: false, reason: "stale-sequence" };
    }
    return { accepted: true, reason: "", sequence, stage: normalizeDownloadStage(message.stage) };
  }

  function bufferedDownloadEventIsStale(buffered, message) {
    if (!buffered) return false;
    if (String(buffered.attemptId || "") !== String(message.attemptId || "")) return false;
    return Number(buffered.sequence || 0) >= Number(message.sequence || 0);
  }

  function downloadEventStageChanged(observed, message) {
    const attemptId = String(message.attemptId || "");
    const stage = normalizeDownloadStage(message.stage);
    return !observed
      || String(observed.attemptId || "") !== attemptId
      || String(observed.stage || "") !== stage;
  }

  function planPersistedDownloadRecovery(downloadTasks = {}) {
    const recoverableStages = new Set(["queued", "probing", "downloading", "recovering", "assembling"]);
    return Object.values(downloadTasks || {})
      .filter((task) => isPlainObject(task) && recoverableStages.has(normalizeDownloadStage(task.stage)))
      .map((task) => ({
        task,
        action: task.attemptId ? "recover" : "stale"
      }));
  }

  function canTakeSaveTokenClaim(record = {}, claimant = "", previousClaimantActive = false) {
    const previous = String(record.claimedBy || "");
    const current = String(claimant || "");
    if (!previous || previous === current) return true;
    // 只有后台已确认旧标签不存在时才能转交，避免两个标签同时保存同一成品。
    return previousClaimantActive !== true;
  }

  root.TxzzStateMutationCore = Object.freeze({
    bufferedDownloadEventIsStale,
    canTakeSaveTokenClaim,
    downloadControlDecision,
    downloadEventStageChanged,
    isActiveDownloadTask,
    mergeConcurrentState,
    normalizeDownloadMode,
    normalizeDownloadStage,
    planPersistedDownloadRecovery,
    validateDownloadEvent
  });
})(globalThis);
