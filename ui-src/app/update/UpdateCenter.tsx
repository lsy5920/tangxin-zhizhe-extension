import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Network,
  Package,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { BridgeState } from "../types";
import { ActionToolbar, Pill, SectionCard, SoftButton } from "../components/ui/primitives";
import {
  buildUpdateCopyText,
  buildUpdateViewModel,
  changelogTypeLabel,
  formatUpdateBytes,
  updateAttemptPhaseLabel,
  updateCheckPhaseLabel,
  updateDownloadActionLabel,
  updateDownloadPhaseLabel,
  updateStatusTone,
  updateUrlHost
} from "./helpers";
import { UpdateProgress } from "./UpdateProgress";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

export function UpdateCenter({ state, onAction }: Props) {
  const [feedback, setFeedback] = useState<{ text: string; level: "success" | "error" } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const feedbackTimer = useRef<number>();
  const vm = buildUpdateViewModel(state);
  const tone = updateStatusTone(vm.status);

  useEffect(() => () => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
  }, []);

  const flash = (text: string, level: "success" | "error") => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    setFeedback({ text, level });
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimer.current = undefined;
    }, 2200);
  };

  const copyText = async (value: string, success: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      flash(success, "success");
    } catch {
      flash("复制失败，请稍后重试", "error");
    }
  };

  const downloadLabel = updateDownloadActionLabel(vm.status);

  return (
    <SectionCard
      title="升级中心"
      icon={Rocket}
      hint="升级系统 v7 · 签名清单、完整包大小与 SHA-256、正式扩展 ID、CRX3 包签名"
      action={<Pill className={tone.badge}>{vm.statusLabel}</Pill>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[11px] font-medium text-slate-500">当前版本</p>
            <p className="mt-1 truncate text-[16px] font-bold text-slate-900">{vm.localVersion}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{vm.localBuild}</p>
          </div>
          <div className={`rounded-2xl border p-3.5 ${vm.status === "available" ? "border-warning-100 bg-warning-50/60" : "border-slate-200 bg-slate-50"}`}>
            <p className="text-[11px] font-medium text-slate-500">远程版本</p>
            <p className={`mt-1 truncate text-[16px] font-bold ${vm.status === "available" ? "text-warning-600" : "text-slate-900"}`}>{vm.remoteVersion}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{vm.remoteBuild}</p>
          </div>
        </div>

        <UpdateProgress vm={vm} />

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><Clock3 size={12} /> 检测缓存</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{vm.cacheLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><Network size={12} /> 镜像健康</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{vm.mirrorHealthLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><FileCheck2 size={12} /> 完整包验证</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{vm.packageProbeLabel}</p>
          </div>
        </div>

        {(vm.status === "saving" || vm.status === "submitted") && (
          <div className="rounded-xl border border-warning-100 bg-warning-50 px-3 py-2.5 text-[11px] leading-relaxed text-warning-700">
            <p className="font-semibold">
              {vm.status === "saving" ? "安全保存页已打开，请在新标签点击保存" : "已通过扩展安全保存页提交 CRX 下载"}
              {vm.downloadId ? ` · 编号 ${vm.downloadId}` : ""}
            </p>
            <p className="mt-1">下载完成不代表安装完成。请打开浏览器扩展管理页，手动安装或覆盖更新。</p>
          </div>
        )}

        {vm.changelog.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
            <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-800"><Sparkles size={13} className="text-brand-600" /> 最近更新</p>
            <div className="space-y-2">
              {vm.changelog.slice(0, 4).map((item, index) => (
                <div key={item.id || index} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{changelogTypeLabel(item.type)}</span>
                    <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">{item.title || "更新记录"}</p>
                  </div>
                  {(item.detail || item.notes) && <p className="mt-1 line-clamp-2 text-[11px] leading-[1.55] text-slate-500">{item.detail || item.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {vm.downloadError && <div role="alert" className="break-words rounded-xl border border-danger-100 bg-danger-50 px-3 py-2.5 text-[11px] leading-relaxed text-danger-600">{vm.downloadError}</div>}

        <ActionToolbar>
          <SoftButton size="sm" variant="secondary" icon={RefreshCw} disabled={vm.busy} onClick={() => onAction("check-update")}>{vm.status === "checking" ? "检查中…" : "实时检查"}</SoftButton>
          <SoftButton size="sm" icon={vm.busy ? RefreshCw : Download} disabled={!vm.canDownload} onClick={() => onAction("download-latest")}>{downloadLabel}</SoftButton>
          <SoftButton size="sm" variant="ghost" aria-expanded={showDetails} aria-controls="txzz-update-advanced" onClick={() => setShowDetails((value) => !value)}>{showDetails ? "收起高级信息" : "高级信息"}</SoftButton>
        </ActionToolbar>

        {showDetails && (
          <div id="txzz-update-advanced" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
              <div><dt className="text-slate-400">检测阶段</dt><dd className="mt-0.5 text-slate-700">{updateCheckPhaseLabel(vm.checkPhase)}</dd></div>
              <div><dt className="text-slate-400">下载阶段</dt><dd className="mt-0.5 text-slate-700">{updateDownloadPhaseLabel(vm.downloadPhase)}</dd></div>
              <div><dt className="text-slate-400">检测来源</dt><dd className="mt-0.5 truncate text-slate-700">{vm.sourceLabel}</dd></div>
              <div><dt className="text-slate-400">下载交付方式</dt><dd className="mt-0.5 text-slate-700">{vm.downloadSaveVia.startsWith("extension-save-page") ? "扩展安全保存页 / OPFS" : "未提交"}</dd></div>
              <div><dt className="text-slate-400">浏览器下载编号</dt><dd className="mt-0.5 text-slate-700">{vm.downloadId || (vm.downloadSaveVia.startsWith("extension-save-page") ? "用户点击保存，无后台编号" : "未提交")}</dd></div>
              {vm.manifestUrl && <div className="sm:col-span-2"><dt className="text-slate-400">清单地址</dt><dd className="mt-0.5 break-all font-mono text-slate-700">{vm.manifestUrl}</dd></div>}
              {vm.downloadUrl && <div className="sm:col-span-2"><dt className="text-slate-400">候选下载地址（下载前仍会重新校验）</dt><dd className="mt-0.5 break-all font-mono text-slate-700">{vm.downloadUrl}</dd></div>}
            </dl>

            {vm.mirrorSources.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><ShieldCheck size={12} /> 清单镜像明细</p>
                <div className="space-y-1.5">
                  {vm.mirrorSources.slice(0, 8).map((source, index) => (
                    <div key={`${source.host || source.url}-${index}`} className="flex flex-wrap items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-[10px]">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${source.ok ? "bg-success-500" : "bg-danger-500"}`} />
                      <span className="min-w-0 flex-1 break-all text-slate-600">{source.host || updateUrlHost(source.url || "")}</span>
                      {source.ok
                        ? <span className="shrink-0 font-mono text-slate-400">v{source.version || "?"}/{source.build || "?"}</span>
                        : <span className="basis-full break-words pl-3.5 text-danger-600">{source.error || "探测失败"}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vm.packageProbeAttempts.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><Package size={12} /> 安装包尝试明细</p>
                <div className="space-y-1.5">
                  {vm.packageProbeAttempts.slice(0, 8).map((attempt, index) => (
                    <div key={`${attempt.displayUrl || attempt.url}-${index}`} className="rounded-lg bg-white px-2.5 py-2 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${attempt.phase === "submitted" ? "bg-success-500" : "bg-danger-500"}`} />
                        <span className="min-w-0 flex-1 truncate text-slate-600">{updateUrlHost(attempt.displayUrl || attempt.url || "")}</span>
                        <span className="shrink-0 text-slate-500">{updateAttemptPhaseLabel(attempt.phase)}</span>
                      </div>
                      {attempt.error && <p className="mt-1 break-all pl-3.5 text-danger-600">{attempt.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vm.packageProbe?.ok && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><FileCheck2 size={12} /> CRX3 验证凭据</p>
                <dl className="grid gap-2 rounded-xl bg-white p-3 text-[10px] sm:grid-cols-2">
                  <div><dt className="text-slate-400">包格式</dt><dd className="mt-0.5 text-slate-700">CRX{vm.packageProbe.crxVersion || 3} · CRX3 数据偏移 {vm.packageProbe.zipOffset ?? "未记录"}</dd></div>
                  <div><dt className="text-slate-400">完整包大小</dt><dd className="mt-0.5 text-slate-700">{formatUpdateBytes(vm.packageProbe.totalSize || vm.packageProbe.contentLength || 0)}</dd></div>
                  {vm.packageProbe.extensionId && <div className="sm:col-span-2"><dt className="text-slate-400">正式扩展 ID</dt><dd className="mt-0.5 break-all font-mono text-slate-700">{vm.packageProbe.extensionId}</dd></div>}
                  {vm.packageProbe.sha256 && <div className="sm:col-span-2"><dt className="text-slate-400">SHA-256</dt><dd className="mt-0.5 break-all font-mono text-slate-700">{vm.packageProbe.sha256}</dd></div>}
                </dl>
              </div>
            )}

            <div className="rounded-xl border border-info-100 bg-info-50 px-3 py-2.5 text-[11px] leading-relaxed text-info-700">{vm.installationHint}</div>

            <ActionToolbar>
              <SoftButton size="sm" variant="secondary" icon={Copy} onClick={() => copyText(buildUpdateCopyText(vm), "更新信息已复制")}>复制报告</SoftButton>
              <SoftButton size="sm" variant="secondary" icon={Copy} disabled={!vm.downloadUrl} onClick={() => copyText(vm.downloadUrl, "候选地址已复制")}>复制候选地址</SoftButton>
              <SoftButton size="sm" variant="secondary" icon={ExternalLink} onClick={() => window.open(vm.repositoryUrl, "_blank", "noopener,noreferrer")}>项目主页</SoftButton>
            </ActionToolbar>
          </div>
        )}

        {feedback && (
          <p
            className={`flex items-center justify-center gap-1.5 text-center text-[11px] ${feedback.level === "error" ? "text-danger-600" : "text-success-600"}`}
            role={feedback.level === "error" ? "alert" : "status"}
            aria-live={feedback.level === "error" ? "assertive" : "polite"}
          >
            {feedback.level === "error" ? <AlertTriangle size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
            {feedback.text}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
