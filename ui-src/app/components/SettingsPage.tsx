import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Ban, CheckCircle, Copy, ExternalLink, Info, Lightbulb, Radio, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import type { BridgeState, Page, WorkerDiagnostics } from "../types";
import { formatRelativeTime } from "../helpers";
import { APP_BUILD, APP_VERSION_LABEL, ART_PLAYER_VERSION, HLS_CORE_VERSION } from "../constants";
import { UpdateCenter } from "../update/UpdateCenter";
import {
  HeroBanner,
  ModalSheet,
  PageShell,
  Pill,
  SectionCard,
  SoftButton,
  StatGrid
} from "./ui/primitives";

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
    <PageShell>
      <HeroBanner
        eyebrow="设置中心"
        title="糖心志者"
        subtitle={`${APP_VERSION_LABEL} · 构建 ${APP_BUILD}`}
        emoji="⚙️"
        badges={
          <>
            <Pill className="bg-white/20 text-white backdrop-blur">ArtPlayer {ART_PLAYER_VERSION}</Pill>
            <Pill className="bg-white/20 text-white backdrop-blur">hls.js {HLS_CORE_VERSION}</Pill>
            <Pill className="bg-white/20 text-white backdrop-blur">升级系统 v4</Pill>
            <Pill className="bg-white/20 text-white backdrop-blur">React 18</Pill>
          </>
        }
      />

      <StatGrid
        items={[
          { label: "版本", value: APP_VERSION_LABEL, tone: "pink" },
          { label: "广告清理", value: adCleanerTotal, tone: "emerald" },
          { label: "开屏层", value: Number(adCleaner.splashHits || 0), tone: "sky" },
          { label: "拦截", value: Number(adCleaner.blockedClicks || 0), tone: "amber" }
        ]}
      />

      <SectionCard title="云端服务体检" icon={Activity} hint="依次探测智能诊断 / 状态 / 健康接口" tone="sky">
        <div className="space-y-3">
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
                  <p className={`text-[11px] font-semibold ${diagnosticTone.text}`}>
                    {serviceCheck?.cached ? "上次体检" : "体检结果"} · {levelText(diagnostics.level)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-purple-700">{diagnostics.summary || serviceCheck?.text}</p>
                  {diagnostics.checkedAt && (
                    <p className="mt-1 text-[10px] text-purple-300">
                      检查于 {formatRelativeTime(diagnostics.checkedAt)}{serviceCheck?.cached ? "，可重新体检刷新" : ""}
                    </p>
                  )}
                </div>
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/90 shadow-sm">
                  <span className={`text-lg font-bold ${diagnosticTone.text}`}>{Math.round(Number(diagnostics.score ?? 0))}</span>
                  <span className="text-[9px] text-purple-300">分</span>
                </div>
              </div>
              <div className="grid gap-1.5">
                {(diagnostics.checks || []).map((item) => {
                  const tone = levelClasses(item.level);
                  return (
                    <div key={`${item.key}-${item.label}`} className="flex items-start gap-2 rounded-xl bg-white/85 px-3 py-2">
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
                <div className="space-y-1 rounded-xl bg-white/85 px-3 py-2">
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-purple-700"><Lightbulb size={11} className="text-amber-400" /> 建议下一步</p>
                  {(diagnostics.suggestions || []).slice(0, 3).map((item) => (
                    <p key={item} className="text-[10px] leading-relaxed text-purple-400">{item}</p>
                  ))}
                </div>
              )}
              {diagnostics.accountsSummary && (
                <div className="grid grid-cols-5 gap-1 rounded-xl bg-white/85 px-2 py-2 text-center">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <SoftButton size="sm" variant="secondary" icon={Users} className="w-full" onClick={() => onPage?.("accounts", { showInvalid: shouldShowInvalid, openAdd: shouldOpenAdd })}>
                  {accountProblem ? "处理账号池" : "查看账号池"}
                </SoftButton>
                <SoftButton size="sm" variant="sky" icon={RefreshCw} className="w-full" onClick={() => onAction("sync-remote")}>同步账号</SoftButton>
                <SoftButton size="sm" variant="primary" icon={Copy} className="w-full" onClick={copyDiagnostics}>复制报告</SoftButton>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] text-purple-400">
                {copyStatus && <span>{copyStatus}</span>}
                {serviceCheck?.cached && (
                  <button type="button" onClick={clearDiagnosticsHistory} className="rounded-full bg-white/80 px-2 py-0.5 text-purple-500">清除上次体检</button>
                )}
              </div>
            </div>
          )}
          {state.remote?.baseUrl && <p className="truncate font-mono text-[10px] text-purple-300">{state.remote.baseUrl}</p>}
          <div className="grid grid-cols-2 gap-2">
            <SoftButton className="w-full" variant="sky" icon={checkingService ? RefreshCw : Radio} disabled={checkingService} onClick={checkWorkerHealth}>
              {checkingService ? "体检中…" : "开始体检"}
            </SoftButton>
            <SoftButton className="w-full" variant="secondary" icon={RefreshCw} onClick={() => onAction("sync-remote")}>同步账号</SoftButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="展示覆盖" icon={Sparkles} hint={state.displayPatchApplied ? "VIP 永久、余额 999、尤物圈已生效" : "尚未应用展示覆盖"}>
        <SoftButton
          className="w-full"
          variant={state.displayPatchApplied ? "emerald" : "primary"}
          icon={Sparkles}
          onClick={() => onAction("apply")}
        >
          {state.displayPatchApplied ? "重新应用展示覆盖" : "立即应用展示覆盖"}
        </SoftButton>
      </SectionCard>

      <SectionCard title="广告清理" icon={Ban} hint="严格模式：仅清理实测 .ad-splash 开屏" tone="emerald">
        <div className="space-y-3">
          <StatGrid
            items={[
              { label: "总处理", value: adCleanerTotal, tone: "emerald" },
              { label: "移除", value: Number(adCleaner.removed || 0), tone: "sky" },
              { label: "拦截", value: Number(adCleaner.blockedClicks || 0), tone: "amber" },
              { label: "开屏层", value: Number(adCleaner.splashHits || 0), tone: "purple" }
            ]}
          />
          <div className="rounded-xl bg-purple-50 px-3 py-2 text-[10px] leading-relaxed text-purple-400">
            <p>规则 {Number(adCleaner.selectors || 0)} 条 · 引擎 {String(adCleaner.version || "v3")} · 倒计时 {Number(adCleaner.countdownHits || 0)}</p>
            <p>最近清理：{adCleanerLastRun}{adCleaner.bootActive ? " · 首屏强化中" : ""}</p>
            <p className="line-clamp-2">命中：{adCleaner.lastReason || "暂无"}{adCleaner.lastMatched ? ` / ${adCleaner.lastMatched}` : ""}</p>
          </div>
          <SoftButton className="w-full" variant="emerald" icon={Ban} onClick={() => onAction("clean-ads")}>立即清理广告</SoftButton>
        </div>
      </SectionCard>

      <UpdateCenter state={state} onAction={onAction} />

      <SectionCard title="清除数据缓存" icon={Trash2} hint="覆盖安装后如有旧账号/配置残留可清除" tone="rose">
        <div className="space-y-3">
          <div className="space-y-1.5">
            {cacheItems.map((item, index) => (
              <label key={item} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-purple-50 select-none">
                <div
                  onClick={() => setCacheChecked((prev) => prev.map((v, i) => (i === index ? !v : v)))}
                  className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-2 transition ${
                    cacheChecked[index] ? "border-transparent bg-gradient-to-br from-pink-400 to-purple-500" : "border-purple-200 bg-white"
                  }`}
                >
                  {cacheChecked[index] && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-xs text-purple-700">{item}</span>
              </label>
            ))}
          </div>
          <SoftButton className="w-full" variant="danger" icon={Trash2} onClick={() => setShowClearConfirm(true)}>清除选中缓存</SoftButton>
        </div>
      </SectionCard>

      <SectionCard title="关于项目" icon={Info} hint={`糖心志者 ${APP_VERSION_LABEL}`}>
        <div className="space-y-3">
          <p className="text-[11px] leading-relaxed text-purple-400">
            Chrome Manifest V3 插件：账号池、展示覆盖、播放资源、视频下载与专业升级系统。界面采用统一设计系统，移动端完整适配。
          </p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {[
              { label: "mux.js", value: "7.0.0" },
              { label: "构建", value: APP_BUILD },
              { label: "播放器", value: ART_PLAYER_VERSION },
              { label: "HLS", value: HLS_CORE_VERSION }
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-purple-50 px-2.5 py-2">
                <p className="text-purple-300">{item.label}</p>
                <p className="font-semibold text-purple-700">{item.value}</p>
              </div>
            ))}
          </div>
          <SoftButton className="w-full" variant="secondary" icon={ExternalLink} onClick={() => onAction("about")}>打开项目主页</SoftButton>
        </div>
      </SectionCard>

      <ModalSheet
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="确认清除缓存？"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <SoftButton variant="secondary" className="w-full" onClick={() => setShowClearConfirm(false)}>取消</SoftButton>
            <SoftButton variant="danger" className="w-full" onClick={() => { onAction("clear-cache"); setShowClearConfirm(false); }}>确认清除</SoftButton>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500">
            <AlertTriangle size={18} className="text-white" />
          </div>
          <p className="text-xs leading-relaxed text-purple-500">清除后需要重新同步账号池，建议操作后刷新页面。下载目录中的已保存文件不会删除。</p>
        </div>
      </ModalSheet>
    </PageShell>
  );
}
