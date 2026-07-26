import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Ban, CheckCircle, Copy, Database, ExternalLink, Info, Lightbulb, Radio, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import type { AccountsPageIntent, BridgeState, Page, SettingsPageIntent, SettingsSection, WorkerDiagnostics } from "../types";
import { requestCloudDiagnostics } from "../bridge";
import { formatRelativeTime } from "../helpers";
import { APP_BUILD, APP_VERSION_LABEL, ART_PLAYER_VERSION, HLS_CORE_VERSION } from "../constants";
import { UpdateCenter } from "../update/UpdateCenter";
import {
  ModalSheet,
  PageIntro,
  PageShell,
  Pill,
  SectionCard,
  SegmentedControl,
  SoftButton,
  StatGrid
} from "./ui/primitives";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage?: (page: Page, intent?: AccountsPageIntent) => void;
  intent?: SettingsPageIntent;
  onIntentHandled?: () => void;
};

const clearDataItems = [
  "本地与云端账号池摘要、已保存的本地账号凭据",
  "播放详情、线路探测、下载任务与运行记录",
  "云端体检、升级检查和界面偏好缓存",
  "广告清理统计与当前页面运行状态"
];
const DIAGNOSTICS_CACHE_KEY = "txzzLastWorkerDiagnostics";

type CloudServiceCheck = { ok: boolean; text: string; diagnostics?: WorkerDiagnostics; cached?: boolean; baseUrl?: string };

// 统一服务地址格式，让上次体检记录只匹配同一个云端服务地址。
function normalizeServiceBaseUrl(baseUrl: string) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

// 体检由扩展后台按已保存的服务地址代发，页面只接收脱敏诊断摘要。
async function inspectCloudService(baseUrl: string): Promise<CloudServiceCheck> {
  const base = normalizeServiceBaseUrl(baseUrl);
  try {
    const response = await requestCloudDiagnostics();
    const diagnostics = response.diagnostics || undefined;
    if (diagnostics) {
      return {
        ok: response.ok !== false && diagnostics.level !== "error",
        text: diagnostics.summary || "云端服务诊断完成。",
        diagnostics,
        baseUrl: response.baseUrl || base
      };
    }
    const status = (response.status || {}) as { build?: string; time?: string; ready?: boolean };
    if (response.ok) {
      return {
        ok: true,
        text: "云端服务在线，当前部署暂未提供智能诊断摘要。",
        diagnostics: {
          level: "info",
          score: 72,
          summary: "连接正常，但建议升级云端服务以获得完整的安全与账号池分项诊断。",
          checkedAt: status.time,
          checks: [{ key: "health", label: "基础连接", level: "ok", message: `服务在线，构建 ${status.build || "未记录"}。` }],
          suggestions: ["部署新版云端服务后，可在此查看完整体检结果和处理建议。"]
        },
        baseUrl: response.baseUrl || base
      };
    }
    return { ok: false, text: "云端服务尚未就绪，请检查服务地址和部署配置。", baseUrl: response.baseUrl || base };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, text: `连接失败：${message.slice(0, 120) || "请检查服务地址"}`, baseUrl: base };
  }
}

