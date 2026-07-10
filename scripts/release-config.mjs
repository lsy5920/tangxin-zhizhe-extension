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

export const EXPECTED_EXTENSION_ID = "ghbbddahmhhmjknofkmdkcflbmplcace";
export const UPDATE_SCHEMA_VERSION = 3;
export const UPDATE_SIGNATURE_ALGORITHM = "RSASSA-PKCS1-v1_5-SHA-256";
export const UPDATE_PUBLIC_KEY_SHA256 = "67113307c77c9ade5ac3a25b1cfb2024c14cc6f3c2af43eb8207b1ad9d418884";
export const UPDATE_PUBLIC_KEY_ID = `sha256:${UPDATE_PUBLIC_KEY_SHA256}`;
export const UPDATE_PUBLIC_KEY_SPKI_BASE64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqz6ArUCAkJqEzJr11PywW2T1H8j8/XLRuWn2qp+8qs8i0BiTiHzXjYT/BCTjLG85bx+fy7Z+V2rbveK+YO2arF+iRIR9BG2KhdJJJGXvFtFOI8Z2YzH/jeELt31xeH1Xo/e/63b+mduw2qIOmG68LgHYrysmgqQCmweurz+mYXuwTNt8+CFf961HZz3HT+aIsQ7Axh12YbItOmt2rCVoeGXGVGNlP1uG1Xf/2xnWzAVj2s4m9E3/dAQz3RMFCHJUEMrorC7GXj9JIfgYJmuKNB+EB5rwxBC3Eg6JwmU5fzcUP/Nf5gj/lz6YeJbftkvPKw80FtFuCf9MpX0iY4umaQIDAQAB";

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
