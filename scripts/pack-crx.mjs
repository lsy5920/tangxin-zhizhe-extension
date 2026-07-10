/**
 * 糖心志者 · CRX 打包脚本
 *
 * 用法：
 *   npm run pack
 *   npm run release   （先 build 前端再 pack）
 *
 * 产出：
 *   releases/tangxin-zhizhe-latest.crx
 *   releases/tangxin-zhizhe-{version}.crx
 *   releases/extension-id.txt
 *
 * 签名密钥 keys/txzz-extension.pem 必须由发布者安全保管；缺失时立即终止，
 * 禁止静默生成新密钥导致扩展 ID 改变、用户无法覆盖更新。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  EXPECTED_EXTENSION_ID,
  RELEASE_INCLUDE_PATHS,
  UPDATE_PUBLIC_KEY_ID,
  UPDATE_PUBLIC_KEY_SHA256,
  UPDATE_PUBLIC_KEY_SPKI_BASE64,
  UPDATE_SCHEMA_VERSION,
  UPDATE_SIGNATURE_ALGORITHM,
  updateManifestSigningText
} from "./release-config.mjs";

const require = createRequire(import.meta.url);
const ChromeExtension = require("crx");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const KEY_DIR = path.join(ROOT, "keys");
const KEY_PATH = path.join(KEY_DIR, "txzz-extension.pem");
const STAGE_DIR = path.join(ROOT, "build", "extension-stage");
const RELEASE_DIR = path.join(ROOT, "releases");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rmrf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
      if (name === "." || name === "..") continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function readManifest() {
  const raw = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");
  return JSON.parse(raw);
}

function readUpdateManifest() {
  const raw = fs.readFileSync(path.join(ROOT, "update.json"), "utf8");
  return JSON.parse(raw);
}

function ensurePrivateKey() {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      "缺少固定签名私钥 keys/txzz-extension.pem。为保护正式扩展 ID，打包程序不会自动生成替代密钥；请从安全备份恢复。"
    );
  }
  return fs.readFileSync(KEY_PATH);
}

function prepareStage() {
  rmrf(STAGE_DIR);
  ensureDir(STAGE_DIR);

  const missing = [];
  for (const rel of RELEASE_INCLUDE_PATHS) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) {
      missing.push(rel);
      continue;
    }
    copyRecursive(src, path.join(STAGE_DIR, rel));
  }

  if (missing.length) {
    throw new Error(`打包缺少必需文件：${missing.join("、")}。请先执行 npm run build。`);
  }

  // 二次确认 UI 产物
  const uiJs = path.join(STAGE_DIR, "dist-ui", "txzz-ui.js");
  const uiCss = path.join(STAGE_DIR, "dist-ui", "txzz-ui.css");
  if (!fs.existsSync(uiJs) || !fs.existsSync(uiCss)) {
    throw new Error("dist-ui 产物不完整，请先执行 npm run build。");
  }
}

function extensionIdFromPublicKey(publicKeyDer) {
  // Chrome 扩展 ID = SHA256(公钥 SPKI DER) 前 16 字节 → 映射到 a-p
  const hash = crypto.createHash("sha256").update(publicKeyDer).digest().subarray(0, 16);
  let id = "";
  for (const byte of hash) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

function computeExtensionId(privateKeyPem) {
  const keyObject = crypto.createPrivateKey(privateKeyPem);
  const publicDer = crypto.createPublicKey(keyObject).export({ type: "spki", format: "der" });
  return extensionIdFromPublicKey(publicDer);
}

function verifyReleaseIdentity(privateKeyPem, manifest) {
  const keyObject = crypto.createPrivateKey(privateKeyPem);
  const publicDer = crypto.createPublicKey(keyObject).export({ type: "spki", format: "der" });
  const extensionId = extensionIdFromPublicKey(publicDer);
  const publicKeyBase64 = publicDer.toString("base64");
  const publicKeySha256 = crypto.createHash("sha256").update(publicDer).digest("hex");
  if (extensionId !== EXPECTED_EXTENSION_ID) {
    throw new Error(`签名私钥对应扩展 ID ${extensionId}，与正式 ID ${EXPECTED_EXTENSION_ID} 不一致`);
  }
  if (publicKeyBase64 !== UPDATE_PUBLIC_KEY_SPKI_BASE64 || publicKeySha256 !== UPDATE_PUBLIC_KEY_SHA256) {
    throw new Error("签名私钥与仓库固定的更新公钥不一致");
  }
  if (String(manifest.key || "") !== publicKeyBase64) {
    throw new Error("manifest.json 的 key 未固定为正式扩展公钥");
  }
  return { extensionId, publicDer, publicKeyBase64, publicKeySha256 };
}

function signUpdateManifest(updateManifest, privateKey, packageMeta) {
  const unsigned = {
    ...updateManifest,
    schema: UPDATE_SCHEMA_VERSION,
    packageFormat: "crx",
    extensionId: packageMeta.extensionId,
    packageSize: packageMeta.size,
    packageSha256: packageMeta.sha256
  };
  delete unsigned.signature;
  const payload = Buffer.from(updateManifestSigningText(unsigned), "utf8");
  const value = crypto.sign("sha256", payload, {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  }).toString("base64");
  return {
    ...unsigned,
    signature: {
      algorithm: UPDATE_SIGNATURE_ALGORITHM,
      keyId: UPDATE_PUBLIC_KEY_ID,
      value
    }
  };
}

async function packCrx() {
  const manifest = readManifest();
  const version = String(manifest.version || "0.0.0");
  const updateManifest = readUpdateManifest();
  const build = String(updateManifest.build || "");
  if (String(updateManifest.version || "") !== version) {
    throw new Error(`manifest.json 版本 ${version} 与 update.json 版本 ${updateManifest.version || "未填写"} 不一致`);
  }
  const privateKey = ensurePrivateKey();
  const { extensionId, publicKeySha256 } = verifyReleaseIdentity(privateKey, manifest);

  console.log(`[pack-crx] 版本 ${version}`);
  console.log(`[pack-crx] 扩展 ID ${extensionId}`);
  console.log("[pack-crx] 准备运行时文件…");
  prepareStage();

  ensureDir(RELEASE_DIR);
  const crx = new ChromeExtension({ privateKey });
  await crx.load(STAGE_DIR);
  const crxBuffer = await crx.pack();
  const sha256 = crypto.createHash("sha256").update(crxBuffer).digest("hex");
  const signedUpdateManifest = signUpdateManifest(updateManifest, privateKey, {
    extensionId,
    size: crxBuffer.length,
    sha256
  });

  const latestName = "tangxin-zhizhe-latest.crx";
  const versionedName = `tangxin-zhizhe-${version}.crx`;
  const latestPath = path.join(RELEASE_DIR, latestName);
  const versionedPath = path.join(RELEASE_DIR, versionedName);

  fs.writeFileSync(latestPath, crxBuffer);
  fs.writeFileSync(versionedPath, crxBuffer);
  fs.writeFileSync(path.join(ROOT, "update.json"), `${JSON.stringify(signedUpdateManifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(RELEASE_DIR, "extension-id.txt"), `${extensionId}\n`, "utf8");
  fs.writeFileSync(
    path.join(RELEASE_DIR, "latest.json"),
    `${JSON.stringify(
      {
        name: "糖心志者",
        version,
        build,
        extensionId,
        package: latestName,
        versionedPackage: versionedName,
        packedAt: new Date().toISOString(),
        format: "crx",
        size: crxBuffer.length,
        sha256,
        publicKeySha256,
        updateManifestSignature: signedUpdateManifest.signature
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  // 清理临时目录
  rmrf(path.join(ROOT, "build"));

  const sizeKb = (crxBuffer.length / 1024).toFixed(1);
  console.log(`[pack-crx] 完成：releases/${latestName}（${sizeKb} KB）`);
  console.log(`[pack-crx] 完成：releases/${versionedName}`);
  console.log("[pack-crx] 下载地址（推送 main 后生效）：");
  console.log(`  https://github.com/lsy5920/tangxin-zhizhe-extension/raw/main/releases/${latestName}`);
  console.log(`  https://raw.githubusercontent.com/lsy5920/tangxin-zhizhe-extension/main/releases/${latestName}`);
  return {
    version,
    extensionId,
    latestPath,
    versionedPath,
    size: crxBuffer.length
  };
}

packCrx().catch((err) => {
  console.error("[pack-crx] 失败：", err?.message || err);
  process.exit(1);
});