function levelClasses(level?: string) {
  if (level === "ok") return { bg: "bg-success-50", text: "text-success-600", dot: "bg-success-500", border: "border-success-100" };
  if (level === "warn") return { bg: "bg-warning-50", text: "text-warning-600", dot: "bg-warning-500", border: "border-warning-100" };
  if (level === "error") return { bg: "bg-danger-50", text: "text-danger-600", dot: "bg-danger-500", border: "border-danger-100" };
  return { bg: "bg-info-50", text: "text-info-600", dot: "bg-info-500", border: "border-info-100" };
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

export function SettingsPage({ state, onAction, onPage, intent = {}, onIntentHandled }: Props) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(intent.section || "service");
  const [serviceCheck, setServiceCheck] = useState<CloudServiceCheck | null>(null);
  const [checkingService, setCheckingService] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const updateSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!intent.section) return;
    setSettingsSection(intent.section);
    // 等目标分区完成渲染后再聚焦，键盘和读屏用户会直接落到所请求的设置模块。
    const frame = window.requestAnimationFrame(() => {
      if (intent.section === "updates" && updateSectionRef.current) {
        updateSectionRef.current.scrollIntoView({ block: "start", behavior: "auto" });
        updateSectionRef.current.focus({ preventScroll: true });
      }
      onIntentHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [intent.section]);

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
      <PageIntro
        eyebrow="CARE CENTER"
        title="照料中心"
        description="把云端体检、体验功能、版本升级和本地数据分开照料，状态更容易看懂。"
        meta={
          <>
            <Pill className="bg-brand-50 text-brand-700">{APP_VERSION_LABEL}</Pill>
            <Pill className="bg-slate-100 font-mono text-slate-600">构建 {APP_BUILD}</Pill>
            <Pill className={state.remote?.lastError ? "bg-danger-50 text-danger-600" : state.remote?.lastSyncAt ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>
              {state.remote?.lastError ? "云端异常" : state.remote?.lastSyncAt ? "云端已连接" : "云端待同步"}
            </Pill>
          </>
        }
      />

      <SegmentedControl
        value={settingsSection}
        onChange={setSettingsSection}
        items={[
          { key: "service", label: "云端体检" },
          { key: "experience", label: "体验魔法" },
          { key: "updates", label: "版本更新" },
          { key: "data", label: "数据收纳" }
        ]}
      />

      {settingsSection === "service" && (
      <SectionCard title="云端健康体检" icon={Activity} hint="按已填写的服务地址依次检查诊断、状态与健康接口" tone="sky">
        <div className="space-y-3">
          {serviceCheck && !diagnostics && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] ${serviceCheck.ok ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600"}`}>
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
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{diagnostics.summary || serviceCheck?.text}</p>
                  {diagnostics.checkedAt && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      检查于 {formatRelativeTime(diagnostics.checkedAt)}{serviceCheck?.cached ? "，可重新体检刷新" : ""}
                    </p>
                  )}
                </div>
                <div className="flex h-14 w-14 shrink-0 rotate-[2deg] flex-col items-center justify-center rounded-[1.15rem] border-2 border-white bg-white/90 shadow-sm">
                  <span className={`text-lg font-bold ${diagnosticTone.text}`}>{Math.round(Number(diagnostics.score ?? 0))}</span>
                  <span className="text-[11px] text-slate-400">分</span>
                </div>
              </div>
              <div className="grid gap-1.5">
                {(diagnostics.checks || []).map((item) => {
                  const tone = levelClasses(item.level);
                  return (
                    <div key={`${item.key}-${item.label}`} className="flex items-start gap-2 rounded-xl bg-white/85 px-3 py-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-slate-700">{item.label || "检查项"} · {levelText(item.level)}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.message || "暂无详情"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(diagnostics.suggestions || []).length > 0 && (
                <div className="space-y-1 rounded-xl bg-white/85 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><Lightbulb size={13} className="text-warning-500" /> 建议下一步</p>
                  {(diagnostics.suggestions || []).slice(0, 3).map((item) => (
                    <p key={item} className="text-[11px] leading-relaxed text-slate-500">{item}</p>
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
                      <p className="text-[11px] text-slate-400">{item.label}</p>
                      <p className="truncate text-[13px] font-semibold text-slate-700">{item.value}</p>
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
              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                {copyStatus && <span>{copyStatus}</span>}
                {serviceCheck?.cached && (
                  <button type="button" onClick={clearDiagnosticsHistory} className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">清除上次体检</button>
                )}
              </div>
            </div>
          )}
          {state.remote?.baseUrl && <p className="truncate rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-500">{state.remote.baseUrl}</p>}
          <div className="grid grid-cols-2 gap-2">
            <SoftButton className="w-full" variant="sky" icon={checkingService ? RefreshCw : Radio} disabled={checkingService} onClick={checkWorkerHealth}>
              {checkingService ? "体检中…" : "开始体检"}
            </SoftButton>
            <SoftButton className="w-full" variant="secondary" icon={RefreshCw} onClick={() => onAction("sync-remote")}>同步账号</SoftButton>
          </div>
        </div>
      </SectionCard>
      )}

      {settingsSection === "experience" && (
      <>
      <StatGrid
        items={[
          { label: "广告清理", value: adCleanerTotal, tone: "emerald" },
          { label: "移除元素", value: Number(adCleaner.removed || 0), tone: "sky" },
          { label: "开屏处理", value: Number(adCleaner.splashHits || 0), tone: "purple" },
          { label: "拦截点击", value: Number(adCleaner.blockedClicks || 0), tone: "amber" }
        ]}
      />

      <SectionCard title="展示魔法" icon={Sparkles} hint={state.displayPatchApplied ? "VIP 永久、余额 999、尤物圈已生效" : "尚未应用展示覆盖"}>
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
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
            <p>规则 {Number(adCleaner.selectors || 0)} 条 · 引擎 {String(adCleaner.version || "v3")} · 倒计时 {Number(adCleaner.countdownHits || 0)}</p>
            <p>最近清理：{adCleanerLastRun}{adCleaner.bootActive ? " · 首屏强化中" : ""}</p>
            <p className="line-clamp-2">命中：{adCleaner.lastReason || "暂无"}{adCleaner.lastMatched ? ` / ${adCleaner.lastMatched}` : ""}</p>
          </div>
          <SoftButton className="w-full" variant="emerald" icon={Ban} onClick={() => onAction("clean-ads")}>立即清理广告</SoftButton>
        </div>
      </SectionCard>
      </>
      )}

      {settingsSection === "updates" && (
      <div
        ref={updateSectionRef}
        data-txzz-settings-section="updates"
        tabIndex={-1}
        className="outline-none"
        aria-label="版本升级中心"
      >
        <UpdateCenter state={state} onAction={onAction} />
      </div>
      )}

      {settingsSection === "data" && (
      <SectionCard title="整理本地数据" icon={Database} hint="这是完整重置；界面会明确列出将清理的内容" tone="rose">
        <div className="space-y-4">
          <div className="rounded-2xl border border-danger-100 bg-danger-50/50 p-3.5">
            <p className="text-[12px] font-semibold text-danger-600">将清除以下扩展本地数据</p>
            <ul className="mt-2.5 space-y-2">
              {clearDataItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12px] leading-[1.55] text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger-500" />{item}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] leading-[1.6] text-slate-500">下载到设备中的视频文件不会删除。完成后需重新同步账号池，并建议刷新当前网页。</p>
          <SoftButton className="w-full" variant="danger" icon={Trash2} onClick={() => setShowClearConfirm(true)}>重置全部本地数据</SoftButton>
        </div>
      </SectionCard>
      )}

      {settingsSection === "updates" && (
      <SectionCard title="关于项目" icon={Info} hint={`糖心志者 ${APP_VERSION_LABEL}`}>
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-slate-600">
            Chrome Manifest V3 插件：账号池、展示覆盖、播放资源、视频下载与专业升级系统。界面采用统一设计系统，移动端完整适配。
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {[
              { label: "mux.js", value: "7.0.0" },
              { label: "构建", value: APP_BUILD },
              { label: "播放器", value: ART_PLAYER_VERSION },
              { label: "HLS", value: HLS_CORE_VERSION }
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-slate-400">{item.label}</p>
                <p className="mt-0.5 font-semibold text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>
          <SoftButton className="w-full" variant="secondary" icon={ExternalLink} onClick={() => onAction("about")}>打开项目主页</SoftButton>
        </div>
      </SectionCard>
      )}

      <ModalSheet
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="确认重置全部本地数据？"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <SoftButton variant="secondary" className="w-full" onClick={() => setShowClearConfirm(false)}>取消</SoftButton>
            <SoftButton variant="danger" className="w-full" onClick={() => { onAction("clear-cache", { confirmed: true }); setShowClearConfirm(false); }}>确认重置</SoftButton>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-50 text-danger-500"><AlertTriangle size={18} /></div>
          <p className="text-[13px] leading-6 text-slate-600">本操作会清除全部插件本地数据且无法撤销。下载目录中的已保存文件不会删除。</p>
        </div>
      </ModalSheet>
    </PageShell>
  );
}
