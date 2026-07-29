"use strict";

(function installCinemaCatalogCore(root) {
  const CATALOG_SCHEMA_VERSION = 1;
  const DEFAULT_PAGE_SIZE = 24;
  const MAX_PAGE_SIZE = 48;
  const MAX_SECTIONS = 24;
  const MAX_SECTION_ITEMS = 40;
  const MAX_ITEMS = 600;
  const PLAYBACK_FIELD_PATTERN = /(play(?:back)?[_-]?(?:link|url)|backup[_-]?(?:link|url)|m3u8|media[_-]?url|stream[_-]?url|sign(?:ed)?[_-]?url)/i;
  const ORDER_VALUES = new Set(["new", "hot", "click", "love", "favorite", "score"]);
  const PAY_TYPE_VALUES = new Set(["free", "vip", "money", "coin"]);
  const CANVAS_VALUES = new Set(["long", "short", "square", "landscape", "portrait"]);

  function safeText(value, maxLength = 240) {
    return String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveInteger(value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
    const number = Math.floor(finiteNumber(value, fallback));
    return Math.max(0, Math.min(maximum, number));
  }

  function parseDurationSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    const text = safeText(value, 32);
    if (!text) return 0;
    if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Number(text));
    const parts = text.split(":").map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(finiteNumber(seconds)));
    if (!total) return "时长待确认";
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
      : `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function normalizeAssetUrl(value) {
    const text = safeText(value, 1800);
    if (!text) return "";
    try {
      const parsed = new URL(text, "https://txh068.com/");
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function orientationFor(raw = {}) {
    const normalized = safeText(raw.orientation, 24).toLowerCase();
    if (["portrait", "landscape", "square"].includes(normalized)) return normalized;
    const canvas = safeText(raw.canvas, 24).toLowerCase();
    if (["long", "portrait", "vertical"].includes(canvas)) return "portrait";
    if (["short", "landscape", "horizontal"].includes(canvas)) return "landscape";
    if (canvas === "square") return "square";
    const width = finiteNumber(raw.width);
    const height = finiteNumber(raw.height);
    if (width > 0 && height > 0) {
      if (Math.abs(width - height) / Math.max(width, height) < 0.08) return "square";
      return height > width ? "portrait" : "landscape";
    }
    return "portrait";
  }

  function accessFor(raw = {}) {
    const normalized = safeText(raw.access, 24).toLowerCase();
    if (["free", "vip", "coin"].includes(normalized)) return normalized;
    const payType = safeText(raw.pay_type ?? raw.payType, 32).toLowerCase();
    if (["money", "coin", "gold"].includes(payType) || finiteNumber(raw.money) > 0) return "coin";
    if (["vip", "member"].includes(payType)) return "vip";
    return "free";
  }

  /**
   * 目录对象使用显式字段白名单构造，避免上游新增签名地址后被无意持久化。
   * 目录阶段只负责“看见有什么”，完整线路必须等用户点击开映后再获取。
   */
  function normalizeMovie(raw = {}) {
    if (!raw || typeof raw !== "object") return null;
    const id = safeText(raw.id ?? raw.movie_id ?? raw.movieId, 80);
    if (!id) return null;
    const durationSeconds = Math.max(
      parseDurationSeconds(raw.durationSeconds),
      parseDurationSeconds(raw.duration),
      parseDurationSeconds(raw.duration_time),
      parseDurationSeconds(raw.time_length),
      parseDurationSeconds(raw.durationLabel)
    );
    const rawDurationLabel = safeText(raw.durationLabel, 32);
    const upstreamDuration = safeText(raw.duration, 32);
    const durationLabel = rawDurationLabel
      || (upstreamDuration.includes(":") ? upstreamDuration : "")
      || (safeText(raw.duration_time, 32).includes(":") ? safeText(raw.duration_time, 32) : "")
      || formatDuration(durationSeconds);
    const access = accessFor(raw);
    return {
      id,
      title: safeText(raw.name ?? raw.title, 180) || `影片 ${id}`,
      posterUrl: normalizeAssetUrl(raw.posterUrl ?? raw.img ?? raw.image ?? raw.cover ?? raw.poster),
      creator: safeText(raw.creator ?? raw.nickname ?? raw.author_name ?? raw.author, 100) || "糖心创作者",
      avatarUrl: normalizeAssetUrl(raw.avatarUrl ?? raw.headico ?? raw.avatar ?? raw.avatar_url),
      durationSeconds,
      durationLabel,
      orientation: orientationFor(raw),
      access,
      price: access === "coin" ? Math.max(0, finiteNumber(raw.money ?? raw.price)) : 0,
      views: safeText(raw.click ?? raw.views, 40),
      likes: safeText(raw.love ?? raw.likes, 40),
      favorites: safeText(raw.favorite ?? raw.favorites, 40),
      score: safeText(raw.score, 24),
      publishedAt: safeText(raw.publishedAt ?? raw.time ?? raw.created_at ?? raw.published_at, 48),
      badge: safeText(raw.icon ?? raw.badge, 48)
    };
  }

  function parseSectionFilter(value) {
    let parsed = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch (_) {
        parsed = {};
      }
    }
    return buildSearchParams(parsed && typeof parsed === "object" ? parsed : {}, { includePage: false });
  }

  function appendUniqueMovies(existing = [], incoming = [], maximum = MAX_ITEMS) {
    const result = [];
    const seen = new Set();
    for (const raw of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      const movie = normalizeMovie(raw);
      if (!movie || seen.has(movie.id)) continue;
      seen.add(movie.id);
      result.push(movie);
      if (result.length >= maximum) break;
    }
    return result;
  }

  function normalizeSection(raw = {}) {
    if (!raw || typeof raw !== "object") return null;
    const id = safeText(raw.id ?? raw.block_id, 80);
    const style = finiteNumber(raw.style, 0);
    if (!id || style < 0) return null;
    const items = appendUniqueMovies([], raw.items ?? raw.list ?? raw.movies, MAX_SECTION_ITEMS);
    if (!items.length) return null;
    return {
      id,
      title: safeText(raw.name ?? raw.title, 100) || "本期推荐",
      filter: parseSectionFilter(raw.filter ?? raw.params),
      items
    };
  }

  function unwrapDiscoverBlocks(raw) {
    if (Array.isArray(raw)) return raw;
    for (const candidate of [raw?.blocks, raw?.items, raw?.list, raw?.data, raw?.data?.blocks, raw?.data?.list]) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function normalizeDiscoverResponse(raw) {
    const sections = [];
    const seen = new Set();
    for (const candidate of unwrapDiscoverBlocks(raw)) {
      const section = normalizeSection(candidate);
      if (!section || seen.has(section.id)) continue;
      seen.add(section.id);
      sections.push(section);
      if (sections.length >= MAX_SECTIONS) break;
    }
    return {
      sections,
      items: appendUniqueMovies([], sections.flatMap((section) => section.items), MAX_ITEMS)
    };
  }

  function readSearchItems(raw) {
    if (Array.isArray(raw)) return raw;
    for (const candidate of [
      raw?.items,
      raw?.list,
      raw?.rows,
      raw?.movies,
      raw?.data?.items,
      raw?.data?.list,
      raw?.data?.rows,
      raw?.result?.list
    ]) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function readSearchTotal(raw) {
    for (const candidate of [raw?.total, raw?.count, raw?.data?.total, raw?.data?.count, raw?.result?.total]) {
      const total = Number(candidate);
      if (Number.isFinite(total) && total >= 0) return total;
    }
    return null;
  }

  function normalizeSearchResponse(raw, options = {}) {
    const page = Math.max(1, positiveInteger(options.page, 1));
    const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, positiveInteger(options.pageSize, DEFAULT_PAGE_SIZE)));
    const items = appendUniqueMovies([], readSearchItems(raw), MAX_ITEMS);
    const total = readSearchTotal(raw);
    return {
      items,
      page,
      pageSize,
      total,
      hasMore: total === null ? items.length >= pageSize : page * pageSize < total
    };
  }

  function safeId(value) {
    const text = safeText(value, 80);
    return /^\d{1,20}$/.test(text) ? text : "";
  }

  function buildSearchParams(raw = {}, options = {}) {
    const output = {};
    const keywords = safeText(raw.keywords ?? raw.query, 80);
    if (keywords) output.keywords = keywords;
    const order = safeText(raw.order, 24).toLowerCase();
    if (ORDER_VALUES.has(order)) output.order = order;
    let payType = safeText(raw.pay_type ?? raw.payType, 24).toLowerCase();
    if (payType === "coin") payType = "money";
    if (PAY_TYPE_VALUES.has(payType)) output.pay_type = payType;
    let canvas = safeText(raw.canvas, 24).toLowerCase();
    if (canvas === "portrait") canvas = "long";
    if (canvas === "landscape") canvas = "short";
    if (CANVAS_VALUES.has(canvas)) output.canvas = canvas;
    const tagId = safeId(raw.tag_id ?? raw.tagId);
    if (tagId) output.tag_id = tagId;
    const categoryId = safeId(raw.cat_id ?? raw.categoryId ?? raw.category_id);
    if (categoryId) output.cat_id = categoryId;
    const position = safeText(raw.position, 24);
    if (/^[a-z0-9_-]{1,24}$/i.test(position)) output.position = position;
    if (options.includePage !== false) {
      output.page = Math.max(1, positiveInteger(raw.page, 1));
      output.page_size = Math.max(1, Math.min(MAX_PAGE_SIZE, positiveInteger(raw.page_size ?? raw.pageSize, DEFAULT_PAGE_SIZE)));
    }
    return output;
  }

  function catalogQueryKey(input = {}) {
    const mode = ["discover", "browse", "search"].includes(input.mode) ? input.mode : "discover";
    const params = mode === "discover"
      ? { position: safeText(input.position, 32) || "app_home_tj" }
      : buildSearchParams({ ...(input.filters || {}), keywords: input.query, page: 1, page_size: input.pageSize });
    return `${mode}:${JSON.stringify(Object.keys(params).sort().reduce((result, key) => {
      result[key] = params[key];
      return result;
    }, {}))}`;
  }

  function defaultCatalogState() {
    return {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      mode: "discover",
      phase: "idle",
      requestId: "",
      query: "",
      queryKey: "discover:{\"position\":\"app_home_tj\"}",
      filters: {},
      sections: [],
      items: [],
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      hasMore: false,
      fetchedAt: "",
      error: ""
    };
  }

  function normalizeCatalogState(raw = {}) {
    const base = defaultCatalogState();
    const mode = ["discover", "browse", "search"].includes(raw.mode) ? raw.mode : base.mode;
    const phase = ["idle", "loading", "loading-more", "ready", "error"].includes(raw.phase) ? raw.phase : base.phase;
    const filters = buildSearchParams(raw.filters || {}, { includePage: false });
    return {
      ...base,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      mode,
      phase,
      requestId: safeText(raw.requestId, 100),
      query: safeText(raw.query, 80),
      queryKey: safeText(raw.queryKey, 400) || base.queryKey,
      filters,
      sections: normalizeDiscoverResponse(raw.sections).sections,
      items: appendUniqueMovies([], raw.items, MAX_ITEMS),
      page: positiveInteger(raw.page, 0),
      pageSize: Math.max(1, Math.min(MAX_PAGE_SIZE, positiveInteger(raw.pageSize, DEFAULT_PAGE_SIZE))),
      hasMore: raw.hasMore === true,
      fetchedAt: safeText(raw.fetchedAt, 48),
      error: safeText(raw.error, 300)
    };
  }

  function containsPlaybackField(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(containsPlaybackField);
    return Object.entries(value).some(([key, nested]) => PLAYBACK_FIELD_PATTERN.test(key) || containsPlaybackField(nested));
  }

  root.TxzzCinemaCatalogCore = Object.freeze({
    CATALOG_SCHEMA_VERSION,
    DEFAULT_PAGE_SIZE,
    MAX_ITEMS,
    appendUniqueMovies,
    buildSearchParams,
    catalogQueryKey,
    containsPlaybackField,
    defaultCatalogState,
    formatDuration,
    normalizeCatalogState,
    normalizeDiscoverResponse,
    normalizeMovie,
    normalizeSearchResponse,
    normalizeSection,
    parseDurationSeconds
  });
})(globalThis);
