"use strict";

const title = document.getElementById("title");
const message = document.getElementById("message");
const details = document.getElementById("details");
const filename = document.getElementById("filename");
const filesize = document.getElementById("filesize");
const verification = document.getElementById("verification");
const saveButton = document.getElementById("save");
const confirmButton = document.getElementById("confirm");

let claim = null;
let artifactFile = null;

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "未知";
  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(file) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())));
}

async function readArtifact(artifact) {
  if (!navigator.storage?.getDirectory) throw new Error("当前浏览器不支持读取 OPFS 成品");
  const directoryParts = Array.isArray(artifact?.directory) ? artifact.directory.map(String) : [];
  const safePart = (part) => /^[a-zA-Z0-9._-]{1,120}$/.test(part) && part !== "." && part !== "..";
  if (directoryParts.length !== 3 || directoryParts[0] !== "txzz-downloads-v1" || !directoryParts.every(safePart)) {
    throw new Error("下载成品目录记录无效");
  }
  const artifactName = String(artifact?.filename || "");
  if (!artifactName || artifactName.length > 240 || artifactName === "." || artifactName === ".." || /[\\/\u0000-\u001f]/.test(artifactName)) {
    throw new Error("下载成品文件名无效");
  }
  let directory = await navigator.storage.getDirectory();
  for (const part of directoryParts) {
    directory = await directory.getDirectoryHandle(part);
  }
  return (await directory.getFileHandle(artifactName)).getFile();
}

async function verifyCrx3(file, expectedSha256) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(header.slice(0, 4)) !== "Cr24") throw new Error("CRX3 魔数校验失败");
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(4, true) !== 3) throw new Error("安装包不是 CRX3 格式");
  const headerSize = view.getUint32(8, true);
  if (headerSize <= 0 || 12 + headerSize >= file.size) throw new Error("CRX3 头长度异常");
  if (expectedSha256 && await sha256(file) !== expectedSha256.toLowerCase()) throw new Error("SHA-256 校验失败，文件可能被篡改");
}

function downloadFilename() {
  const requested = String(claim?.filename || artifactFile?.name || "糖心志者下载").replaceAll("\\", "/");
  return requested.split("/").filter(Boolean).pop() || "糖心志者下载";
}

function pickerTypes(name) {
  const extension = name.includes(".") ? `.${name.split(".").pop().toLowerCase()}` : "";
  const mime = claim?.kind === "crx"
    ? "application/x-chrome-extension"
    : artifactFile?.type || (extension === ".mp4" ? "video/mp4" : "application/octet-stream");
  return extension ? [{ description: claim?.kind === "crx" ? "Chrome 扩展安装包" : "视频文件", accept: { [mime]: [extension] } }] : [];
}

async function completeSave(confirmation) {
  const response = await chrome.runtime.sendMessage({
    type: "completeSavePageToken",
    token: claim.token,
    result: { saved: true, confirmation }
  });
  if (response?.ok === false) throw new Error(response.error || "保存状态确认失败");
  claim = null;
  saveButton.disabled = true;
  saveButton.textContent = "保存完成";
  confirmButton.hidden = true;
  title.textContent = "已经稳稳保存好啦";
  message.textContent = "文件已写入设备，保存票也已安全核销。CRX 下载后仍需在扩展管理页手动安装。";
  verification.textContent = "已保存";
}

async function saveWithFilePicker() {
  const suggestedName = downloadFilename();
  const handle = await globalThis.showSaveFilePicker({
    suggestedName,
    types: pickerTypes(suggestedName),
    excludeAcceptAllOption: false
  });
  const writable = await handle.createWritable();
  try {
    // 直接把 Blob 交给浏览器的文件流，避免大视频再次完整驻留内存。
    await writable.write(artifactFile);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort?.();
    } catch (_) {}
    throw error;
  }
  try {
    await completeSave("file-system-access");
  } catch (error) {
    // 文件已经写盘，若后台状态持久化暂时失败，只重试核销，不要求用户重复写一遍大文件。
    title.textContent = "文件已写入，等待状态确认";
    message.textContent = "文件已经保存到设备，但插件状态回写失败。请点击下方确认重试，不会再次写入文件。";
    verification.textContent = "已写盘 / 待核销";
    confirmButton.hidden = false;
    confirmButton.disabled = false;
    throw error;
  }
}

function submitAnchorDownload() {
  const url = URL.createObjectURL(artifactFile);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadFilename();
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function initialize() {
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  if (!token) throw new Error("保存链接缺少一次性令牌");
  const response = await chrome.runtime.sendMessage({ type: "claimSavePageToken", token });
  if (response?.ok === false) throw new Error(response.error || "领取保存令牌失败");
  claim = response;
  artifactFile = await readArtifact(response.artifact);
  if (response.expectedSize > 0 && artifactFile.size !== response.expectedSize) throw new Error("文件大小与已验证记录不一致");
  if (response.kind === "crx") await verifyCrx3(artifactFile, response.expectedSha256);

  filename.textContent = response.filename || artifactFile.name;
  filesize.textContent = formatBytes(artifactFile.size);
  verification.textContent = response.kind === "crx" ? "CRX3 / SHA-256 已通过" : "OPFS 文件大小已通过";
  details.hidden = false;
  title.textContent = response.kind === "crx" ? "安装包已检票" : "视频已经装进糖果盒";
  message.textContent = "请点击下方按钮，由浏览器打开系统保存流程。";
  saveButton.disabled = false;
}

saveButton.addEventListener("click", async () => {
  if (!claim || !artifactFile) return;
  saveButton.disabled = true;
  message.classList.remove("error");
  try {
    if (typeof globalThis.showSaveFilePicker === "function") {
      await saveWithFilePicker();
      return;
    }
    // Android Chromium 没有文件选择器时只能触发浏览器下载。anchor.click() 无法证明
    // 文件已经落盘，因此保留令牌并允许重试，直到用户明确确认看到文件。
    submitAnchorDownload();
    title.textContent = "保存请求已交给浏览器";
    message.textContent = "请查看下载记录。若没有文件，可再次点击保存；看到文件后再确认，保存票才会核销。";
    verification.textContent = "等待确认";
    saveButton.textContent = "再次保存";
    saveButton.disabled = false;
    confirmButton.hidden = false;
  } catch (error) {
    saveButton.disabled = false;
    if (error?.name === "AbortError") {
      message.textContent = "已取消本次保存，文件与保存票仍然保留，可随时重试。";
    } else {
      message.textContent = error?.message || String(error);
      message.classList.add("error");
    }
  }
});

confirmButton.addEventListener("click", async () => {
  if (!claim) return;
  confirmButton.disabled = true;
  message.classList.remove("error");
  try {
    await completeSave("user-confirmed-anchor-download");
  } catch (error) {
    confirmButton.disabled = false;
    message.textContent = error?.message || String(error);
    message.classList.add("error");
  }
});

initialize().catch((error) => {
  title.textContent = "这张保存票无法使用";
  message.textContent = error?.message || String(error);
  message.classList.add("error");
  saveButton.disabled = true;
});
