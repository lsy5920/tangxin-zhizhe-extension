"use strict";

(function installDownloadCore(root) {
  const LIMITS = Object.freeze({
    manifestBytes: 2 * 1024 * 1024,
    segmentBytes: 128 * 1024 * 1024,
    taskBytes: 8 * 1024 * 1024 * 1024,
    requestTimeoutMs: 20_000,
    segmentRetries: 3
  });

  function absoluteUrl(value, baseUrl) {
    try {
      return new URL(String(value || ""), baseUrl).href;
    } catch (_) {
      return String(value || "");
    }
  }

  function ivWordsToBytes(value) {
    if (!value) return null;
    if (value instanceof Uint8Array) return value.length === 16 ? value : null;
    const words = Array.from(value);
    if (words.length !== 4) return null;
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    words.forEach((word, index) => view.setUint32(index * 4, Number(word) >>> 0, false));
    return bytes;
  }

  function sequenceIv(sequence) {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    const numeric = Math.max(0, Number(sequence) || 0);
    // HLS 的隐式 IV 是媒体序列号本身，不是分片数组下标，也不能额外加一。
    view.setUint32(8, Math.floor(numeric / 0x1_0000_0000), false);
    view.setUint32(12, numeric >>> 0, false);
    return bytes;
  }

  function normalizeByteRange(value) {
    const length = Number(value?.length || 0);
    const offset = Number(value?.offset || 0);
    return length > 0 ? { length, offset: Math.max(0, offset) } : null;
  }

  function byteRangeMismatch(message) {
    const error = new Error(message);
    error.code = "TXZZ_RANGE_MISMATCH";
    return error;
  }

  function parseContentRange(value = "") {
    const match = String(value).match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = match[3] === "*" ? 0 : Number(match[3]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
    if (total && (!Number.isSafeInteger(total) || total <= end)) return null;
    return { start, end, total };
  }

  function selectByteRangeBytes(byteRange, responseStatus, contentRange, value) {
    const normalized = normalizeByteRange(byteRange);
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
    if (!normalized) return bytes;

    const expectedStart = normalized.offset;
    const expectedEnd = normalized.offset + normalized.length - 1;
    if (responseStatus === 206) {
      const actual = parseContentRange(contentRange);
      if (!actual || actual.start !== expectedStart || actual.end !== expectedEnd) {
        throw byteRangeMismatch(`分片响应区间不匹配：期望 ${expectedStart}-${expectedEnd}`);
      }
      if (bytes.length !== normalized.length) {
        throw byteRangeMismatch(`分片响应长度不匹配：期望 ${normalized.length}，实际 ${bytes.length}`);
      }
      return bytes;
    }

    if (responseStatus === 200) {
      // 部分源站会忽略 Range。只有完整响应确实覆盖目标区间时才截取；
      // 偏移量非零且响应长度刚好等于分片长度时无法证明它来自正确位置，必须拒绝。
      if (expectedStart === 0 && bytes.length === normalized.length) return bytes;
      if (bytes.length > expectedEnd) {
        const sliced = bytes.slice(expectedStart, expectedEnd + 1);
        if (sliced.length === normalized.length) return sliced;
      }
      throw byteRangeMismatch(`源站忽略 Range 且响应未覆盖 ${expectedStart}-${expectedEnd}`);
    }

    throw byteRangeMismatch(`分片 Range 请求返回了不支持的 HTTP ${responseStatus}`);
  }

  function normalizeKey(value, baseUrl) {
    if (!value?.method || String(value.method).toUpperCase() === "NONE") return null;
    return {
      method: String(value.method).toUpperCase(),
      uri: absoluteUrl(value.uri, baseUrl),
      iv: ivWordsToBytes(value.iv)
    };
  }

  function hasSeparateAudio(manifest, audioGroupId = "") {
    const groups = manifest?.mediaGroups?.AUDIO || {};
    const selectedGroups = audioGroupId && groups[audioGroupId] ? { [audioGroupId]: groups[audioGroupId] } : groups;
    return Object.values(selectedGroups).some((group) => Object.values(group || {}).some((track) => Boolean(track?.uri)));
  }

  function normalizeVariants(manifest, playlistUrl) {
    return (manifest.playlists || []).map((playlist, index) => {
      const attributes = playlist.attributes || {};
      const resolution = attributes.RESOLUTION || {};
      const audioGroup = String(attributes.AUDIO || "");
      return {
        id: `variant-${index + 1}`,
        url: absoluteUrl(playlist.uri, playlistUrl),
        bandwidth: Number(attributes.BANDWIDTH || 0),
        averageBandwidth: Number(attributes["AVERAGE-BANDWIDTH"] || 0),
        width: Number(resolution.width || 0),
        height: Number(resolution.height || 0),
        codecs: String(attributes.CODECS || ""),
        audioGroup,
        separateAudio: hasSeparateAudio(manifest, audioGroup)
      };
    });
  }

  function inferContainer(segments) {
    const values = segments.flatMap((segment) => [segment.url, segment.map?.url]).filter(Boolean).join("\n").toLowerCase();
    if (segments.some((segment) => segment.map) || /\.(?:m4s|mp4)(?:[?#]|$)/i.test(values)) return "fmp4";
    if (/\.ts(?:[?#]|$)/i.test(values)) return "mpeg-ts";
    return "unknown";
  }

  function parsePlaylist(text, playlistUrl, ParserCtor = root.m3u8Parser?.Parser) {
    if (typeof ParserCtor !== "function") throw new Error("m3u8-parser 7.2.0 未加载");
    const parser = new ParserCtor();
    parser.push(String(text || ""));
    parser.end();
    const manifest = parser.manifest || {};
    const variants = normalizeVariants(manifest, playlistUrl);
    const mediaSequence = Number(manifest.mediaSequence || 0);
    const segments = (manifest.segments || []).map((segment, index) => ({
      index,
      sequence: mediaSequence + index,
      url: absoluteUrl(segment.uri, playlistUrl),
      duration: Number(segment.duration || 0),
      byteRange: normalizeByteRange(segment.byterange),
      discontinuity: Boolean(segment.discontinuity),
      timeline: Number(segment.timeline || 0),
      key: normalizeKey(segment.key, playlistUrl),
      map: segment.map ? {
        url: absoluteUrl(segment.map.uri, playlistUrl),
        byteRange: normalizeByteRange(segment.map.byterange),
        key: normalizeKey(segment.map.key, playlistUrl)
      } : null
    }));
    const methods = new Set(segments.flatMap((segment) => [segment.key?.method, segment.map?.key?.method]).filter(Boolean));
    const unsupportedReasons = [];
    if ([...methods].some((method) => method !== "AES-128")) {
      unsupportedReasons.push("检测到 SAMPLE-AES 或其他不支持的加密方式");
    }
    if (segments.some((segment) => segment.map?.key && !segment.map.key.iv)) {
      unsupportedReasons.push("加密初始化段缺少显式 IV，无法安全解密");
    }
    const separateAudio = variants.some((variant) => variant.separateAudio) || (!variants.length && hasSeparateAudio(manifest));
    if (separateAudio) unsupportedReasons.push("清单使用独立音轨，当前版本禁止生成可能静音的文件");
    if (segments.length && manifest.endList !== true) unsupportedReasons.push("检测到直播或仍在更新的清单");
    return {
      playlistUrl,
      mediaSequence,
      endList: manifest.endList === true,
      live: segments.length > 0 && manifest.endList !== true,
      variants,
      segments,
      durationSeconds: Number(segments.reduce((sum, segment) => sum + segment.duration, 0).toFixed(3)),
      container: inferContainer(segments),
      audioMode: separateAudio ? "separate" : "muxed",
      unsupportedReasons
    };
  }

  function chooseVariant(variants = [], options = {}) {
    if (!variants.length) return null;
    const mode = String(options.networkMode || "balanced");
    const requestedHeight = Number(options.height || 0);
    const viewportHeight = Math.max(360, Number(options.viewportHeight || 720));
    let maxHeight = Number.POSITIVE_INFINITY;
    let maxBitrate = Number.POSITIVE_INFINITY;
    if (mode === "data-saver") {
      maxHeight = 720;
      maxBitrate = 2_500_000;
    } else if (mode === "balanced") {
      maxHeight = requestedHeight || viewportHeight;
    } else if (requestedHeight > 0) {
      maxHeight = requestedHeight;
    }
    const ranked = [...variants].sort((left, right) => (left.height - right.height) || (left.bandwidth - right.bandwidth));
    const compatible = ranked.filter((variant) => {
      const heightOk = !variant.height || variant.height <= maxHeight;
      const bitrate = variant.averageBandwidth || variant.bandwidth;
      return heightOk && (!bitrate || bitrate <= maxBitrate);
    });
    return compatible.at(-1) || ranked[0];
  }

  function validatePlan(plan) {
    if (!plan?.segments?.length) throw new Error("播放列表里没有可下载分片");
    if (plan.unsupportedReasons?.length) throw new Error(plan.unsupportedReasons.join("；"));
    return plan;
  }

  root.TxzzDownloadCore = Object.freeze({
    LIMITS,
    absoluteUrl,
    chooseVariant,
    parsePlaylist,
    selectByteRangeBytes,
    sequenceIv,
    validatePlan
  });
})(globalThis);
