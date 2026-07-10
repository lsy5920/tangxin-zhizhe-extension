import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { updateStatusTone, type UpdateViewModel } from "./helpers";

const UPDATE_STEPS = ["验证签名清单", "比对版本", "验证完整包", "提交下载"];
const COMPACT_STEP_LABELS = ["清单", "比对", "验证", "提交"];

type Props = {
  vm: UpdateViewModel;
  compact?: boolean;
  showMeta?: boolean;
};

/** 升级中心和弹层共用同一套阶段视图，避免两处对同一后台状态给出不同反馈。 */
export function UpdateProgress({ vm, compact = false, showMeta = true }: Props) {
  const tone = updateStatusTone(vm.status);
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white ${compact ? "p-3" : "p-3.5"}`} role="status" aria-live="polite">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="升级进度">
        {UPDATE_STEPS.map((label, index) => {
          const displayLabel = compact ? COMPACT_STEP_LABELS[index] : label;
          const active = vm.progressStep >= 0 && vm.progressStep === index;
          const completed = index < vm.progressStep || (vm.status === "submitted" && index === vm.progressStep);
          const failed = active && vm.progressError;
          return (
            <li key={label} className="min-w-0 text-center" aria-label={label} aria-current={active ? "step" : undefined}>
              <span
                className={`mx-auto flex items-center justify-center rounded-full font-bold text-white transition-colors ${compact ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]"} ${completed || active ? tone.bar : "bg-slate-300"}`}
              >
                {failed
                  ? <AlertTriangle size={compact ? 11 : 12} aria-hidden="true" />
                  : active && vm.busy
                    ? <LoaderCircle size={compact ? 11 : 12} className="animate-spin" aria-hidden="true" />
                    : completed
                      ? <Check size={compact ? 11 : 12} strokeWidth={3} aria-hidden="true" />
                      : index + 1}
              </span>
              <span className={`mt-1.5 block text-[10px] font-medium leading-tight ${completed || active ? tone.text : "text-slate-400"}`}>{displayLabel}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 whitespace-pre-line break-words border-t border-slate-100 pt-3 text-[12px] leading-[1.6] text-slate-600">{vm.summary}</p>
      {showMeta && (vm.releasedAt || vm.checkedRelative !== "未检测") && (
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          {vm.releasedAt ? `发布 ${vm.releasedAt} · ` : ""}检测 {vm.checkedRelative} · {vm.checkMode}
        </p>
      )}
    </div>
  );
}

export { UPDATE_STEPS };
