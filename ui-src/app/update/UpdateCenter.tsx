import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Package,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { BridgeState } from "../types";
import {
  buildUpdateCopyText,
  buildUpdateViewModel,
  changelogTypeLabel,
  updateStatusTone
} from "./helpers";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
};

export function UpdateCenter({ state, onAction }: Props) {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const vm = buildUpdateViewModel(state, { checking, downloading });
  const tone = updateStatusTone(vm.status);

  const flash = (text: string) => {
    setFeedback(text);
    window.setTimeout(() => setFeedback(""), 1800);
  };

  const checkUpdate = () => {
    setChecking(true);
    onAction("check-update");
    window.setTimeout(() => setChecking(false), 1800);
  };

  const downloadLatest = () => {
    setDownloading(true);
    onAction("download-latest");
    window.setTimeout(() => setDownloading(false), 2200);
  };

  const copyInfo = async () => {
    try {
      await navigator.clipboard.writeText(buildUpdateCopyText(vm));
      flash("更新信息已复制");
    } catch {
      flash("复制失败，请稍后重试");
    }
  };

  const copyUrl = async () => {
    if (!vm.downloadUrl) return;
    try {
      await navigator.clipboard.writeText(vm.downloadUrl);
      flash("下载地址已复制");
    } catch {
      flash("复制失败，请稍后重试");
    }
  };

  return (
    <div className={`space-y-3 overflow-hidden rounded-2xl border bg-white/95 p-0 shadow-[0_8px_28px_rgba(147,51,234,0.06)] ${tone.border}`}>
      <div className="flex items-start justify-between gap-3 border-b border-purple-50 px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-purple-800">
            <Rocket size={14} className="text-sky-400" /> 升级中心
          </h3>
          <p className="mt-0.5 text-[10px] leading-relaxed text-purple-400">
            实时清单 · 版本/构建比对 · 多候选下载 · 更新日志
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.badge}`}>
          {vm.statusLabel}
        </span>
      </div>
      <div className="space-y-3 px-3.5 pb-3.5">

      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${tone.soft} p-3 ring-1 ${tone.ring}`}>
        <div className="absolute -right-2 -top-3 select-none text-5xl opacity-10 pointer-events-none">🚀</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/85 px-2.5 py-2 shadow-sm">
            <p className="text-[10px] text-purple-300">本地版本</p>
            <p className="truncate text-sm font-bold text-purple-800">{vm.localVersion}</p>
            <p className="truncate font-mono text-[10px] text-purple-300">{vm.localBuild}</p>
          </div>
          <div className="rounded-xl bg-white/85 px-2.5 py-2 shadow-sm">
            <p className="text-[10px] text-purple-300">远程版本</p>
            <p className="truncate text-sm font-bold text-purple-800">{vm.remoteVersion}</p>
            <p className="truncate font-mono text-[10px] text-purple-300">{vm.remoteBuild}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1">
          {["检测", "比对", "下载", "安装"].map((label, index) => {
            const active = vm.progressStep >= index;
            return (
              <div key={label} className="min-w-0 text-center">
                <div className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${active ? tone.bar : "bg-purple-200"}`}>
                  {index + 1}
                </div>
                <p className={`truncate text-[9px] ${active ? tone.text : "text-purple-300"}`}>{label}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-purple-600">{vm.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] text-purple-400">
        <div className="rounded-xl bg-purple-50 px-2.5 py-2">
          <p className="flex items-center gap-1 font-medium text-purple-600"><ShieldCheck size={11} /> 检测来源</p>
          <p className="mt-0.5 truncate">{vm.sourceLabel}</p>
        </div>
        <div className="rounded-xl bg-purple-50 px-2.5 py-2">
          <p className="flex items-center gap-1 font-medium text-purple-600"><Package size={11} /> 检测时间</p>
          <p className="mt-0.5 truncate">{checking ? "实时检测中…" : vm.checkedRelative}</p>
        </div>
        {vm.releasedAt && (
          <div className="rounded-xl bg-purple-50 px-2.5 py-2">
            <p className="font-medium text-purple-600">发布时间</p>
            <p className="mt-0.5 truncate">{vm.releasedAt}</p>
          </div>
        )}
        <div className="rounded-xl bg-purple-50 px-2.5 py-2">
          <p className="font-medium text-purple-600">检测模式</p>
          <p className="mt-0.5 truncate">{vm.checkMode}</p>
        </div>
        {vm.manifestUrl && (
          <div className="col-span-2 rounded-xl bg-purple-50 px-2.5 py-2">
            <p className="font-medium text-purple-600">清单地址</p>
            <p className="mt-0.5 truncate">{vm.manifestUrl}</p>
          </div>
        )}
        {vm.downloadUrl && (
          <div className="col-span-2 rounded-xl bg-purple-50 px-2.5 py-2">
            <p className="font-medium text-purple-600">下载地址</p>
            <p className="mt-0.5 truncate">{vm.downloadUrl}</p>
          </div>
        )}
      </div>

      {vm.changelog.length > 0 && (
        <div className="space-y-1.5 rounded-2xl border border-purple-50 bg-gradient-to-b from-white to-purple-50/40 p-3">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-purple-700">
            <Sparkles size={12} className="text-pink-400" /> 最近更新日志
          </p>
          {vm.changelog.slice(0, 4).map((item, index) => (
            <div key={item.id || index} className="rounded-xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-purple-50">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="rounded-md bg-gradient-to-r from-pink-100 to-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">
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

      {(vm.downloadStatus || vm.downloadError || vm.candidates.length > 1) && (
        <div className="rounded-xl bg-white px-3 py-2 text-[10px] leading-relaxed text-purple-400 ring-1 ring-purple-50">
          {vm.downloadStatus && <p>下载状态：{vm.downloadStatus}</p>}
          {vm.downloadError && <p className="text-rose-500">错误：{vm.downloadError}</p>}
          {vm.candidates.length > 1 && <p className="truncate">候选地址：{vm.candidates.length} 条</p>}
          {vm.attemptUrls.length > 0 && <p className="truncate">上次尝试：{vm.attemptUrls.length} 条</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={checkUpdate}
          disabled={checking}
          className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-70"
        >
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
          {checking ? "检查中…" : "检查更新"}
        </button>
        <button
          type="button"
          onClick={downloadLatest}
          disabled={downloading}
          className={`flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r ${tone.solid} py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-70`}
        >
          {downloading ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
          {downloading ? "下载中…" : vm.status === "available" ? "下载最新版" : "下载安装包"}
        </button>
        <button
          type="button"
          onClick={copyInfo}
          className="flex items-center justify-center gap-1 rounded-xl border border-sky-200 py-2 text-xs font-medium text-sky-500 transition-transform active:scale-95"
        >
          <Copy size={13} /> 复制报告
        </button>
        <button
          type="button"
          onClick={copyUrl}
          disabled={!vm.downloadUrl}
          className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 py-2 text-xs font-medium text-emerald-500 transition-transform active:scale-95 disabled:opacity-45"
        >
          <Copy size={13} /> 复制地址
        </button>
        <button
          type="button"
          onClick={() => vm.downloadUrl && window.open(vm.downloadUrl, "_blank", "noopener,noreferrer")}
          disabled={!vm.downloadUrl}
          className="flex items-center justify-center gap-1 rounded-xl border border-amber-200 py-2 text-xs font-medium text-amber-500 transition-transform active:scale-95 disabled:opacity-45"
        >
          <ExternalLink size={13} /> 打开地址
        </button>
        <button
          type="button"
          onClick={() => window.open(vm.repositoryUrl, "_blank", "noopener,noreferrer")}
          className="flex items-center justify-center gap-1 rounded-xl border border-purple-200 py-2 text-xs font-medium text-purple-500 transition-transform active:scale-95"
        >
          <ExternalLink size={13} /> 项目主页
        </button>
      </div>

      {feedback && (
        <p className="flex items-center justify-center gap-1 text-center text-[10px] text-emerald-600">
          <CheckCircle2 size={12} /> {feedback}
        </p>
      )}
      </div>
    </div>
  );
}
