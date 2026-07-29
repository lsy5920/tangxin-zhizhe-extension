/**
 * 发布一致性与供应链门禁。
 *
 * 源码模式检查身份、版本、签名清单结构与正式分发路径；完整模式额外验证：
 * 1. update.json 的固定公钥签名；
 * 2. CRX3 自身签名、扩展 ID、大小与 SHA-256；
 * 3. CRX 内 ZIP 中央目录、CRC32，并把每个运行时文件与当前工作区逐字节核对。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXTENSION_ID,
  OFFICIAL_PACKAGE_URLS,
  RELEASE_INCLUDE_PATHS,
  UPDATE_PUBLIC_KEY_ID,
  UPDATE_PUBLIC_KEY_SHA256,
  UPDATE_PUBLIC_KEY_SPKI_BASE64,
  UPDATE_SCHEMA_VERSION,
  UPDATE_SIGNATURE_ALGORITHM,
  updateManifestSigningText
} from "./release-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const sourceOnly = process.argv.includes("--source-only");
const errors = [];

function file(rel) {
  return path.join(ROOT, rel);
}

function normalizeRel(rel) {
  return String(rel).replaceAll("\\", "/").replace(/^\.\//, "");
}

function readText(rel) {
  try {
    return fs.readFileSync(file(rel), "utf8");
  } catch (error) {
    errors.push(`${rel} 无法读取：${error?.message || error}`);
    return "";
  }
}

function readJson(rel) {
  const text = readText(rel);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${rel} 不是合法 JSON：${error?.message || error}`);
    return {};
  }
}

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function matchValue(text, pattern, label) {
  const value = text.match(pattern)?.[1] || "";
  expect(Boolean(value), `${label} 未找到`);
  return value;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function extensionIdFromPublicKey(publicKeyDer) {
  const prefix = crypto.createHash("sha256").update(publicKeyDer).digest().subarray(0, 16);
  let id = "";
  for (const byte of prefix) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

function sameStringArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((item, index) => item === expected[index]);
}

function readVarint(buffer, start) {
  let value = 0;
  let multiplier = 1;
  let offset = start;
  for (let count = 0; count < 8; count += 1) {
    if (offset >= buffer.length) throw new Error("Protobuf varint 越界");
    const byte = buffer[offset++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, offset };
    multiplier *= 128;
  }
  throw new Error("Protobuf varint 过长");
}

function protobufLengthFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const field = Math.floor(tag.value / 8);
    const wireType = tag.value & 7;
    if (!field) throw new Error("Protobuf 字段编号无效");
    if (wireType === 2) {
      const lengthValue = readVarint(buffer, offset);
      offset = lengthValue.offset;
      const end = offset + lengthValue.value;
      if (end > buffer.length) throw new Error("Protobuf 长度字段越界");
      const values = fields.get(field) || [];
      values.push(buffer.subarray(offset, end));
      fields.set(field, values);
      offset = end;
    } else if (wireType === 0) {
      offset = readVarint(buffer, offset).offset;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      throw new Error(`不支持的 Protobuf wire type ${wireType}`);
    }
    if (offset > buffer.length) throw new Error("Protobuf 字段越界");
  }
  return fields;
}

function verifyCrx(buffer, label, pinnedPublicDer) {
  if (buffer.length < 16) throw new Error(`${label} 文件过短`);
  if (buffer.subarray(0, 4).toString("ascii") !== "Cr24") throw new Error(`${label} 文件头不是 Cr24`);
  const version = buffer.readUInt32LE(4);
  if (version === 2) {
    const publicKeyLength = buffer.readUInt32LE(8);
    const signatureLength = buffer.readUInt32LE(12);
    const zipOffset = 16 + publicKeyLength + signatureLength;
    if (!publicKeyLength || !signatureLength || zipOffset + 4 > buffer.length) {
      throw new Error(`${label} CRX2 头长度无效`);
    }
    const publicDer = buffer.subarray(16, 16 + publicKeyLength);
    const signature = buffer.subarray(16 + publicKeyLength, zipOffset);
    if (!publicDer.equals(pinnedPublicDer)) throw new Error(`${label} CRX2 公钥与正式公钥不一致`);
    const publicKey = crypto.createPublicKey({ key: publicDer, format: "der", type: "spki" });
    if (!crypto.verify("sha1", buffer.subarray(zipOffset), publicKey, signature)) {
      throw new Error(`${label} CRX2 签名无效`);
    }
    return { version, zipOffset, extensionId: extensionIdFromPublicKey(publicDer) };
  }
  if (version !== 3) throw new Error(`${label} CRX 版本 ${version} 不受支持`);

  const headerLength = buffer.readUInt32LE(8);
  const zipOffset = 12 + headerLength;
  if (!headerLength || zipOffset + 4 > buffer.length) throw new Error(`${label} CRX3 头长度超出文件大小`);
  const headerFields = protobufLengthFields(buffer.subarray(12, zipOffset));
  const proof = headerFields.get(2)?.[0];
  const signedHeaderData = headerFields.get(10000)?.[0];
  if (!proof || !signedHeaderData) throw new Error(`${label} CRX3 缺少 RSA proof 或 signed_header_data`);
  const proofFields = protobufLengthFields(proof);
  const publicDer = proofFields.get(1)?.[0];
  const signature = proofFields.get(2)?.[0];
  const crxId = protobufLengthFields(signedHeaderData).get(1)?.[0];
  if (!publicDer || !signature || !crxId || crxId.length !== 16) throw new Error(`${label} CRX3 身份字段不完整`);
  if (!publicDer.equals(pinnedPublicDer)) throw new Error(`${label} CRX3 公钥与正式公钥不一致`);
  const expectedCrxId = crypto.createHash("sha256").update(publicDer).digest().subarray(0, 16);
  if (!crxId.equals(expectedCrxId)) throw new Error(`${label} CRX3 crx_id 与公钥不一致`);

  const size = Buffer.alloc(4);
  size.writeUInt32LE(signedHeaderData.length);
  const signedBytes = Buffer.concat([
    Buffer.from("CRX3 SignedData\0", "ascii"),
    size,
    signedHeaderData,
    buffer.subarray(zipOffset)
  ]);
  const publicKey = crypto.createPublicKey({ key: publicDer, format: "der", type: "spki" });
  if (!crypto.verify("sha256", signedBytes, { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, signature)) {
    throw new Error(`${label} CRX3 签名无效`);
  }
  return { version, zipOffset, extensionId: extensionIdFromPublicKey(publicDer) };
}

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(zip) {
  const minimum = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= minimum; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP 缺少中央目录结束记录");
}

function extractZipEntries(zip) {
  const eocd = findEndOfCentralDirectory(zip);
  const disk = zip.readUInt16LE(eocd + 4);
  const centralDisk = zip.readUInt16LE(eocd + 6);
  const entriesOnDisk = zip.readUInt16LE(eocd + 8);
  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  const commentLength = zip.readUInt16LE(eocd + 20);
  if (disk || centralDisk || entriesOnDisk !== entryCount) throw new Error("不支持多磁盘 ZIP");
  if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) throw new Error("当前发布包不应使用 ZIP64");
  if (eocd + 22 + commentLength !== zip.length) throw new Error("ZIP 结束记录或注释长度无效");
  if (centralOffset + centralSize > eocd) throw new Error("ZIP 中央目录范围越界");

  const entries = new Map();
  const caseFoldedNames = new Set();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`ZIP 第 ${index + 1} 个中央目录项无效`);
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const expectedCrc = zip.readUInt32LE(offset + 16);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const entryCommentLength = zip.readUInt16LE(offset + 32);
    const externalAttributes = zip.readUInt32LE(offset + 38);
    const localOffset = zip.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + entryCommentLength > zip.length) throw new Error("ZIP 中央目录文件名越界");
    const name = normalizeRel(zip.subarray(nameStart, nameEnd).toString((flags & 0x800) ? "utf8" : "utf8"));
    offset = nameEnd + extraLength + entryCommentLength;
    if (!name || name.includes("\0") || name.startsWith("/") || name.split("/").includes("..")) throw new Error(`ZIP 包含不安全路径：${name}`);
    if (flags & 1) throw new Error(`ZIP 文件被加密：${name}`);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error(`ZIP 不允许符号链接：${name}`);
    if (name.endsWith("/")) continue;
    if (entries.has(name)) throw new Error(`ZIP 包含重复文件：${name}`);
    const foldedName = name.toLocaleLowerCase("en-US");
    if (caseFoldedNames.has(foldedName)) throw new Error(`ZIP 包含大小写冲突文件：${name}`);
    caseFoldedNames.add(foldedName);
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP 本地文件头无效：${name}`);
    const localFlags = zip.readUInt16LE(localOffset + 6);
    const localMethod = zip.readUInt16LE(localOffset + 8);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const localName = normalizeRel(zip.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8"));
    if (localName !== name) throw new Error(`ZIP 本地文件名与中央目录不一致：${name}`);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zip.length || localMethod !== method || localFlags !== flags) throw new Error(`ZIP 本地记录不一致：${name}`);
    const compressed = zip.subarray(dataStart, dataEnd);
    let content;
    if (method === 0) content = Buffer.from(compressed);
    else if (method === 8) content = zlib.inflateRawSync(compressed);
    else throw new Error(`ZIP 使用不支持的压缩算法 ${method}：${name}`);
    if (content.length !== uncompressedSize) throw new Error(`ZIP 解压大小不一致：${name}`);
    if (crc32(content) !== expectedCrc) throw new Error(`ZIP CRC32 不一致：${name}`);
    entries.set(name, content);
  }
  if (offset !== centralOffset + centralSize) throw new Error("ZIP 中央目录大小与实际解析结果不一致");
  return entries;
}

function collectRuntimeSourceFiles() {
  const files = new Map();
  function collect(rel) {
    const absolute = file(rel);
    if (!fs.existsSync(absolute)) {
      errors.push(`CRX 运行时来源缺失：${rel}`);
      return;
    }
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) collect(path.join(rel, name));
      return;
    }
    files.set(normalizeRel(rel), fs.readFileSync(absolute));
  }
  for (const rel of RELEASE_INCLUDE_PATHS) collect(rel);
  return files;
}

function verifyArchiveMatchesWorkspace(entries) {
  const expected = collectRuntimeSourceFiles();
  for (const [name, content] of expected) {
    expect(entries.has(name), `CRX 缺少当前运行时文件：${name}`);
    if (entries.has(name)) expect(entries.get(name).equals(content), `CRX 内文件不是当前工作区版本：${name}`);
  }
  for (const name of entries.keys()) expect(expected.has(name), `CRX 包含未声明或过期文件：${name}`);
  expect(!entries.has("update.json"), "update.json 不得打进 CRX（避免安装包哈希自引用）");
}

const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const updateManifest = readJson("update.json");
const publicKeyMeta = readJson("releases/signing-public-key.json");
const constantsText = readText("ui-src/app/constants.ts");
const backgroundText = readText("background.js");
const contentText = readText("content.js");
const previewText = readText("preview.html");
const readmeText = readText("README.md");
const packScriptText = readText("scripts/pack-crx.mjs");
const uiScriptText = readText("dist-ui/txzz-ui.js");
const uiStyleText = readText("dist-ui/txzz-ui.css");

const sourceVersion = String(manifest.version || "");
const publishedVersion = String(updateManifest.version || "");
const publishedBuild = String(updateManifest.build || "");
const constantsVersion = matchValue(constantsText, /APP_VERSION\s*=\s*["']([^"']+)["']/, "前端 APP_VERSION");
const constantsBuild = matchValue(constantsText, /APP_BUILD\s*=\s*["']([^"']+)["']/, "前端 APP_BUILD");
const backgroundBuild = matchValue(backgroundText, /LOCAL_UPDATE_BUILD\s*=\s*["']([^"']+)["']/, "后台 LOCAL_UPDATE_BUILD");
const version = sourceVersion;
const build = sourceOnly ? constantsBuild : publishedBuild;
const pinnedPublicDer = Buffer.from(UPDATE_PUBLIC_KEY_SPKI_BASE64, "base64");
const pinnedPublicKey = crypto.createPublicKey({ key: pinnedPublicDer, format: "der", type: "spki" });

expect(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version), `manifest.json 版本格式无效：${version || "空"}`);
expect(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(publishedVersion), `update.json 版本格式无效：${publishedVersion || "空"}`);
expect(/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(constantsBuild), `源码构建号格式无效：${constantsBuild || "空"}`);
expect(/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(publishedBuild), `update.json 构建号格式无效：${publishedBuild || "空"}`);
expect(packageJson.version === version, `package.json 版本 ${packageJson.version || "空"} 与 manifest ${version} 不一致`);
expect(constantsVersion === version, `前端版本 ${constantsVersion || "空"} 与 manifest ${version} 不一致`);
expect(backgroundBuild === constantsBuild, `后台构建 ${backgroundBuild || "空"} 与前端构建 ${constantsBuild || "空"} 不一致`);
if (!sourceOnly) {
  expect(updateManifest.version === version, `update.json 版本 ${updateManifest.version || "空"} 与 manifest ${version} 不一致`);
  expect(constantsBuild === publishedBuild, `前端构建 ${constantsBuild || "空"} 与 update.json ${publishedBuild} 不一致`);
}
expect(Number(updateManifest.schema) === UPDATE_SCHEMA_VERSION, `update.json schema 必须为 ${UPDATE_SCHEMA_VERSION}，当前为 ${updateManifest.schema}`);
expect(updateManifest.packageFormat === "crx", `update.json packageFormat 必须为 crx，当前为 ${updateManifest.packageFormat || "空"}`);
expect(updateManifest.extensionId === EXPECTED_EXTENSION_ID, `update.json extensionId 必须为 ${EXPECTED_EXTENSION_ID}`);
expect(updateManifest.changelog?.[0]?.id === publishedBuild, `update.json 首条更新 ID ${updateManifest.changelog?.[0]?.id || "空"} 与构建号 ${publishedBuild} 不一致`);
expect(updateManifest.homepage === "https://github.com/lsy5920/tangxin-zhizhe-extension", "update.json homepage 必须固定为正式仓库");
expect(updateManifest.downloadUrl === OFFICIAL_PACKAGE_URLS[0], "update.json 主下载地址不是固定正式路径");
expect(sameStringArray(updateManifest.downloadCandidates, OFFICIAL_PACKAGE_URLS), "update.json 下载镜像必须与固定 owner/repo/branch/path 清单完全一致");
expect(updateManifest.signature?.algorithm === UPDATE_SIGNATURE_ALGORITHM, "update.json 签名算法不正确");
expect(updateManifest.signature?.keyId === UPDATE_PUBLIC_KEY_ID, "update.json 签名公钥标识不正确");
expect(/^[A-Za-z0-9+/]+={0,2}$/.test(String(updateManifest.signature?.value || "")), "update.json 缺少合法 Base64 签名");
expect(manifest.key === UPDATE_PUBLIC_KEY_SPKI_BASE64, "manifest.json key 未固定为正式扩展公钥");
expect(extensionIdFromPublicKey(pinnedPublicDer) === EXPECTED_EXTENSION_ID, "固定公钥推导出的扩展 ID 不正确");
expect(sha256(pinnedPublicDer) === UPDATE_PUBLIC_KEY_SHA256, "固定公钥 SHA-256 不正确");
expect(publicKeyMeta.type === "spki", "signing-public-key.json type 必须为 spki");
expect(publicKeyMeta.algorithm === UPDATE_SIGNATURE_ALGORITHM, "signing-public-key.json algorithm 不一致");
expect(publicKeyMeta.keyId === UPDATE_PUBLIC_KEY_ID, "signing-public-key.json keyId 不一致");
expect(publicKeyMeta.sha256 === UPDATE_PUBLIC_KEY_SHA256, "signing-public-key.json sha256 不一致");
expect(publicKeyMeta.extensionId === EXPECTED_EXTENSION_ID, "signing-public-key.json extensionId 不一致");
expect(publicKeyMeta.spkiBase64 === UPDATE_PUBLIC_KEY_SPKI_BASE64, "signing-public-key.json 公钥内容不一致");
expect(backgroundText.includes(`EXPECTED_EXTENSION_ID = "${EXPECTED_EXTENSION_ID}"`), "background.js 未固定正式扩展 ID");
expect(backgroundText.includes(UPDATE_PUBLIC_KEY_SPKI_BASE64), "background.js 未内置固定更新公钥");
expect(backgroundText.includes(UPDATE_PUBLIC_KEY_SHA256), "background.js 未内置固定公钥指纹");
for (const url of OFFICIAL_PACKAGE_URLS) expect(backgroundText.includes(url), `background.js 缺少正式安装包路径：${url}`);
expect(
  sameStringArray(manifest.content_scripts?.[0]?.js, ["page_context_core.js", "content.js", "dist-ui/txzz-ui.js"]),
  "manifest 内容脚本顺序必须先加载共享页面上下文核心"
);
for (const runtimeFile of [
  "state_mutation_core.js",
  "experience_core.js",
  "page_context_core.js",
  "download_core.js",
  "save.html",
  "save.css",
  "save.js"
]) {
  expect(RELEASE_INCLUDE_PATHS.includes(runtimeFile), `发布文件列表缺少新增运行时文件：${runtimeFile}`);
}
expect(RELEASE_INCLUDE_PATHS.includes("icons"), "发布文件列表缺少通知图标目录 icons");
expect(manifest.permissions?.includes("alarms"), "manifest 缺少智能调度和巡检所需 alarms 权限");
expect(manifest.optional_permissions?.includes("notifications"), "manifest 缺少可选 notifications 权限");
for (const marker of [
  "--txzz-shadow-property-fallback",
  ".txzz-stat-ornament",
  "@keyframes txzz-stat-float",
  "@keyframes txzz-companion-breathe"
]) {
  expect(uiStyleText.includes(marker), `正式 UI CSS 缺少插画/动画标记：${marker}`);
  expect(uiScriptText.includes(marker), `正式 UI 内联 CSS 兜底缺少关键标记：${marker}`);
}
expect(uiScriptText.includes("txzz-app-style"), "正式 UI 脚本缺少 Shadow DOM 内联样式兜底");
expect(uiScriptText.includes("txzzUiBuild"), "正式 UI 脚本缺少构建代次标记，旧 ShadowRoot 可能被复用");
expect(uiScriptText.includes("txzzStyleIntegrity"), "正式 UI 脚本缺少 ShadowRoot 样式完整性自检");
expect(backgroundText.includes('getURL(`save.html#token='), "background.js 未打开扩展安全保存页");
expect(!contentText.includes("clientSave"), "content.js 不得再通过 runtime 消息接收整包 CRX 字节");
expect(!RELEASE_INCLUDE_PATHS.includes("update.json"), "发布文件列表不得包含 update.json");
const accessibleResources = (manifest.web_accessible_resources || []).flatMap((item) => item.resources || []);
expect(!accessibleResources.includes("update.json"), "manifest web_accessible_resources 不得暴露 update.json");
expect(!packScriptText.includes("generateKeyPairSync"), "打包脚本不得在私钥缺失时自动生成新身份");
expect(previewText.includes(`version: "${version}"`) && previewText.includes(`build: "${constantsBuild}"`), "preview.html 的源码版本或构建号未同步");
expect(previewText.includes('dataset.txzzPreviewRuntime = previewRuntime'), "preview.html 缺少运行路径标记");
expect(previewText.includes('previewRuntime === "source"'), "preview.html 未保留显式源码 HMR 模式");
expect(previewText.includes('/dist-ui/txzz-ui.js?preview='), "preview.html 默认路径未加载正式 dist UI");
expect(readmeText.includes(`\`${version}\``), `README.md 未记录当前版本 ${version}`);
const buildDisplay = constantsBuild.replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/, "$1 $2:$3");
expect(readmeText.includes(constantsBuild) || readmeText.includes(buildDisplay), `README.md 未记录当前构建时间 ${constantsBuild}`);

if (!sourceOnly) {
  try {
    const signature = Buffer.from(String(updateManifest.signature?.value || ""), "base64");
    expect(
      crypto.verify("sha256", Buffer.from(updateManifestSigningText(updateManifest), "utf8"), pinnedPublicKey, signature),
      "update.json 固定公钥签名验证失败"
    );
    const tamperedManifest = { ...updateManifest, packageSize: Number(updateManifest.packageSize || 0) + 1 };
    expect(
      !crypto.verify("sha256", Buffer.from(updateManifestSigningText(tamperedManifest), "utf8"), pinnedPublicKey, signature),
      "清单篡改回归测试失败：修改 packageSize 后原签名仍被接受"
    );
  } catch (error) {
    errors.push(`update.json 签名验证异常：${error?.message || error}`);
  }

  const latest = readJson("releases/latest.json");
  const expectedLatestName = "tangxin-zhizhe-latest.crx";
  const expectedVersionedName = `tangxin-zhizhe-${version}.crx`;
  expect(latest.version === version, `latest.json 版本 ${latest.version || "空"} 与 manifest ${version} 不一致`);
  expect(latest.build === build, `latest.json 构建 ${latest.build || "空"} 与 update.json ${build} 不一致`);
  expect(latest.package === expectedLatestName, `latest.json package 应为 ${expectedLatestName}`);
  expect(latest.versionedPackage === expectedVersionedName, `latest.json versionedPackage 应为 ${expectedVersionedName}`);
  expect(latest.format === "crx", `latest.json format 必须为 crx，当前为 ${latest.format || "空"}`);
  expect(latest.extensionId === EXPECTED_EXTENSION_ID, `latest.json 扩展 ID 必须为 ${EXPECTED_EXTENSION_ID}`);
  expect(latest.publicKeySha256 === UPDATE_PUBLIC_KEY_SHA256, "latest.json publicKeySha256 不一致");
  expect(latest.updateManifestSignature?.value === updateManifest.signature?.value, "latest.json 与 update.json 的签名不一致");

  const latestPath = file(`releases/${expectedLatestName}`);
  const versionedPath = file(`releases/${expectedVersionedName}`);
  expect(fs.existsSync(latestPath), `${expectedLatestName} 不存在`);
  expect(fs.existsSync(versionedPath), `${expectedVersionedName} 不存在`);
  if (fs.existsSync(latestPath) && fs.existsSync(versionedPath)) {
    const latestBuffer = fs.readFileSync(latestPath);
    const versionedBuffer = fs.readFileSync(versionedPath);
    const actualHash = sha256(latestBuffer);
    expect(latestBuffer.equals(versionedBuffer), "latest CRX 与版本 CRX 内容不一致");
    expect(Number(latest.size) === latestBuffer.length, `latest.json size ${latest.size} 与实际 ${latestBuffer.length} 不一致`);
    expect(latest.sha256 === actualHash, `latest.json sha256 ${latest.sha256 || "空"} 与实际哈希不一致`);
    expect(Number(updateManifest.packageSize) === latestBuffer.length, `update.json packageSize ${updateManifest.packageSize} 与实际 ${latestBuffer.length} 不一致`);
    expect(updateManifest.packageSha256 === actualHash, "update.json packageSha256 与实际 CRX 不一致");
    try {
      const crx = verifyCrx(latestBuffer, expectedLatestName, pinnedPublicDer);
      expect(crx.version === 3, "正式发布包必须使用 CRX3");
      expect(crx.extensionId === EXPECTED_EXTENSION_ID, `CRX 实际扩展 ID ${crx.extensionId} 不正确`);
      const entries = extractZipEntries(latestBuffer.subarray(crx.zipOffset));
      verifyArchiveMatchesWorkspace(entries);
      const tamperedCrx = Buffer.from(latestBuffer);
      tamperedCrx[tamperedCrx.length - 1] ^= 1;
      let tamperedRejected = false;
      try {
        verifyCrx(tamperedCrx, "篡改回归样本", pinnedPublicDer);
      } catch (_) {
        tamperedRejected = true;
      }
      expect(tamperedRejected, "CRX 篡改回归测试失败：修改归档字节后包签名仍被接受");
    } catch (error) {
      errors.push(`CRX 深度校验失败：${error?.message || error}`);
    }
  }

  const idText = readText("releases/extension-id.txt").trim();
  expect(idText === EXPECTED_EXTENSION_ID, `extension-id.txt 必须为 ${EXPECTED_EXTENSION_ID}，当前为 ${idText || "空"}`);
}

if (errors.length) {
  console.error(`[check-release] 失败，共 ${errors.length} 项：`);
  errors.forEach((message, index) => console.error(`  ${index + 1}. ${message}`));
  process.exit(1);
}

console.log(`[check-release] 通过：v${version} / ${build}${sourceOnly ? `（源码检查；当前已签名发布为 v${publishedVersion} / ${publishedBuild}）` : "（签名清单 + CRX3 + ZIP 全文件一致性）"}`);
