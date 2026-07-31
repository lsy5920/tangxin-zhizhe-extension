import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chromePath = process.env.TXZZ_CHROME_DEV_PATH || "C:\\Program Files\\Google\\Chrome Dev\\Application\\chrome.exe";
const extensionPath = resolve(process.argv[2] || ".");
const outputDirectory = resolve(process.argv[3] || join(tmpdir(), "txzz-cinema-chrome-dev"));
const profileDirectory = mkdtempSync(join(tmpdir(), "txzz-chrome-dev-pipe-"));
mkdirSync(outputDirectory, { recursive: true });

class PipeCdp {
  constructor(child) {
    this.child = child;
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    this.buffer = Buffer.alloc(0);
    child.stdio[4].on("data", (chunk) => this.consume(chunk));
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let delimiter;
    while ((delimiter = this.buffer.indexOf(0)) >= 0) {
      const raw = this.buffer.subarray(0, delimiter).toString("utf8");
      this.buffer = this.buffer.subarray(delimiter + 1);
      if (!raw) continue;
      const message = JSON.parse(raw);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePromise, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
        else resolvePromise(message.result || {});
      } else {
        this.events.push(message);
      }
    }
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超过 30 秒没有返回`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (result) => { clearTimeout(timeout); resolvePromise(result); },
        reject: (error) => { clearTimeout(timeout); reject(error); }
      });
      this.child.stdio[3].write(`${JSON.stringify(message)}\0`);
    });
  }
}

const chrome = spawn(chromePath, [
  `--user-data-dir=${profileDirectory}`,
  "--remote-debugging-pipe",
  "--enable-unsafe-extension-debugging",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-popup-blocking",
  "--window-size=1440,900",
  "about:blank"
], {
  detached: false,
  stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
  windowsHide: false
});

let chromeStderr = "";
chrome.stderr.on("data", (chunk) => { chromeStderr += chunk.toString("utf8"); });
const cdp = new PipeCdp(chrome);
const consoleErrors = [];

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function evaluate(sessionId, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "页面脚本执行失败");
  return response.result?.value;
}

async function waitFor(sessionId, expression, timeout = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      if (await evaluate(sessionId, expression)) return;
    } catch {
      // 页面导航期间执行上下文会短暂销毁，下一轮使用新上下文继续确认。
    }
    await delay(250);
  }
  throw new Error(`等待页面条件超时：${expression.slice(0, 120)}`);
}

async function screenshot(sessionId, name) {
  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  }, sessionId);
  const path = join(outputDirectory, name);
  writeFileSync(path, Buffer.from(capture.data, "base64"));
  return path;
}

async function viewport(sessionId, width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  }, sessionId);
}

async function navigate(sessionId, url) {
  await cdp.send("Page.navigate", { url }, sessionId);
  await waitFor(sessionId, "document.readyState === 'complete'", 20_000);
}

const root = "document.querySelector('#txzz-candy-ui-root')?.shadowRoot";
const result = {
  chrome: chromePath,
  extensionPath,
  profileDirectory,
  extensionId: "",
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  consoleErrors
};

function check(name, passed, detail = null) {
  result.checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`验收失败：${name}${detail ? ` · ${detail}` : ""}`);
}

try {
  await delay(1_200);
  const loaded = await cdp.send("Extensions.loadUnpacked", { path: extensionPath });
  result.extensionId = loaded.id || loaded.extensionId || "";
  check("固定扩展 ID", result.extensionId === "ddefadnhgebdclpkabeobjidjllkdkhm", result.extensionId);

  const page = await cdp.send("Target.createTarget", { url: "about:blank", width: 1440, height: 900 });
  const attached = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);

  await navigate(sessionId, `chrome-extension://${result.extensionId}/cinema.html#/home`);
  await waitFor(sessionId, `${root}?.querySelector('[data-txzz-cinema-app="true"]') !== null`, 25_000);
  await waitFor(sessionId, `${root}?.querySelectorAll('.txzz-cinema58-movie-card').length > 0`, 45_000);

