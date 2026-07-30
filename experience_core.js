"use strict";

(function installExperienceCore(root) {
  const EXPERIENCE_SCHEMA_VERSION = 1;
  const MAX_LIBRARY_ITEMS = 500;
  const MAX_BOOKMARKS_TOTAL = 1000;
  const MAX_BOOKMARKS_PER_MOVIE = 50;
  const MAX_ALERTS = 100;
  const PRIORITY_ORDER = Object.freeze({ high: 0, normal: 1, low: 2 });
  const RUNNING_DOWNLOAD_STAGES = new Set(["probing", "downloading", "recovering", "assembling", "saving"]);

  function nowIso(now = Date.now()) {
    return new Date(now).toISOString();
  }

  function safeText(value, maxLength = 240) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizePriority(value) {
    return Object.prototype.hasOwnProperty.call(PRIORITY_ORDER, value) ? value : "normal";
  }

  function normalizeClock(value, fallback) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return fallback;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour <= 23 && minute <= 59 ? `${match[1]}:${match[2]}` : fallback;
  }

  function defaultExperienceState() {
    return {
      schemaVersion: EXPERIENCE_SCHEMA_VERSION,
      library: {},
      bookmarks: {},
      downloadPolicy: {
        maxConcurrent: 1,
        queuePaused: false,
        windowEnabled: false,
        windowStart: "00:00",
        windowEnd: "23:59",
        autoCleanup: false
      },
      accountPatrol: {
        enabled: true,
        intervalHours: 6,
        lastRunAt: "",
        records: {}
      },
      notificationsEnabled: false,
      storageAudit: null,
      alerts: []
    };
  }

  function normalizeTags(value) {
    const tags = Array.isArray(value) ? value : [];
    return Array.from(new Set(tags.map((item) => safeText(item, 24)).filter(Boolean))).slice(0, 20);
  }

  function normalizeLibraryEntry(raw = {}, movieId = "") {
    const id = safeText(raw.movieId || movieId, 80);
    if (!id) return null;
    return {
      movieId: id,
      title: safeText(raw.title, 180),
      // 片库只保留目录阶段元数据，用于脱离当前搜索页后仍能恢复影视 App 卡片。
      // 完整播放 URL 不在此白名单中，点击开映仍必须新建播放会话。
      posterUrl: safeText(raw.posterUrl, 2000),
      creator: safeText(raw.creator, 180),
      durationSeconds: Math.max(0, finiteNumber(raw.durationSeconds)),
      durationLabel: safeText(raw.durationLabel, 40),
      orientation: ["landscape", "portrait", "square"].includes(raw.orientation) ? raw.orientation : "landscape",
      access: ["free", "vip", "coin"].includes(raw.access) ? raw.access : "free",
      price: Math.max(0, finiteNumber(raw.price)),
      isCollection: raw.isCollection === true,
      favorite: raw.favorite === true,
      watchLater: raw.watchLater === true,
      tags: normalizeTags(raw.tags),
      note: safeText(raw.note, 500),
      addedAt: safeText(raw.addedAt, 40),
      updatedAt: safeText(raw.updatedAt, 40),
      lastPlayedAt: safeText(raw.lastPlayedAt, 40),
      watchedAt: safeText(raw.watchedAt, 40)
    };
  }

  function normalizeBookmark(raw = {}, movieId = "") {
    const id = safeText(raw.id, 100);
    const targetMovieId = safeText(raw.movieId || movieId, 80);
    const startSeconds = Math.max(0, finiteNumber(raw.startSeconds ?? raw.positionSeconds));
    const rawEnd = finiteNumber(raw.endSeconds, 0);
    const endSeconds = rawEnd > startSeconds + 1 ? rawEnd : null;
    if (!id || !targetMovieId) return null;
    return {
      id,
      movieId: targetMovieId,
      title: safeText(raw.title, 180),
      label: safeText(raw.label, 80),
      note: safeText(raw.note, 500),
      startSeconds,
      endSeconds,
      durationSeconds: Math.max(0, finiteNumber(raw.durationSeconds)),
      createdAt: safeText(raw.createdAt, 40),
      updatedAt: safeText(raw.updatedAt, 40)
    };
  }

  function normalizeAccountHealthRecord(raw = {}, accountId = "") {
    const id = safeText(raw.accountId || accountId, 120);
    if (!id) return null;
    const allowedStates = new Set(["unknown", "healthy", "degraded", "cooling", "needs_attention"]);
    const state = allowedStates.has(raw.state) ? raw.state : "unknown";
    return {
      accountId: id,
      state,
      consecutiveFailures: Math.max(0, Math.floor(finiteNumber(raw.consecutiveFailures))),
      lastCheckedAt: safeText(raw.lastCheckedAt, 40),
      cooldownUntil: safeText(raw.cooldownUntil, 40),
      lastReason: safeText(raw.lastReason, 180),
      history: (Array.isArray(raw.history) ? raw.history : []).slice(-10).map((item) => ({
        checkedAt: safeText(item?.checkedAt, 40),
        ok: item?.ok === true,
        category: ["ok", "network", "credential"].includes(item?.category) ? item.category : "network",
        reason: safeText(item?.reason, 180)
      }))
    };
  }

  function normalizeExperienceState(raw = {}) {
    const base = defaultExperienceState();
    const library = {};
    for (const [movieId, value] of Object.entries(raw.library && typeof raw.library === "object" ? raw.library : {})) {
      const entry = normalizeLibraryEntry(value, movieId);
      if (entry && (entry.favorite || entry.watchLater)) library[entry.movieId] = entry;
      if (Object.keys(library).length >= MAX_LIBRARY_ITEMS) break;
    }
    const bookmarks = {};
    let bookmarkCount = 0;
    for (const [movieId, rows] of Object.entries(raw.bookmarks && typeof raw.bookmarks === "object" ? raw.bookmarks : {})) {
      for (const value of Array.isArray(rows) ? rows : []) {
        const item = normalizeBookmark(value, movieId);
        if (!item || bookmarkCount >= MAX_BOOKMARKS_TOTAL) break;
        const key = safeText(item.movieId, 80);
        const selected = bookmarks[key] || [];
        if (selected.length >= MAX_BOOKMARKS_PER_MOVIE || selected.some((row) => row.id === item.id)) continue;
        bookmarks[key] = [...selected, item];
        bookmarkCount += 1;
      }
      if (bookmarkCount >= MAX_BOOKMARKS_TOTAL) break;
    }
    const policy = raw.downloadPolicy && typeof raw.downloadPolicy === "object" ? raw.downloadPolicy : {};
    const patrol = raw.accountPatrol && typeof raw.accountPatrol === "object" ? raw.accountPatrol : {};
    const records = {};
    for (const [accountId, value] of Object.entries(patrol.records && typeof patrol.records === "object" ? patrol.records : {})) {
      const record = normalizeAccountHealthRecord(value, accountId);
      if (record) records[record.accountId] = record;
    }
    return {
      ...base,
      schemaVersion: EXPERIENCE_SCHEMA_VERSION,
      library,
      bookmarks,
      downloadPolicy: {
        maxConcurrent: Math.max(1, Math.min(3, Math.floor(finiteNumber(policy.maxConcurrent, 1)))),
        queuePaused: policy.queuePaused === true,
        windowEnabled: policy.windowEnabled === true,
        windowStart: normalizeClock(policy.windowStart, "00:00"),
        windowEnd: normalizeClock(policy.windowEnd, "23:59"),
        autoCleanup: policy.autoCleanup === true
      },
      accountPatrol: {
        enabled: patrol.enabled !== false,
        intervalHours: [1, 6, 12, 24].includes(Number(patrol.intervalHours)) ? Number(patrol.intervalHours) : 6,
        lastRunAt: safeText(patrol.lastRunAt, 40),
        records
      },
      notificationsEnabled: raw.notificationsEnabled === true,
      storageAudit: raw.storageAudit && typeof raw.storageAudit === "object" ? {
        checkedAt: safeText(raw.storageAudit.checkedAt, 40),
        storage: raw.storageAudit.storage && typeof raw.storageAudit.storage === "object" ? {
          known: raw.storageAudit.storage.known === true,
          quota: Math.max(0, finiteNumber(raw.storageAudit.storage.quota)),
          usage: Math.max(0, finiteNumber(raw.storageAudit.storage.usage)),
          available: Math.max(0, finiteNumber(raw.storageAudit.storage.available))
        } : { known: false, quota: 0, usage: 0, available: 0 },
        managedBytes: Math.max(0, finiteNumber(raw.storageAudit.managedBytes)),
        lowSpace: raw.storageAudit.lowSpace === true,
        // OPFS 扫描结果需要保留完整条目，否则排序靠后的孤儿无法从 UI 发起清理。
        entries: (Array.isArray(raw.storageAudit.entries) ? raw.storageAudit.entries : []).map((item) => ({
          taskId: safeText(item?.taskId, 140),
          attemptId: safeText(item?.attemptId, 140),
          movieId: safeText(item?.movieId, 80),
          filename: safeText(item?.filename, 180),
          category: safeText(item?.category, 40),
          bytes: Math.max(0, finiteNumber(item?.bytes)),
          protected: item?.protected === true,
          duplicateGroup: safeText(item?.duplicateGroup, 140),
          updatedAt: safeText(item?.updatedAt, 40)
        })).filter((item) => item.taskId && item.attemptId)
      } : null,
      alerts: (Array.isArray(raw.alerts) ? raw.alerts : []).slice(-MAX_ALERTS).map((item) => ({
        id: safeText(item?.id, 100),
        key: safeText(item?.key, 160),
        category: safeText(item?.category, 40) || "system",
        level: ["info", "warning", "error", "success"].includes(item?.level) ? item.level : "info",
        title: safeText(item?.title, 100),
        detail: safeText(item?.detail, 300),
        createdAt: safeText(item?.createdAt, 40),
        readAt: safeText(item?.readAt, 40),
        count: Math.max(1, Math.floor(finiteNumber(item?.count, 1)))
      })).filter((item) => item.id && item.title)
    };
  }

  function updateLibraryEntry(state, patch = {}, now = Date.now()) {
    const next = normalizeExperienceState(state);
    const movieId = safeText(patch.movieId, 80);
    if (!movieId) throw new Error("缺少影片编号");
    const current = next.library[movieId] || normalizeLibraryEntry({ movieId }, movieId);
    const merged = normalizeLibraryEntry({
      ...current,
      ...patch,
      movieId,
      addedAt: current?.addedAt || nowIso(now),
      updatedAt: nowIso(now)
    }, movieId);
    if (!merged.favorite && !merged.watchLater) {
      delete next.library[movieId];
      return next;
    }
    if (!next.library[movieId] && Object.keys(next.library).length >= MAX_LIBRARY_ITEMS) {
      throw new Error(`片库最多保存 ${MAX_LIBRARY_ITEMS} 部影片，请先整理`);
    }
    next.library[movieId] = merged;
    return next;
  }

  function selectLibrary(state, query = {}) {
    const next = normalizeExperienceState(state);
    const keyword = safeText(query.keyword, 120).toLowerCase();
    const filter = ["all", "favorite", "watchLater", "unwatched"].includes(query.filter) ? query.filter : "all";
    const sort = ["updated", "added", "played", "unwatched"].includes(query.sort) ? query.sort : "updated";
    const rows = Object.values(next.library).filter((item) => {
      if (filter === "favorite" && !item.favorite) return false;
      if (filter === "watchLater" && !item.watchLater) return false;
      if (filter === "unwatched" && item.watchedAt) return false;
      if (!keyword) return true;
      return [item.movieId, item.title, item.note, ...(item.tags || [])].join(" ").toLowerCase().includes(keyword);
    });
    return rows.sort((left, right) => {
      if (sort === "unwatched") {
        const watchedDiff = Number(Boolean(left.watchedAt)) - Number(Boolean(right.watchedAt));
        if (watchedDiff) return watchedDiff;
      }
      const field = sort === "added" ? "addedAt" : sort === "played" ? "lastPlayedAt" : "updatedAt";
      return (Date.parse(right[field] || "") || 0) - (Date.parse(left[field] || "") || 0);
    });
  }

  function totalBookmarks(state) {
    return Object.values(state.bookmarks || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  }

  function addBookmark(state, raw = {}, now = Date.now()) {
    const next = normalizeExperienceState(state);
    if (raw.endSeconds !== null && raw.endSeconds !== undefined && raw.endSeconds !== "") {
      const range = validateLoopRange(raw.startSeconds ?? raw.positionSeconds, raw.endSeconds, raw.durationSeconds);
      if (!range.ok) throw new Error(range.reason);
    }
    const item = normalizeBookmark({ ...raw, createdAt: raw.createdAt || nowIso(now), updatedAt: nowIso(now) }, raw.movieId);
    if (!item) throw new Error("书签缺少影片或书签编号");
    const rows = next.bookmarks[item.movieId] || [];
    if (!rows.some((row) => row.id === item.id)) {
      if (rows.length >= MAX_BOOKMARKS_PER_MOVIE) throw new Error(`每部影片最多保存 ${MAX_BOOKMARKS_PER_MOVIE} 条书签`);
      if (totalBookmarks(next) >= MAX_BOOKMARKS_TOTAL) throw new Error(`时间书签总数最多为 ${MAX_BOOKMARKS_TOTAL} 条`);
    }
    next.bookmarks[item.movieId] = [...rows.filter((row) => row.id !== item.id), item]
      .sort((left, right) => left.startSeconds - right.startSeconds);
    return next;
  }

  function removeBookmark(state, movieId, bookmarkId) {
    const next = normalizeExperienceState(state);
    const id = safeText(movieId, 80);
    const rows = (next.bookmarks[id] || []).filter((item) => item.id !== String(bookmarkId || ""));
    if (rows.length) next.bookmarks[id] = rows;
    else delete next.bookmarks[id];
    return next;
  }

  function validateLoopRange(startSeconds, endSeconds, durationSeconds = 0) {
    const start = Math.max(0, finiteNumber(startSeconds));
    const end = Math.max(0, finiteNumber(endSeconds));
    const duration = Math.max(0, finiteNumber(durationSeconds));
    if (end <= start + 1) return { ok: false, reason: "B 点必须至少比 A 点晚 1 秒" };
    if (duration > 0 && end > duration + 0.25) return { ok: false, reason: "B 点超过当前片源时长" };
    return { ok: true, startSeconds: start, endSeconds: end, reason: "" };
  }

  function minutesFromClock(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return 0;
    return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
  }

  function nextWindowOpenAt(policy, timestamp) {
    if (policy?.windowEnabled !== true || withinDownloadWindow(policy, timestamp)) return timestamp;
    const startMinute = minutesFromClock(policy.windowStart);
    const date = new Date(timestamp);
    const candidate = new Date(date);
    candidate.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
    if (candidate.getTime() <= timestamp) candidate.setDate(candidate.getDate() + 1);
    return candidate.getTime();
  }

  function withinDownloadWindow(policy, now = Date.now()) {
    if (policy?.windowEnabled !== true) return true;
    const start = minutesFromClock(policy.windowStart);
    const end = minutesFromClock(policy.windowEnd);
    const date = new Date(now);
    const minute = date.getHours() * 60 + date.getMinutes();
    if (start === end) return true;
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
  }

  function selectDueDownloads(downloadTasks = {}, policy = {}, now = Date.now()) {
    const normalizedPolicy = normalizeExperienceState({ downloadPolicy: policy }).downloadPolicy;
    if (normalizedPolicy.queuePaused) return [];
    if (!withinDownloadWindow(normalizedPolicy, now)) return [];
    const active = Object.values(downloadTasks || {}).filter((task) => RUNNING_DOWNLOAD_STAGES.has(String(task?.stage || ""))).length;
    const available = Math.max(0, normalizedPolicy.maxConcurrent - active);
    if (!available) return [];
    return Object.values(downloadTasks || {})
      .filter((task) => String(task?.stage || "") === "queued")
      .filter((task) => !task?.notBefore || (Date.parse(String(task.notBefore)) || 0) <= now)
      .sort((left, right) => {
        const priority = PRIORITY_ORDER[normalizePriority(left?.priority)] - PRIORITY_ORDER[normalizePriority(right?.priority)];
        if (priority) return priority;
        return (Date.parse(String(left?.createdAt || left?.updatedAt || "")) || 0)
          - (Date.parse(String(right?.createdAt || right?.updatedAt || "")) || 0);
      })
      .slice(0, available);
  }

  function nextDownloadAlarmAt(downloadTasks = {}, policy = {}, now = Date.now()) {
    const normalizedPolicy = normalizeExperienceState({ downloadPolicy: policy }).downloadPolicy;
    if (normalizedPolicy.queuePaused) return 0;
    const candidates = Object.values(downloadTasks || {})
      .filter((task) => String(task?.stage || "") === "queued")
      .map((task) => {
        const parsed = Date.parse(String(task?.notBefore || ""));
        const dueAt = Number.isFinite(parsed) && parsed > now ? parsed : now;
        const wakeAt = nextWindowOpenAt(normalizedPolicy, dueAt);
        // 已到期且当前就在下载窗口内时应立即调度，不再制造 1 秒循环 alarm。
        return wakeAt <= now ? 0 : wakeAt;
      })
      .filter((value) => value > now);
    return candidates.length ? Math.min(...candidates) : 0;
  }

  function classifyHealthFailure(error = {}) {
    const status = Number(error.status || error.statusCode || 0);
    const code = safeText(error.code, 80).toLowerCase();
    const message = safeText(error.message || error, 300).toLowerCase();
    const credentialPattern = /(401|403|token|凭据|密码|身份不匹配|登录|未授权|forbidden|unauthorized|二维码.*失效)/i;
    return status === 401 || status === 403 || credentialPattern.test(`${code} ${message}`) ? "credential" : "network";
  }

  function applyHealthResult(record, result = {}, now = Date.now()) {
    const current = normalizeAccountHealthRecord(record || { accountId: result.accountId }, result.accountId);
    if (!current) throw new Error("账号巡检结果缺少账号编号");
    const checkedAt = nowIso(now);
    if (result.ok === true) {
      return {
        ...current,
        state: "healthy",
        consecutiveFailures: 0,
        lastCheckedAt: checkedAt,
        cooldownUntil: "",
        lastReason: "",
        history: [...current.history, { checkedAt, ok: true, category: "ok", reason: "" }].slice(-10)
      };
    }
    const category = result.category || classifyHealthFailure(result.error || result);
    const failures = current.consecutiveFailures + 1;
    const reason = safeText(result.reason || result.error?.message || result.message || "验证失败", 180);
    let cooldownMs = 0;
    let state = "degraded";
    if (category === "credential") {
      cooldownMs = 24 * 60 * 60 * 1000;
      state = "needs_attention";
    } else if (failures === 2) {
      cooldownMs = 15 * 60 * 1000;
      state = "cooling";
    } else if (failures === 3) {
      cooldownMs = 60 * 60 * 1000;
      state = "cooling";
    } else if (failures >= 4) {
      cooldownMs = 6 * 60 * 60 * 1000;
      state = "cooling";
    }
    return {
      ...current,
      state,
      consecutiveFailures: failures,
      lastCheckedAt: checkedAt,
      cooldownUntil: cooldownMs ? nowIso(now + cooldownMs) : "",
      lastReason: reason,
      history: [...current.history, { checkedAt, ok: false, category, reason }].slice(-10)
    };
  }

  function accountIsCooling(record, now = Date.now()) {
    const until = Date.parse(String(record?.cooldownUntil || ""));
    return Number.isFinite(until) && until > now;
  }

  function pushAlert(state, raw = {}, now = Date.now()) {
    const next = normalizeExperienceState(state);
    const key = safeText(raw.key, 160) || `${safeText(raw.category, 40)}:${safeText(raw.title, 100)}`;
    const existing = next.alerts.find((item) => item.key === key && !item.readAt);
    if (existing) {
      existing.count += 1;
      existing.detail = safeText(raw.detail || existing.detail, 300);
      existing.level = ["info", "warning", "error", "success"].includes(raw.level) ? raw.level : existing.level;
      existing.createdAt = nowIso(now);
      return next;
    }
    next.alerts = [...next.alerts, {
      id: safeText(raw.id, 100) || `alert_${now}_${Math.random().toString(16).slice(2)}`,
      key,
      category: safeText(raw.category, 40) || "system",
      level: ["info", "warning", "error", "success"].includes(raw.level) ? raw.level : "info",
      title: safeText(raw.title, 100) || "糖糖提醒",
      detail: safeText(raw.detail, 300),
      createdAt: nowIso(now),
      readAt: "",
      count: 1
    }].slice(-MAX_ALERTS);
    return next;
  }

  root.TxzzExperienceCore = Object.freeze({
    EXPERIENCE_SCHEMA_VERSION,
    MAX_ALERTS,
    MAX_BOOKMARKS_PER_MOVIE,
    MAX_BOOKMARKS_TOTAL,
    MAX_LIBRARY_ITEMS,
    accountIsCooling,
    addBookmark,
    applyHealthResult,
    classifyHealthFailure,
    defaultExperienceState,
    normalizeExperienceState,
    normalizePriority,
    nextDownloadAlarmAt,
    pushAlert,
    removeBookmark,
    selectDueDownloads,
    selectLibrary,
    updateLibraryEntry,
    validateLoopRange,
    withinDownloadWindow
  });
})(globalThis);
