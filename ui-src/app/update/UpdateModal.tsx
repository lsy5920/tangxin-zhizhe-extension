import { AlertTriangle, CheckCircle2, Download, ExternalLink, RefreshCw, Rocket, Sparkles, X } from "lucide-react";
import type { BridgeState } from "../types";
import {
  buildUpdateViewModel,
  changelogTypeLabel,
  updateStatusTone,
  type UpdateUiStatus
} from "./helpers";

type Props = {
  state: BridgeState;
  open: boolean;
  checking?: boolean;
  downloading?: boolean;
  onClose: () => void;
  onDismiss: (updateId: string) => void;
  onOpenSettings: () => void;
  onDownload: () => void;
  onCheck: () => void;
};

function StatusIcon({ status }: { status: UpdateUiStatus }) {
  if (status === "error") return <AlertTriangle size={22} className="text-white" />;
  if (status === "available" || status === "downloaded") return <Rocket size={22} className="text-white" />;
  if (status === "checking" || status === "downloading") return <RefreshCw size={22} className="animate-spin text-white" />;
  if (status === "latest") return <CheckCircle2 size={22} className="text-white" />;
  return <Sparkles size={22} className="text-white" />;
}

const STEPS = ["检测清单", "比对版本", "获取下载", "完成安装"];

export function UpdateModal({
  state,
  open,
  checking = false,
  downloading = false,
  onClose,
  onDismiss,
  onOpenSettings,
  onDownload,
  onCheck
}: Props) {
  if (!open) return null;
  const vm = buildUpdateViewModel(state, { checking, downloading });
  const tone = updateStatusTone(vm.status);
  const isBusy = checking || downloading || vm.status === "checking" || vm.status === "downloading";

  return (
    <div
      className="txzz-candy-interactive fixed inset-0 z-[2147483646] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[8px] sm:items-center sm:p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_28px_90px_rgba(147,51,234,0.28)] ${tone.border}`}
        role="dialog"
        aria-modal="true"
        aria-label="升级系统"
      >
        <div className={`relative overflow-hidden bg-gradient-to-br ${tone.solid} px-5 pb-7 pt-5 text-white`}>
          <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 left-8 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/30 backdrop-blur">
                <StatusIcon status={vm.status} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-white/80">糖心志者 · 升级系统 v4</p>
                <h3 className="truncate text-lg font-bold tracking-tight">{vm.statusLabel}</h3>
                <p className="mt-0.5 text-[11px] text-white/75">{vm.statusHint}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (vm.updateId && vm.status === "available") onDismiss(vm.updateId);
                else onClose();
              }}
              className="rounded-full bg-white/15 p-1.5 text-white/90 transition hover:bg-white/25"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/15 px-3 py-2 ring-1 ring-white/20 backdrop-blur">
              <p className="text-[10px] text-white/70">本地版本</p>
              <p className="truncate text-sm font-bold">{vm.localVersion}</p>
              <p className="truncate font-mono text-[10px] text-white/65">{vm.localBuild}</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-3 py-2 ring-1 ring-white/20 backdrop-blur">
              <p className="text-[10px] text-white/70">远程版本</p>
              <p className="truncate text-sm font-bold">{vm.remoteVersion}</p>
              <p className="truncate font-mono text-[10px] text-white/65">{vm.remoteBuild}</p>
            </div>
          </div>
        </div>

        <div className="-mt-3 space-y-3 px-4 pb-4">
          <div className="rounded-2xl border border-white/80 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-purple-700">升级进度</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}>{vm.statusLabel}</span>
            </div>
            <div className="mb-2 flex gap-1">
              {STEPS.map((label, index) => {
                const done = vm.progressStep > index;
                const active = vm.progressStep === index;
                return (
                  <div key={label} className="min-w-0 flex-1">
                    <div className={`h-1.5 rounded-full transition-all ${done || active ? tone.bar : "bg-purple-100"} ${active ? "animate-pulse" : ""}`} />
                    <p className={`mt-1 truncate text-center text-[9px] ${done || active ? tone.text : "text-purple-300"}`}>{label}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-purple-600">{vm.summary}</p>
            {(vm.releasedAt || vm.checkedRelative !== "未检测") && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-purple-300">
                {vm.releasedAt && <span>发布 {vm.releasedAt}</span>}
                <span>检测 {vm.checkedRelative}</span>
                <span>{vm.sourceLabel}</span>
              </div>
            )}
          </div>

          {vm.changelog.length > 0 && (
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-2xl border border-purple-50 bg-gradient-to-b from-purple-50/80 to-white p-3">
              <p className="mb-1 text-[11px] font-semibold text-purple-700">更新内容</p>
              {vm.changelog.slice(0, 5).map((item, index) => (
                <div key={item.id || `${item.title}-${index}`} className="rounded-xl bg-white/90 px-2.5 py-2 shadow-sm ring-1 ring-purple-50">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">
                      {changelogTypeLabel(item.type)}
                    </span>
                    <p className="truncate text-[11px] font-medium text-purple-800">{item.title || "更新记录"}</p>
                  </div>
                  {(item.detail || item.notes) && (
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-purple-400">{item.detail || item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {vm.downloadError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-600">
              {vm.downloadError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {vm.status === "error" || vm.status === "idle" || vm.status === "checking" ? (
              <button
                type="button"
                onClick={onCheck}
                disabled={checking}
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 py-2.5 text-sm font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-70"
              >
                <RefreshCw size={15} className={checking || vm.status === "checking" ? "animate-spin" : ""} />
                {checking || vm.status === "checking" ? "检测中…" : "重新检查更新"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="rounded-xl border border-purple-200 py-2.5 text-sm font-medium text-purple-500 transition-transform active:scale-[0.98]"
                >
                  打开设置
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={downloading}
                  className={`flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r ${tone.solid} py-2.5 text-sm font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-70`}
                >
                  {downloading || vm.status === "downloading" ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                  {downloading || vm.status === "downloading"
                    ? "下载中…"
                    : vm.status === "available"
                      ? "下载最新版"
                      : vm.status === "downloaded"
                        ? "再次下载"
                        : "下载安装包"}
                </button>
              </>
            )}
          </div>

          {vm.status === "available" && (
            <button
              type="button"
              onClick={() => {
                if (vm.updateId) onDismiss(vm.updateId);
                onClose();
              }}
              className="w-full rounded-xl py-1.5 text-[11px] text-purple-300 transition hover:text-purple-500"
            >
              稍后再说，本次不再弹出
            </button>
          )}

          {vm.canOpenUrl && (
            <button
              type="button"
              onClick={() => window.open(vm.downloadUrl, "_blank", "noopener,noreferrer")}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-amber-100 bg-amber-50/70 py-2 text-[11px] font-medium text-amber-700 transition-transform active:scale-[0.98]"
            >
              <ExternalLink size={12} /> 浏览器打开下载地址
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
