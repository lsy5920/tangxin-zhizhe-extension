"use strict";

(function installCinemaPosterCore(root) {
  const POSTER_KEY_TEXT = "525202f9149e061d";
  const AES_BLOCK_BYTES = 16;
  const MAX_ENCRYPTED_BYTES = 6 * 1024 * 1024;
  const MIME_TYPES = Object.freeze({
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  });

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("海报密文必须是二进制数据");
  }

  function concatBytes(left, right) {
    const output = new Uint8Array(left.length + right.length);
    output.set(left);
    output.set(right, left.length);
    return output;
  }

  function describeEncryptedPosterUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      if (parsed.protocol !== "https:" || !parsed.pathname.toLowerCase().endsWith(".bnc")) return null;
      const hostname = parsed.hostname.toLowerCase();
      const ipv4 = hostname.split(".").map(Number);
      const privateIpv4 = ipv4.length === 4
        && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
        && (
          ipv4[0] === 10
          || ipv4[0] === 127
          || (ipv4[0] === 169 && ipv4[1] === 254)
          || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
          || (ipv4[0] === 192 && ipv4[1] === 168)
        );
      if (
        !hostname
        || hostname === "localhost"
        || hostname.endsWith(".localhost")
        || hostname.endsWith(".local")
        || hostname.includes(":")
        || privateIpv4
      ) return null;
      const rawExtension = parsed.searchParams.get("ext") || "png";
      const extension = decodeURIComponent(rawExtension)
        .replace(/,/g, "")
        .trim()
        .toLowerCase()
        .replace(/^\.+/, "");
      const mimeType = MIME_TYPES[extension];
      if (!mimeType) return null;
      return { url: parsed.href, extension: extension === "jpeg" ? "jpg" : extension, mimeType };
    } catch (_) {
      return null;
    }
  }

  function sniffImageMimeType(bytes) {
    const input = asBytes(bytes);
    if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return "image/jpeg";
    if (
      input.length >= 8
      && input[0] === 0x89
      && input[1] === 0x50
      && input[2] === 0x4e
      && input[3] === 0x47
      && input[4] === 0x0d
      && input[5] === 0x0a
      && input[6] === 0x1a
      && input[7] === 0x0a
    ) return "image/png";
    const prefix = new TextDecoder("ascii").decode(input.subarray(0, 12));
    if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
    if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") return "image/webp";
    return "";
  }

  function removePkcs7Padding(bytes) {
    const input = asBytes(bytes);
    const padding = input[input.length - 1];
    if (!padding || padding > AES_BLOCK_BYTES || padding > input.length) {
      throw new Error("海报解密后的 PKCS7 填充无效");
    }
    for (let index = input.length - padding; index < input.length; index += 1) {
      if (input[index] !== padding) throw new Error("海报解密后的 PKCS7 填充不一致");
    }
    return input.slice(0, input.length - padding);
  }

  async function decryptEcbCiphertext(subtle, key, encrypted) {
    // Web Crypto 没有 AES-ECB。先追加一个 CBC 密文块，使最后一块明文恰好是完整
    // PKCS7 填充；一次 CBC 解密即可处理整张海报，再异或前一密文块还原每个 ECB 明文块。
    const paddingBlock = new Uint8Array(AES_BLOCK_BYTES);
    paddingBlock.fill(AES_BLOCK_BYTES);
    const lastBlock = encrypted.slice(-AES_BLOCK_BYTES);
    const encryptedPadding = new Uint8Array(await subtle.encrypt(
      { name: "AES-CBC", iv: lastBlock },
      key,
      paddingBlock
    )).slice(0, AES_BLOCK_BYTES);
    const cbcPlain = new Uint8Array(await subtle.decrypt(
      { name: "AES-CBC", iv: new Uint8Array(AES_BLOCK_BYTES) },
      key,
      concatBytes(encrypted, encryptedPadding)
    ));
    if (cbcPlain.length !== encrypted.length) throw new Error("海报 AES 数据块长度异常");
    const ecbPlain = new Uint8Array(cbcPlain.length);
    for (let index = 0; index < cbcPlain.length; index += 1) {
      ecbPlain[index] = index < AES_BLOCK_BYTES
        ? cbcPlain[index]
        : cbcPlain[index] ^ encrypted[index - AES_BLOCK_BYTES];
    }
    return ecbPlain;
  }

  async function decryptPosterBytes(value, cryptoProvider = root.crypto) {
    const encrypted = asBytes(value);
    if (!encrypted.length || encrypted.length > MAX_ENCRYPTED_BYTES || encrypted.length % AES_BLOCK_BYTES !== 0) {
      throw new Error("加密海报大小或分块格式无效");
    }
    const subtle = cryptoProvider?.subtle;
    if (!subtle) throw new Error("当前浏览器缺少 Web Crypto，不能解密影院海报");
    const key = await subtle.importKey(
      "raw",
      new TextEncoder().encode(POSTER_KEY_TEXT),
      "AES-CBC",
      false,
      ["encrypt", "decrypt"]
    );
    const decrypted = await decryptEcbCiphertext(subtle, key, encrypted);
    const plain = removePkcs7Padding(decrypted);
    const mimeType = sniffImageMimeType(plain);
    if (!mimeType) throw new Error("海报解密成功但图片格式不受支持");
    return { bytes: plain, mimeType };
  }

  function bytesToBase64(value) {
    const bytes = asBytes(value);
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    }
    return btoa(chunks.join(""));
  }

  function toDataUrl(value, mimeType) {
    const normalizedMime = Object.values(MIME_TYPES).includes(mimeType) ? mimeType : sniffImageMimeType(value);
    if (!normalizedMime) throw new Error("海报图片类型无效");
    return `data:${normalizedMime};base64,${bytesToBase64(value)}`;
  }

  root.TxzzCinemaPosterCore = Object.freeze({
    AES_BLOCK_BYTES,
    MAX_ENCRYPTED_BYTES,
    decryptPosterBytes,
    describeEncryptedPosterUrl,
    sniffImageMimeType,
    toDataUrl
  });
})(globalThis);