  const desktop = await evaluate(sessionId, `(() => {
    const root = ${root};
    const shell = root.querySelector('.txzz-cinema58-shell');
    const hero = root.querySelector('.txzz-cinema58-hero');
    return {
      title: document.title,
      route: root.querySelector('[data-txzz-cinema-app]')?.dataset.cinemaRoute,
      cards: root.querySelectorAll('.txzz-cinema58-movie-card').length,
      nav: root.querySelectorAll('.txzz-cinema58-nav-group button').length,
      heroTitleSize: Number.parseFloat(getComputedStyle(root.querySelector('.txzz-cinema58-hero-copy h2')).fontSize),
      background: getComputedStyle(shell).backgroundColor,
      heroHeight: Math.round(hero.getBoundingClientRect().height),
      overflowX: shell.scrollWidth - shell.clientWidth
    };
  })()`);
  check("桌面首页路由", desktop.route === "home", JSON.stringify(desktop));
  check("桌面首页真实片单", desktop.cards > 0, `${desktop.cards}`);
  check("完整桌面导航", desktop.nav === 8, `${desktop.nav}`);
  check("标题尺寸受控", desktop.heroTitleSize <= 48, `${desktop.heroTitleSize}px`);
  check("非白色影院背景", !/255,\s*255,\s*255/.test(desktop.background), desktop.background);
  check("桌面无横向溢出", desktop.overflowX <= 1, `${desktop.overflowX}px`);
  result.screenshots.push(await screenshot(sessionId, "txzz-580-desktop-home.png"));

  await evaluate(sessionId, `(() => {
    const root = ${root};
    const freeCard = [...root.querySelectorAll('.txzz-cinema58-movie-card')].find((card) => card.querySelector('.txzz-cinema58-access-badge')?.textContent.includes('免费'));
    (freeCard || root.querySelector('.txzz-cinema58-movie-card'))?.querySelector('.txzz-cinema58-card-poster')?.click();
    return Boolean(freeCard);
  })()`);
  await waitFor(sessionId, `${root}?.querySelector('[data-cinema-route="detail"]') !== null`, 15_000);
  const detail = await evaluate(sessionId, `(() => { const root=${root}; const title=root.querySelector('.txzz-cinema58-detail-copy h2'); return {title:title?.textContent,titleSize:Number.parseFloat(getComputedStyle(title).fontSize),actions:root.querySelectorAll('.txzz-cinema58-detail-actions button').length,hasMediaUrl:/m3u8|play_link|backup_link/i.test(root.querySelector('.txzz-cinema58-detail')?.textContent||'')}; })()`);
  check("详情页动作完整", detail.actions >= 4, JSON.stringify(detail));
  check("详情标题专业尺寸", detail.titleSize <= 44, `${detail.titleSize}px`);
  check("详情未泄漏媒体字段", detail.hasMediaUrl === false);
  result.screenshots.push(await screenshot(sessionId, "txzz-580-desktop-detail.png"));

  await evaluate(sessionId, `(() => { const root=${root}; const play=[...root.querySelectorAll('.txzz-cinema58-detail-actions button')].find((button)=>/立即播放|播放当前集/.test(button.textContent)); play?.click(); return Boolean(play); })()`);
  await waitFor(sessionId, `${root}?.querySelector('[data-cinema-route="playback"]') !== null`, 15_000);
  await waitFor(sessionId, `${root}?.querySelector('.txzz-player-shell, .txzz-stream-stage-state') !== null`, 35_000);
  await evaluate(sessionId, `(() => { const root=${root}; const stage=root.querySelector('.txzz-player-shell'); stage?.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:300,clientY:300})); return Boolean(stage); })()`);
  await delay(600);
  const playback = await evaluate(sessionId, `(() => { const root=${root}; return {route:root.querySelector('[data-txzz-cinema-app]')?.dataset.cinemaRoute,player:Boolean(root.querySelector('.txzz-player-shell')),menuTabs:root.querySelectorAll('.txzz-player-menu-tabs button').length,hasSidebar:Boolean(root.querySelector('.txzz-stream-screening-sidebar'))}; })()`);
  check("播放页路由隔离", playback.route === "playback", JSON.stringify(playback));
  check("播放器或可恢复状态已渲染", playback.player || Boolean(await evaluate(sessionId, `${root}?.querySelector('.txzz-stream-stage-state') !== null`)));
  result.screenshots.push(await screenshot(sessionId, "txzz-580-desktop-playback.png"));

