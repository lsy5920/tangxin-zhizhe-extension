import { AlertTriangle, CheckCircle2, Download, FileCheck2, Network, RefreshCw, Rocket, Sparkles } from "lucide-react";
import type { BridgeState } from "../types";
import { ModalSheet, Pill, SoftButton } from "../components/ui/primitives";
import { buildUpdateViewModel, changelogTypeLabel, updateDownloadActionLabel, updateStatusTone, type UpdateUiStatus } from "./helpers";
import { UpdateProgress } from "./UpdateProgress";

type Props = {
  state: BridgeState;
  open: boolean;
  onClose: () => void;
  onDismiss: (updateId: string) => void;
  onOpenSettings: () => void;
  onDownload: () => void;
  onCheck: () => void;
};

function StatusIcon({ status }: { status: UpdateUiStatus }) {
  if (status === "error" || status === "download-error") return <AlertTriangle size={20} />;
  if (status === "available" || status === "submitted") return <Rocket size={20} />;
  if (status === "checking" || status === "validating") return <RefreshCw size={20} className="animate-spin" />;
  if (status === "latest") return <CheckCircle2 size={20} />;
  return <Sparkles size={20} />;
}

export function UpdateModal({ state, open, onClose, onDismiss, onOpenSettings, onDownload, onCheck }: Props) {
  const vm = buildUpdateViewModel(state);
  const tone = updateStatusTone(vm.status);
  const needsCheck = vm.status === "error" || vm.status === "idle" || vm.status === "checking";
  const downloadLabel = updateDownloadActionLabel(vm.status);
  const mobileDownloadLabel = updateDownloadActionLabel(vm.status, true);
  const checkLabel = vm.status === "checking" ? "检测中…" : vm.status === "idle" ? "检查更新" : "重新检查";

  const footer = vm.status === "checking" ? (
    <SoftButton className="min-h-11 w-full" icon={RefreshCw} disabled onClick={onCheck}>{checkLabel}</SoftButton>
  ) : needsCheck ? (
    <div className="grid grid-cols-2 gap-2">
      <SoftButton variant="secondary" className="min-h-11 w-full" onClick={onOpenSettings}>打开升级中心</SoftButton>
      <SoftButton className="min-h-11 w-full" icon={RefreshCw} disabled={vm.busy} onClick={onCheck}>{checkLabel}</SoftButton>
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      <SoftButton variant="secondary" className="min-h-11 w-full" onClick={onOpenSettings}>打开升级中心</SoftButton>
      <SoftButton className="min-h-11 w-full" icon={vm.busy ? RefreshCw : Download} disabled={!vm.canDownload} onClick={onDownload}>
        <span className="sm:hidden">{mobileDownloadLabel}</span>
        <span className="hidden sm:inline">{downloadLabel}</span>
      </SoftButton>
    </div>
  );

  return (
    <ModalSheet open={open} onClose={onClose} title="检测更新" footer={footer} size="lg" contentClassName="sm:p-6">
      <div className="space-y-4" aria-busy={vm.busy}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}><StatusIcon status={vm.status} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[16px] font-semibold text-slate-900">{vm.statusLabel}</h4>
              <Pill className={tone.badge}>升级系统 v7</Pill>
            </div>
            <p className="mt-1 text-[12px] leading-[1.55] text-slate-500">{vm.statusHint}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-400">本地版本</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-slate-900">{vm.localVersion}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{vm.localBuild}</p>
          </div>
          <div className={`rounded-xl border p-3 ${vm.status === "available" ? "border-warning-100 bg-warning-50" : "border-slate-200 bg-slate-50"}`}>
            <p className="text-[11px] text-slate-400">远程版本</p>
            <p className={`mt-0.5 truncate text-[14px] font-semibold ${vm.status === "available" ? "text-warning-600" : "text-slate-900"}`}>{vm.remoteVersion}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{vm.remoteBuild}</p>
          </div>
        </div>

        <UpdateProgress vm={vm} compact />

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px]">
            <span className="min-w-0 break-words font-semibold text-slate-700">{vm.sourceLabel}</span>
            <span className="text-slate-500">{vm.cacheLabel}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><Network size={12} /> 镜像</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{vm.mirrorHealthLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><FileCheck2 size={12} /> 完整包验证</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{vm.packageProbeLabel}</p>
          </div>
        </div>

        {vm.changelog.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[12px] font-semibold text-slate-800">更新内容</p>
            {vm.changelog.slice(0, 4).map((item, index) => (
              <div key={item.id || `${item.title}-${index}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2"><span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{changelogTypeLabel(item.type)}</span><p className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">{item.title || "更新记录"}</p></div>
                {(item.detail || item.notes) && <p className="mt-1 line-clamp-2 text-[11px] leading-[1.55] text-slate-500">{item.detail || item.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {vm.status === "submitted" && (
          <div className="rounded-xl border border-warning-100 bg-warning-50 px-3 py-2.5 text-[11px] leading-relaxed text-warning-700">
            <p className="font-semibold">
              {vm.downloadSaveVia === "content-blob" ? "已通过当前页面提交下载" : "下载任务已提交"}
              {vm.downloadId ? ` · 下载编号 ${vm.downloadId}` : ""}
            </p>
            <p className="mt-1">浏览器下载完成后，请打开扩展管理页手动安装或覆盖更新；提交下载不等于完成安装。</p>
          </div>
        )}

        {vm.downloadError && <div role="alert" className="break-words rounded-xl border border-danger-100 bg-danger-50 px-3 py-2.5 text-[11px] leading-relaxed text-danger-600">{vm.downloadError}</div>}

        {vm.status === "available" && vm.updateId && (
          <button type="button" onClick={() => onDismiss(vm.updateId)} className="min-h-11 w-full rounded-xl px-3 py-2 text-[11px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
            忽略此版本的自动弹窗
          </button>
        )}
      </div>
    </ModalSheet>
  );
}
