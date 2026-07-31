import { writeFileSync } from "node:fs";

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const port = Number(readArg("port", "9333"));
const urlNeedle = readArg("url", "cinema.html");
const expression = readArg("eval", "");
const screenshotPath = readArg("screenshot", "");
const viewport = readArg("viewport", "");

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === "page" && String(item.url || "").includes(urlNeedle));
if (!target?.webSocketDebuggerUrl) throw new Error(`没有找到匹配 ${urlNeedle} 的 CDP 页面`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
  else resolve(message.result || {});
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
await send("Page.enable");

if (viewport) {
  const [width, height, deviceScaleFactor = 1] = viewport.split("x").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`无效视口：${viewport}`);
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: width <= 639,
    screenWidth: width,
    screenHeight: height
  });
}

let evaluation = null;
if (expression) {
  evaluation = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
}

if (screenshotPath) {
  const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
}

socket.close();
process.stdout.write(JSON.stringify({
  target: { id: target.id, title: target.title, url: target.url },
  viewport: viewport || null,
  result: evaluation?.result?.value ?? evaluation?.result?.description ?? null,
  exception: evaluation?.exceptionDetails?.text || null,
  screenshot: screenshotPath || null
}, null, 2));