  await evaluate(sessionId, "location.hash='#/downloads'; true");
  await waitFor(sessionId, `${root}?.querySelector('[data-cinema-route="downloads"]') !== null`, 12_000);
  const downloads = await evaluate(sessionId, `(() => { const root=${root}; return {dashboard:Boolean(root.querySelector('.txzz-cinema58-download-dashboard')),scheduler:Boolean(root.querySelector('.txzz-cinema58-scheduler')),queue:Boolean(root.querySelector('.txzz-cinema58-download-list-section'))}; })()`);
  check("下载工作台完整", downloads.dashboard && downloads.scheduler && downloads.queue, JSON.stringify(downloads));
  result.screenshots.push(await screenshot(sessionId, "txzz-580-desktop-downloads.png"));

  await evaluate(sessionId, "location.hash='#/storage'; true");
  await waitFor(sessionId, `${root}?.querySelector('[data-cinema-route="storage"]') !== null`, 12_000);
  const storage = await evaluate(sessionId, `(() => { const root=${root}; return {gauge:Boolean(root.querySelector('.txzz-cinema58-storage-gauge')),title:root.querySelector('.txzz-cinema58-storage-title h2')?.textContent}; })()`);
  check("存储管家完整", storage.gauge && storage.title === "存储管家", JSON.stringify(storage));
  result.screenshots.push(await screenshot(sessionId, "txzz-580-desktop-storage.png"));

  await viewport(sessionId, 390, 844, true);
  await evaluate(sessionId, "location.hash='#/home'; true");
  await waitFor(sessionId, `${root}?.querySelector('[data-cinema-route="home"]') !== null`, 12_000);
  await delay(500);
  const mobile = await evaluate(sessionId, `(() => { const root=${root}; const shell=root.querySelector('.txzz-cinema58-shell'); const nav=root.querySelector('.txzz-cinema58-mobile-nav'); return {navDisplay:getComputedStyle(nav).display,navItems:nav.querySelectorAll('button').length,overflowX:shell.scrollWidth-shell.clientWidth,heroTitleSize:Number.parseFloat(getComputedStyle(root.querySelector('.txzz-cinema58-hero-copy h2')).fontSize),viewport:[innerWidth,innerHeight]}; })()`);
  check("手机底部导航", mobile.navDisplay === "grid" && mobile.navItems === 5, JSON.stringify(mobile));
  check("手机无横向溢出", mobile.overflowX <= 1, `${mobile.overflowX}px`);
  check("手机标题不过大", mobile.heroTitleSize <= 29, `${mobile.heroTitleSize}px`);
  result.screenshots.push(await screenshot(sessionId, "txzz-580-mobile-390x844.png"));

  await viewport(sessionId, 844, 390, true);
  await delay(450);
  const landscape = await evaluate(sessionId, `(() => { const root=${root}; const shell=root.querySelector('.txzz-cinema58-shell'); return {overflowX:shell.scrollWidth-shell.clientWidth,heroHeight:Math.round(root.querySelector('.txzz-cinema58-hero')?.getBoundingClientRect().height||0),viewport:[innerWidth,innerHeight]}; })()`);
  check("横屏无横向溢出", landscape.overflowX <= 1, `${landscape.overflowX}px`);
  check("横屏 Hero 不挤压", landscape.heroHeight >= 280, `${landscape.heroHeight}px`);
  result.screenshots.push(await screenshot(sessionId, "txzz-580-landscape-844x390.png"));

  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const reducedMotion = await evaluate(sessionId, `(() => { const root=${root}; const image=root.querySelector('.txzz-cinema58-hero-backdrop img'); return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,animationDuration:getComputedStyle(image).animationDuration}; })()`);
  check("减少动态效果回退", reducedMotion.matches && ["0s", "0.00001s"].includes(reducedMotion.animationDuration), JSON.stringify(reducedMotion));

  result.completedAt = new Date().toISOString();
  result.passed = result.checks.every((item) => item.passed);
} catch (error) {
  result.completedAt = new Date().toISOString();
  result.passed = false;
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.chromeStderr = chromeStderr.slice(-4000);
} finally {
  const reportPath = join(outputDirectory, "txzz-580-chrome-dev-report.json");
  writeFileSync(reportPath, JSON.stringify(result, null, 2));
  try { await cdp.send("Browser.close"); } catch { chrome.kill(); }
  process.stdout.write(`${JSON.stringify({ passed: result.passed, reportPath, checks: result.checks, screenshots: result.screenshots, error: result.error || null }, null, 2)}\n`);
}

if (!result.passed) process.exitCode = 1;
