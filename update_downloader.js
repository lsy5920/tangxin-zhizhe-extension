(() => {
  "use strict";

  const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
  const CRX_MIME_TYPE = "application/x-chrome-extension";

  function decodeBase64Bytes(value = "") {
    const base64 = String(value || "").replace(/\s+/g, "");
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error("已验证安装包的 Base64 数据无效");
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function safeCrxFilename(value = "") {
    const filename = String(value || "糖心志者最新版.crx").replace(/\\/g, "/");
    if (
      !filename.toLowerCase().endsWith(".crx")
      || filename.startsWith("/")
      || filename.split("/").length !== 1
      || filename.includes("\0")
    ) {
      throw new Error("安装包文件名无效");
    }
    return filename;
  }

  function assertCrx3Header(bytes) {
    if (bytes.length < 12) throw new Error("安装包过短，不是完整 CRX3");
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
    if (magic !== "Cr24" || version !== 3) throw new Error("安装包文件头不是 CRX3");
  }

  async function sha256Hex(bytes, cryptoRef = globalThis.crypto) {
    if (!cryptoRef?.subtle?.digest) throw new Error("当前浏览器不支持安装包哈希复核");
    const digest = new Uint8Array(await cryptoRef.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function verifyClientSavePayload(message = {}, environment = {}) {
    const bytes = decodeBase64Bytes(message.base64);
    const expectedSize = Number(message.expectedSize || 0);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_PACKAGE_BYTES) {
      throw new Error("已验证安装包的预期字节数无效");
    }
    if (bytes.length !== expectedSize) {
      throw new Error(`安装包字节数不一致：收到 ${bytes.length}，预期 ${expectedSize}`);
    }
    assertCrx3Header(bytes);

    const expectedSha256 = String(message.expectedSha256 || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("安装包缺少有效 SHA-256");
    const actualSha256 = await sha256Hex(bytes, environment.crypto || globalThis.crypto);
    if (actualSha256 !== expectedSha256) throw new Error("安装包在页面保存前的 SHA-256 复核失败");

    return {
      bytes,
      filename: safeCrxFilename(message.filename),
      sha256: actualSha256
    };
  }

  async function saveVerifiedPackage(message = {}, environment = {}) {
    const verified = await verifyClientSavePayload(message, environment);
    const documentRef = environment.document || globalThis.document;
    const urlRef = environment.URL || globalThis.URL;
    const BlobRef = environment.Blob || globalThis.Blob;
    const timeout = environment.setTimeout || globalThis.setTimeout;
    const parent = documentRef?.body || documentRef?.documentElement;
    if (!documentRef?.createElement || !parent?.appendChild || !urlRef?.createObjectURL || !BlobRef) {
      throw new Error("当前页面无法创建浏览器下载任务");
    }

    const objectUrl = urlRef.createObjectURL(new BlobRef([verified.bytes], { type: CRX_MIME_TYPE }));
    const anchor = documentRef.createElement("a");
    try {
      anchor.href = objectUrl;
      anchor.download = verified.filename;
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "none";
      parent.appendChild(anchor);
      // 部分 Android Chromium 的离屏页没有 downloads API，但普通网页仍支持 Blob 下载。
      // 在隔离世界创建并点击临时链接，可继续保存后台已经完整验签的同一份字节。
      anchor.click();
    } catch (error) {
      urlRef.revokeObjectURL?.(objectUrl);
      throw error;
    } finally {
      anchor.remove?.();
    }
    timeout?.(() => urlRef.revokeObjectURL?.(objectUrl), 60_000);

    return {
      ok: true,
      downloadId: 0,
      filename: verified.filename,
      bytes: verified.bytes.length,
      verifiedSha256: verified.sha256,
      state: "submitted",
      saveVia: "content-blob"
    };
  }

  globalThis.TxzzUpdateDownloader = Object.freeze({
    decodeBase64Bytes,
    safeCrxFilename,
    verifyClientSavePayload,
    saveVerifiedPackage
  });
})();
