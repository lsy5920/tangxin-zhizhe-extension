import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const repairMode = process.argv.includes("--repair");

const criticalFiles = [
  {
    name: "Vite 命令",
    path: join(rootDir, "node_modules", ".bin", "vite.cmd"),
    repairTarget: null,
    help: "缺少 Vite 的 Windows 启动脚本，构建命令会提示 vite 不是内部或外部命令。"
  },
  {
    name: "Shaka Player HLS 内核",
    path: join(rootDir, "node_modules", "shaka-player", "dist", "shaka-player.compiled.js"),
    repairTarget: join(rootDir, "node_modules", "shaka-player"),
    help: "缺少 Shaka Player 主入口，HLS/AES/ABR 播放内核无法打包。"
  },
  {
    name: "Shaka TS 转封装 Worker",
    path: join(rootDir, "node_modules", "shaka-player", "dist", "shaka-player.transmuxer-worker.js"),
    repairTarget: join(rootDir, "node_modules", "shaka-player"),
    help: "缺少 Shaka 转封装 Worker，移动端 TS 解码会退回主线程。"
  }
];

function missingItems() {
  return criticalFiles.filter((item) => !existsSync(item.path));
}

function printMissing(items) {
  console.error("依赖完整性检查失败，发现以下关键文件缺失：");
  for (const item of items) {
    console.error(`- ${item.name}：${item.path}`);
    console.error(`  原因说明：${item.help}`);
  }
}

function runInstall() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["install"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false
  });
  return result.status === 0;
}

if (!existsSync(join(rootDir, "node_modules"))) {
  console.error("未找到 node_modules，请先执行 npm install。");
  process.exit(1);
}

let missing = missingItems();
if (!missing.length) {
  console.log("依赖完整性检查通过。");
  process.exit(0);
}

if (!repairMode) {
  printMissing(missing);
  console.error("可执行 npm run deps:repair 自动修复依赖后再构建。");
  process.exit(1);
}

printMissing(missing);
console.log("开始自动修复依赖：删除损坏的关键依赖目录并重新执行 npm install。");

for (const item of missing) {
  if (!item.repairTarget || !existsSync(item.repairTarget)) continue;
  rmSync(item.repairTarget, { recursive: true, force: true });
  console.log(`已移除损坏目录：${item.repairTarget}`);
}

if (!runInstall()) {
  console.error("自动执行 npm install 失败，请检查网络或 npm 缓存后重试。");
  process.exit(1);
}

missing = missingItems();
if (missing.length) {
  printMissing(missing);
  console.error("自动修复后仍有关键文件缺失，请删除 node_modules 后重新执行 npm install。");
  process.exit(1);
}

console.log("依赖自动修复完成，关键构建文件已恢复。");
