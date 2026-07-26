/**
 * 发布链共享常量。
 *
 * 私钥绝不进入该文件；这里只固定可公开的身份、公钥和正式分发路径，供打包与发布门禁复用。
 */
export const RELEASE_INCLUDE_PATHS = [
  "manifest.json",
  "background.js",
  "content.js",
  "display_patch.js",
  "nav_guard.js",
  "page_hook.js",
  "page_probe.js",
  "offscreen.html",
  "offscreen_downloader.js",
  "README.md",
  "dist-ui",
  "vendor"
];

export const EXPECTED_EXTENSION_ID = "ddefadnhgebdclpkabeobjidjllkdkhm";
export const UPDATE_SCHEMA_VERSION = 3;
export const UPDATE_SIGNATURE_ALGORITHM = "RSASSA-PKCS1-v1_5-SHA-256";
export const UPDATE_PUBLIC_KEY_SHA256 = "334503d764132bfa014e19839bba3a7cd4d906c74d7c6399c4bfe48975b22f16";
export const UPDATE_PUBLIC_KEY_ID = `sha256:${UPDATE_PUBLIC_KEY_SHA256}`;
export const UPDATE_PUBLIC_KEY_SPKI_BASE64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAscmukzGVUcjGOVpaoAKPaNtwf6mRUhZmrcsSQuewQgs2Qi9UmEE8jQMkbL56u+zxvWpDUWroUjzVhZ0WV6tcoH+Z85VbnNx6ErN6vpG/Hklda4k7odfLum+iQcPoS0t39t7XSuV3nqohhnAN8jmeh12crWyq0IM6pkc/2dKEkmKYX81lqtU+ZxvQQWkywAbV6ceBg0sw4PwZEsIbH3jMhtgBRYEpuaTrfMP63Uyfv8oTISCzpTHYY1wNwu3fJMf52VB95Ocqy2pKxEwlBDEtjG6aO5/olU7k20Mkbd0u8l+FjQgvYp8PTeagxtH1G5tO38MxK9qegttaI8Xgo/IjqwIDAQAB";

export const OFFICIAL_PACKAGE_URLS = [
  "https://github.com/lsy5920/tangxin-zhizhe-extension/raw/main/releases/tangxin-zhizhe-latest.crx",
  "https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/releases/tangxin-zhizhe-latest.crx",
  "https://cdn.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/releases/tangxin-zhizhe-latest.crx",
  "https://fastly.jsdelivr.net/gh/lsy5920/tangxin-zhizhe-extension@main/releases/tangxin-zhizhe-latest.crx",
  "https://ghproxy.net/https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/releases/tangxin-zhizhe-latest.crx"
];

/** 对 JSON 做递归键排序，Node 与浏览器必须得到完全相同的签名正文。 */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("签名清单不能包含非有限数字");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`签名清单包含不支持的值类型：${typeof value}`);
}

/** `signature` 本身不参与签名，其余字段（包括安装包哈希）全部纳入。 */
export function updateManifestSigningText(manifest = {}) {
  const { signature: _signature, ...unsignedManifest } = manifest;
  return canonicalJson(unsignedManifest);
}
