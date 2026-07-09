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
 * 签名密钥 keys/txzz-extension.pem 首次自动生成，必须备份；
 * 同一把密钥才能保证扩展 ID 不变，用户更新时覆盖安装不丢数据。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ChromeExtension = require("crx");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const KEY_DIR = path.join(ROOT, "keys");
const KEY_PATH = path.join(KEY_DIR, "txzz-extension.pem");
const STAGE_DIR = path.join(ROOT, "build", "extension-stage");
const RELEASE_DIR = path.join(ROOT, "releases");

/** 运行时需要打进 CRX 的文件/目录（相对项目根） */
const INCLUDE_PATHS = [
  "manifest.json",
  "background.js",
  "content.js",
  "display_patch.js",
  "nav_guard.js",
  "page_hook.js",
  "page_probe.js",
  "offscreen.html",
  "offscreen_downloader.js",
  "update.json",
  "README.md",
  "dist-ui",
  "vendor"
];

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

function ensurePrivateKey() {
  ensureDir(KEY_DIR);
  if (fs.existsSync(KEY_PATH)) {
    return fs.readFileSync(KEY_PATH);
  }
  console.log("[pack-crx] 未找到签名密钥，正在生成 keys/txzz-extension.pem …");
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  // crx 库需要传统 PKCS#1 PEM（BEGIN RSA PRIVATE KEY）
  const keyObject = crypto.createPrivateKey(privateKey);
  const rsaPem = keyObject.export({ type: "pkcs1", format: "pem" });
  fs.writeFileSync(KEY_PATH, rsaPem, { encoding: "utf8", mode: 0o600 });
  const readme = path.join(KEY_DIR, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      [
        "# 扩展签名密钥",
        "",
        "- `txzz-extension.pem`：CRX 签名私钥，**严禁公开上传到公开仓库**。",
        "- 丢失后重新生成会导致扩展 ID 变化，用户无法平滑覆盖更新。",
        "- 请备份到安全位置（U 盘 / 密码管理器附件）。",
        "- 打包命令：`npm run pack` 或 `npm run release`。",
        ""
      ].join("\n"),
      "utf8"
    );
  }
  console.log("[pack-crx] 已生成密钥，请立刻备份 keys/txzz-extension.pem");
  return Buffer.from(rsaPem, "utf8");
}

function prepareStage() {
  rmrf(STAGE_DIR);
  ensureDir(STAGE_DIR);

  const missing = [];
  for (const rel of INCLUDE_PATHS) {
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

async function packCrx() {
  const manifest = readManifest();
  const version = String(manifest.version || "0.0.0");
  const privateKey = ensurePrivateKey();
  const extensionId = computeExtensionId(privateKey);

  console.log(`[pack-crx] 版本 ${version}`);
  console.log(`[pack-crx] 扩展 ID ${extensionId}`);
  console.log("[pack-crx] 准备运行时文件…");
  prepareStage();

  ensureDir(RELEASE_DIR);
  const crx = new ChromeExtension({ privateKey });
  await crx.load(STAGE_DIR);
  const crxBuffer = await crx.pack();

  const latestName = "tangxin-zhizhe-latest.crx";
  const versionedName = `tangxin-zhizhe-${version}.crx`;
  const latestPath = path.join(RELEASE_DIR, latestName);
  const versionedPath = path.join(RELEASE_DIR, versionedName);

  fs.writeFileSync(latestPath, crxBuffer);
  fs.writeFileSync(versionedPath, crxBuffer);
  fs.writeFileSync(path.join(RELEASE_DIR, "extension-id.txt"), `${extensionId}\n`, "utf8");
  fs.writeFileSync(
    path.join(RELEASE_DIR, "latest.json"),
    `${JSON.stringify(
      {
        name: "糖心志者",
        version,
        extensionId,
        package: latestName,
        versionedPackage: versionedName,
        packedAt: new Date().toISOString(),
        format: "crx",
        size: crxBuffer.length
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
