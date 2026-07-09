import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Ban, CheckCircle, Copy, ExternalLink, Info, Lightbulb, Package, Radio, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import type { BridgeState, Page, WorkerDiagnostics } from "../types";
import { formatRelativeTime } from "../helpers";
import { APP_BUILD, APP_VERSION_LABEL, ART_PLAYER_VERSION, HLS_CORE_VERSION } from "../constants";
import { UpdateCenter } from "../update/UpdateCenter";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage?: (page: Page, intent?: Record<string, unknown>) => void;
};

const cacheItems = ["插件本地账号池缓存","远程账号池摘要缓存","播放状态缓存","下载任务缓存","页面监听运行缓存","广告清理运行状态","旧版本默认配置"];
const DIAGNOSTICS_CACHE_KEY = "txzzLastWorkerDiagnostics";

type CloudServiceCheck = { ok: boolean; text: string; diagnostics?: WorkerDiagnostics; cached?: boolean; baseUrl?: string };

// 统一服务地址格式，让上次体检记录只匹配同一个云端服务地址。
function normalizeServiceBaseUrl(baseUrl: string) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

// 按新旧服务端能力逐级探测，兼容还没有升级智能诊断接口的旧部署。
async function inspectCloudService(baseUrl: string): Promise<CloudServiceCheck> {
  const base = normalizeServiceBaseUrl(baseUrl);
  const endpoints = ["/v1/diagnostics", "/v1/status", "/v1/health"];
  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${base}${endpoint}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json().catch(() => ({}));
      const diagnostics: WorkerDiagnostics | undefined = data?.diagnostics || data?.status?.diagnostics;
      if (res.ok && diagnostics) {
        return {
          ok: data?.ok !== false && diagnostics.level !== "error",
          text: diagnostics.summary || "云端服务诊断完成。",
          diagnostics,
          baseUrl: base
        };
      }
      if (res.ok && data?.ok) {
        return {
          ok: true,
          text: `云端服务在线，当前部署暂未提供智能诊断摘要。`,
          diagnostics: {
            level: "info",
            score: 72,
            summary: "连接正常，但建议升级云端服务以获得密钥、数据库和账号池分项诊断。",
            checkedAt: data.time,
            checks: [{ key: "health", label: "基础连接", level: "ok", message: `服务在线，构建 ${data.build || "未记录"}。` }],
            suggestions: ["部署新版云端服务后，可在此查看完整体检结果和处理建议。"]
          },
          baseUrl: base
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { ok: false, text: `连接失败：${lastError.slice(0, 80) || "请检查地址是否正确"}`, baseUrl: base };
}

function levelClasses(level?: string) {
  if (level === "ok") return { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-400", border: "border-emerald-100" };
  if (level === "warn") return { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400", border: "border-amber-100" };
  if (level === "error") return { bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-400", border: "border-rose-100" };
  return { bg: "bg-sky-50", text: "text-sky-600", dot: "bg-sky-400", border: "border-sky-100" };
}

function levelText(level?: string) {
  if (level === "ok") return "正常";
  if (level === "warn") return "需关注";
  if (level === "error") return "需处理";
  return "提示";
}

function buildDiagnosticsReport(diagnostics?: WorkerDiagnostics) {
  if (!diagnostics) return "";
  const checks = (diagnostics.checks || [])
    .map((item) => `- ${item.label || "检查项"}：${levelText(item.level)}，${item.message || "暂无详情"}`)
    .join("\n");
  const suggestions = (diagnostics.suggestions || [])
    .map((item) => `- ${item}`)
    .join("\n");
  const actions = (diagnostics.nextActions || [])
    .map((item) => `- ${item.label || "处理动作"}：${item.detail || "暂无详情"}`)
    .join("\n");
  const account = diagnostics.accountsSummary;
  return [
    "糖心志者云端服务体检报告",
    `体检结果：${levelText(diagnostics.level)}`,
    `体检分数：${Math.round(Number(diagnostics.score ?? 0))}`,
    `体检摘要：${diagnostics.summary || "未记录"}`,
    `检查时间：${diagnostics.checkedAt || "未记录"}`,
    account ? `账号摘要：总数 ${account.total ?? 0}，启用 ${account.enabled ?? 0}，可用 ${account.ok ?? 0}，异常 ${account.error ?? 0}，待验证 ${account.unverified ?? 0}` : "账号摘要：未返回",
    "",
    "分项检查：",
    checks || "- 暂无分项检查",
    "",
    "建议下一步：",
    suggestions || "- 暂无建议",
    "",
    "快捷动作：",
    actions || "- 暂无快捷动作"
  ].join("\n");
}

function hasDiagnosticKey(diagnostics: WorkerDiagnostics | undefined, keys: string[]) {
  return (diagnostics?.checks || []).some((item) => keys.includes(String(item.key || "")) && item.level !== "ok");
}

function readCachedDiagnostics(baseUrl: string): Promise<CloudServiceCheck | null> {
  return new Promise((resolve) => {
    const expectedBaseUrl = normalizeServiceBaseUrl(baseUrl);
    if (!expectedBaseUrl) { resolve(null); return; }
    try {
      chrome.storage.local.get(DIAGNOSTICS_CACHE_KEY, (result) => {
        const cached = result?.[DIAGNOSTICS_CACHE_KEY] as CloudServiceCheck | undefined;
        if (!cached?.diagnostics || cached.baseUrl !== expectedBaseUrl) { resolve(null); return; }
        resolve(cached?.diagnostics ? { ...cached, cached: true } : null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

// 只缓存脱敏后的体检摘要，不保存任何密钥、账号凭据或服务端敏感字段。
function saveCachedDiagnostics(check: CloudServiceCheck | null) {
  try {
    if (!check?.diagnostics) return;
    chrome.storage.local.set({
      [DIAGNOSTICS_CACHE_KEY]: {
        ok: check.ok,
        text: check.text,
        baseUrl: check.baseUrl,
        diagnostics: check.diagnostics
      }
    });
  } catch (_) {}
}

function clearCachedDiagnostics() {
  try {
    chrome.storage.local.remove(DIAGNOSTICS_CACHE_KEY);
  } catch (_) {}
}

export function SettingsPage({ state, onAction, onPage }: Props) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(cacheItems.map((_, i) => i !== 3));
  const [serviceCheck, setServiceCheck] = useState<CloudServiceCheck | null>(null);
  const [checkingService, setCheckingService] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let alive = true;
    readCachedDiagnostics(state.remote?.baseUrl || "").then((cached) => {
      if (!alive) return;
      setServiceCheck(cached);
    });
    return () => { alive = false; };
  }, [state.remote?.baseUrl]);

  const checkWorkerHealth = async () => {
    const url = state.remote?.baseUrl || "";
    if (!url) { setServiceCheck({ ok: false, text: "请先在账号池页面配置云端服务地址" }); return; }
    setCheckingService(true); setServiceCheck(null);
    const result = await inspectCloudService(url);
    setServiceCheck(result);
    saveCachedDiagnostics(result);
    setCheckingService(false);
  };

  const clearDiagnosticsHistory = () => {
    clearCachedDiagnostics();
    setServiceCheck(null);
  };

  const copyDiagnostics = async () => {
    const report = buildDiagnosticsReport(diagnostics);
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus("体检报告已复制");
    } catch (_) {
      setCopyStatus("复制失败，请稍后重试");
    }
    window.setTimeout(() => setCopyStatus(""), 1600);
  };

  const diagnostics = serviceCheck?.diagnostics;
  const diagnosticTone = levelClasses(diagnostics?.level);
  const accountProblem = hasDiagnosticKey(diagnostics, ["accounts", "usable", "risk", "unverified"]);
  const shouldShowInvalid = hasDiagnosticKey(diagnostics, ["risk"]);
  const shouldOpenAdd = hasDiagnosticKey(diagnostics, ["accounts"]);
  const adCleaner = state.adCleaner || {};
  const adCleanerTotal = Number(adCleaner.total || 0);
  const adCleanerLastRun = adCleaner.lastRunAt ? formatRelativeTime(adCleaner.lastRunAt) : "等待清理";

  return (
    <div className="space-y-4 p-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-400 via-rose-400 to-purple-500 p-4 text-white shadow-lg">
        <div className="absolute right-3 top-2 select-none text-5xl opacity-15 pointer-events-none">🍭</div>
        <div className="mb-2 flex items-center gap-2"><Package size={18} /><span className="font-bold">糖心志者</span></div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "版本", value: APP_VERSION_LABEL },
            { label: "构建", value: APP_BUILD },
            { label: "播放器", value: `ArtPlayer ${ART_PLAYER_VERSION}` },
            { label: "HLS内核", value: `hls.js ${HLS_CORE_VERSION}` },
            { label: "mux.js", value: "7.0.0" },
            { label: "升级系统", value: "v4" },
            { label: "React", value: "18 + TSX" }
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/20 px-3 py-1.5 backdrop-blur">
              <p className="text-[10px] opacity-70">{item.label}</p>
              <p className="font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700"><Activity size={14} className="text-sky-400" /> 云端服务体检</h3>
        <p className="text-xs text-purple-400">依次检测智能诊断、整体状态和基础连接，帮助快速定位密钥、数据库和账号池问题。</p>
        {serviceCheck && !diagnostics && (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${serviceCheck.ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {serviceCheck.ok ? <CheckCircle size={13} className="shrink-0" /> : <AlertTriangle size={13} className="shrink-0" />}
            <span>{serviceCheck.text}</span>
          </div>
        )}
        {diagnostics && (
          <div className={`space-y-3 rounded-2xl border ${diagnosticTone.border} ${diagnosticTone.bg} p-3`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold ${diagnosticTone.text}`}>{serviceCheck?.cached ? "上次体检" : "体检结果"} · {levelText(diagnostics.level)}</p>
                <p className="mt-1 text-xs leading-relaxed text-purple-700">{diagnostics.summary || serviceCheck.text}</p>
                {diagnostics.checkedAt && <p className="mt-1 text-[10px] text-purple-300">检查于 {formatRelativeTime(diagnostics.checkedAt)}{serviceCheck?.cached ? "，可重新体检刷新状态" : ""}</p>}
              </div>
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                <span className={`text-lg font-bold ${diagnosticTone.text}`}>{Math.round(Number(diagnostics.score ?? 0))}</span>
                <span className="text-[9px] text-purple-300">分</span>
              </div>
            </div>

            <div className="grid gap-2">
              {(diagnostics.checks || []).map((item) => {
                const tone = levelClasses(item.level);
                return (
                  <div key={`${item.key}-${item.label}`} className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-purple-700">{item.label || "检查项"} · {levelText(item.level)}</p>
                      <p className="text-[10px] leading-relaxed text-purple-400">{item.message || "暂无详情"}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {(diagnostics.suggestions || []).length > 0 && (
              <div className="space-y-1 rounded-xl bg-white/80 px-3 py-2">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-purple-700"><Lightbulb size={11} className="text-amber-400" /> 建议下一步</p>
                {(diagnostics.suggestions || []).slice(0, 3).map((item) => (
                  <p key={item} className="text-[10px] leading-relaxed text-purple-400">{item}</p>
                ))}
              </div>
            )}

            {diagnostics.accountsSummary && (
              <div className="grid grid-cols-5 gap-1 rounded-xl bg-white/80 px-2 py-2 text-center">
                {[
                  { label: "总数", value: diagnostics.accountsSummary.total ?? 0 },
                  { label: "启用", value: diagnostics.accountsSummary.enabled ?? 0 },
                  { label: "可用", value: diagnostics.accountsSummary.ok ?? 0 },
                  { label: "异常", value: diagnostics.accountsSummary.error ?? 0 },
                  { label: "待验", value: diagnostics.accountsSummary.unverified ?? 0 }
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <p className="text-[10px] text-purple-300">{item.label}</p>
                    <p className="truncate text-xs font-semibold text-purple-700">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {(diagnostics.nextActions || []).length > 0 && (
              <div className="space-y-1 rounded-xl bg-white/80 px-3 py-2">
                <p className="text-[11px] font-semibold text-purple-700">服务端建议动作</p>
                {(diagnostics.nextActions || []).slice(0, 3).map((item) => (
                  <p key={item.id || item.label} className="text-[10px] leading-relaxed text-purple-400">
                    {item.label || "处理动作"}：{item.detail || "暂无详情"}
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => onPage?.("accounts", { showInvalid: shouldShowInvalid, openAdd: shouldOpenAdd })}
                className="flex items-center justify-center gap-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-medium text-purple-600 shadow-sm transition-transform active:scale-95"
              >
                <Users size={12} /> {accountProblem ? "处理账号池" : "查看账号池"}
              </button>
              <button
                onClick={() => onAction("sync-remote")}
                className="flex items-center justify-center gap-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-medium text-sky-600 shadow-sm transition-transform active:scale-95"
              >
                <RefreshCw size={12} /> 同步账号
              </button>
              <button
                onClick={copyDiagnostics}
                className="flex items-center justify-center gap-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-medium text-pink-600 shadow-sm transition-transform active:scale-95"
              >
                <Copy size={12} /> 复制报告
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 text-[10px] text-purple-400">
              {copyStatus && <span>{copyStatus}</span>}
              {serviceCheck?.cached && (
                <button onClick={clearDiagnosticsHistory} className="rounded-full bg-white/80 px-2 py-0.5 text-purple-500">
                  清除上次体检
                </button>
              )}
            </div>
          </div>
        )}
        {state.remote?.baseUrl && <p className="truncate text-[10px] text-purple-300 font-mono">{state.remote.baseUrl}</p>}
        <div className="flex gap-2">
          <button onClick={checkWorkerHealth} disabled={checkingService} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 py-2 text-xs font-medium text-white shadow-sm transition-all active:scale-95 disabled:opacity-70">
            {checkingService ? <><RefreshCw size={13} className="animate-spin" /> 体检中…</> : <><Radio size={13} /> 开始体检</>}
          </button>
          <button onClick={() => onAction("sync-remote")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-purple-200 py-2 text-xs font-medium text-purple-500 transition-transform active:scale-95">
            <RefreshCw size={13} /> 同步账号
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-purple-700"><Sparkles size={14} className="text-pink-400" /> 展示覆盖</h3>
        <p className="mb-3 text-xs text-purple-400">{state.displayPatchApplied ? "展示覆盖已应用，VIP 永久有效、余额 999、永久尤物圈已生效。" : "尚未应用展示覆盖，点击下方按钮立即应用。"}</p>
        <button onClick={() => onAction("apply")} className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-white shadow-sm transition-all active:scale-95 ${state.displayPatchApplied ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-gradient-to-r from-pink-400 to-rose-500"}`}>
          <Sparkles size={13} />{state.displayPatchApplied ? "重新应用展示覆盖" : "立即应用展示覆盖"}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700"><Ban size={14} className="text-emerald-500" /> 广告清理</h3>
        <p className="text-xs leading-relaxed text-purple-400">严格模式：仅清理实测开屏 <code className="text-[10px]">.ad-splash</code>，不扫描其它弹层，避免误伤网站与插件功能。</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "总处理", value: adCleanerTotal },
            { label: "移除", value: Number(adCleaner.removed || 0) },
            { label: "拦截", value: Number(adCleaner.blockedClicks || 0) }
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-emerald-50 px-2 py-2">
              <p className="text-[10px] text-emerald-500">{item.label}</p>
              <p className="text-base font-bold text-purple-800">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-sky-50 px-2 py-2">
            <p className="text-[10px] text-sky-500">开屏层</p>
            <p className="text-base font-bold text-purple-800">{Number(adCleaner.splashHits || 0)}</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-2 py-2">
            <p className="text-[10px] text-amber-500">倒计时</p>
            <p className="text-base font-bold text-purple-800">{Number(adCleaner.countdownHits || 0)}</p>
          </div>
        </div>
        <div className="rounded-xl bg-purple-50 px-3 py-2 text-[10px] leading-relaxed text-purple-400">
          <p>规则数量：{Number(adCleaner.selectors || 0)} 条 · 引擎 {String(adCleaner.version || "v3")}</p>
          <p>最近清理：{adCleanerLastRun}{adCleaner.bootActive ? " · 首屏强化中" : ""}</p>
          <p className="line-clamp-2">命中原因：{adCleaner.lastReason || "暂无"}{adCleaner.lastMatched ? ` / ${adCleaner.lastMatched}` : ""}</p>
        </div>
        <button onClick={() => onAction("clean-ads")} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-sky-500 py-2 text-xs font-medium text-white shadow-sm transition-transform active:scale-95">
          <Ban size={13} /> 立即清理广告
        </button>
      </div>

      <UpdateCenter state={state} onAction={onAction} />

      <div className="space-y-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700"><Trash2 size={14} className="text-rose-400" /> 清除数据缓存</h3>
        <p className="text-xs text-purple-400">覆盖安装后如出现旧账号、旧配置残留，可在此清除。</p>
        <div className="space-y-2">
          {cacheItems.map((item, index) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 select-none">
              <div onClick={() => setCacheChecked((prev) => prev.map((v, i) => i === index ? !v : v))} className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-2 transition-all ${cacheChecked[index] ? "border-transparent bg-gradient-to-br from-pink-400 to-purple-500" : "border-purple-200 bg-white"}`}>
                {cacheChecked[index] && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-xs text-purple-700">{item}</span>
            </label>
          ))}
        </div>
        <button onClick={() => setShowClearConfirm(true)} className="flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 py-2 text-xs font-medium text-white shadow-sm transition-transform active:scale-95">
          <Trash2 size={13} /> 清除选中缓存
        </button>
      </div>

      <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-purple-700"><Info size={14} className="text-purple-400" /> 关于项目</h3>
        <p className="mb-3 text-xs text-purple-400">糖心志者 {APP_VERSION_LABEL} 是一个 Chrome Manifest V3 浏览器插件，提供账号池管理、展示覆盖、播放资源获取、视频下载等功能。</p>
        <button onClick={() => onAction("about")} className="flex w-full items-center justify-center gap-1 rounded-xl border border-purple-200 py-2 text-xs font-medium text-purple-500 transition-transform active:scale-95">
          <ExternalLink size={13} /> 打开项目主页
        </button>
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500">
                <AlertTriangle size={16} className="text-white" />
              </div>
              <h3 className="font-bold text-purple-800">确认清除缓存？</h3>
            </div>
            <p className="mb-4 text-xs text-purple-400">清除后需要重新同步账号池，建议操作后刷新页面。</p>
            <div className="flex gap-2">
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 rounded-xl border border-pink-200 py-2 text-sm font-medium text-purple-500">取消</button>
              <button onClick={() => { onAction("clear-cache"); setShowClearConfirm(false); }} className="flex-1 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 py-2 text-sm font-medium text-white shadow-md">确认清除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
