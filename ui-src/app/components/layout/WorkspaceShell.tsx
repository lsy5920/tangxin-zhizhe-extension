import type { ReactNode, RefObject } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cloud,
  Info,
  LoaderCircle,
  Sparkles,
  X
} from "lucide-react";
import type { Page } from "../../types";
import type { NoticeTone, WorkspaceViewModel } from "../../model/workspaceViewModel";
import { NAVIGATION_ITEMS, PAGE_META } from "../../model/navigation";
import { APP_VERSION_LABEL } from "../../constants";
import { BrandCompanion } from "./BrandCompanion";

type Toast = { text: string; level: string } | null;

type Props = {
  panelRef: RefObject<HTMLDivElement>;
  page: Page;
  onPage: (page: Page) => void;
  onClose: () => void;
  onAbout: () => void;
  onOpenAccounts: () => void;
  onOpenUpdate: () => void;
  onHideUpdateReminder: () => void;
  showUpdateReminder: boolean;
  viewModel: WorkspaceViewModel;
  toast: Toast;
  onDismissToast: () => void;
  children: ReactNode;
};

const toneClasses: Record<NoticeTone, string> = {
  success: "border-success-100 bg-success-50 text-success-600",
  warning: "border-warning-100 bg-warning-50 text-warning-600",
  danger: "border-danger-100 bg-danger-50 text-danger-600",
  info: "border-info-100 bg-info-50 text-info-600"
};

const dotClasses: Record<NoticeTone, string> = {
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
  info: "bg-info-500"
};

function toastTone(level?: string): NoticeTone {
  if (level === "ok") return "success";
  if (level === "error") return "danger";
  if (level === "running") return "warning";
  return "info";
}

export function WorkspaceShell({
  panelRef,
  page,
  onPage,
  onClose,
  onAbout,
  onOpenAccounts,
  onOpenUpdate,
  onHideUpdateReminder,
  showUpdateReminder,
  viewModel,
  toast,
  onDismissToast,
  children
}: Props) {
  const meta = PAGE_META[page];
  const toastPalette = toneClasses[toastTone(toast?.level)];
  const ToastIcon = toast?.level === "error" ? AlertTriangle : toast?.level === "ok" ? CheckCircle2 : LoaderCircle;

  return (
    <div className="txzz-app-panel-overlay txzz-candy-interactive fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5">
      <div className="txzz-app-panel-backdrop absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txzz-panel-title"
        tabIndex={-1}
        className="txzz-app-panel-frame relative flex h-full w-full flex-col overflow-hidden border bg-white shadow-[var(--txzz-shadow-lg)] outline-none sm:h-[min(94vh,920px)] sm:w-[min(1180px,calc(100vw-2.5rem))] sm:rounded-[2rem] md:flex-row"
      >
        <aside aria-label="主要导航" className="txzz-app-sidebar hidden w-[14.5rem] shrink-0 flex-col px-4 py-4 md:flex">
          <div className="txzz-sidebar-brand flex items-center gap-3 rounded-[1.4rem] px-3 py-3">
            <BrandCompanion compact />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold tracking-tight text-slate-900">糖心志者</p>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500">甜甜地照顾每次播放</p>
            </div>
          </div>

          <nav className="mt-4 space-y-1.5" aria-label="桌面端页面导航">
            {NAVIGATION_ITEMS.map((item) => {
              const active = page === item.id;
              const hasBadge = item.id === "downloads" && viewModel.activeDownloads > 0;
              const hasUpdateDot = item.id === "settings" && viewModel.update.available;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPage(item.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={`前往${item.label}`}
                  className={`txzz-sidebar-nav-item relative flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[13px] font-semibold transition ${active ? "is-active text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-[0.9rem] transition ${active ? "bg-brand-500 text-white shadow-[0_6px_16px_rgba(239,92,130,0.25)]" : "bg-white/75 text-slate-400"}`}>
                    <item.icon size={17} strokeWidth={active ? 2.35 : 2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium opacity-65">{item.subtitle}</span>
                  </span>
                  {hasBadge && <span className="rounded-full bg-info-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{viewModel.activeDownloads}</span>}
                  {hasUpdateDot && <span className="h-2.5 w-2.5 rounded-full bg-warning-500 ring-4 ring-warning-100 animate-pulse" />}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2.5 pt-4">
            <button
              type="button"
              onClick={onOpenAccounts}
              className={`txzz-sidebar-status flex w-full items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition hover:-translate-y-0.5 ${toneClasses[viewModel.remote.tone]}`}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/75">
                <Cloud size={16} />
                <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${dotClasses[viewModel.remote.tone]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold">{viewModel.remote.label}</span>
                <span className="mt-0.5 block truncate text-[10px] opacity-70">{viewModel.remote.detail}</span>
              </span>
            </button>
            <button type="button" onClick={onClose} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-semibold text-slate-400 transition hover:bg-white/65 hover:text-slate-700" title="关闭面板（Esc）" aria-label="关闭面板">
              <X size={14} /> 收起工作台
            </button>
            <p className="text-center text-[9px] font-medium tracking-[0.08em] text-slate-400">{APP_VERSION_LABEL} · CANDY DESK</p>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--txzz-canvas)]">
          <header className="txzz-app-header flex min-h-[4.75rem] shrink-0 items-center justify-between border-b px-4 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="md:hidden"><BrandCompanion compact /></span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.16em] text-brand-500">{meta.eyebrow}</p>
                <h1 id="txzz-panel-title" className="truncate text-[16px] font-bold tracking-tight text-slate-900">{meta.label}</h1>
                <p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">{meta.companionHint}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenAccounts}
                className={`hidden min-h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition md:flex ${toneClasses[viewModel.remote.tone]}`}
                title={viewModel.remote.detail}
              >
                <span className={`h-2 w-2 rounded-full ${dotClasses[viewModel.remote.tone]}`} />
                {viewModel.remote.connected ? "云端好心情" : viewModel.remote.label}
              </button>
              <button
                type="button"
                onClick={onOpenUpdate}
                className={`hidden min-h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition md:flex ${viewModel.update.available || viewModel.update.status === "submitted" ? toneClasses.warning : viewModel.update.status === "error" || viewModel.update.status === "download-error" ? toneClasses.danger : "border-slate-200 bg-white/75 text-slate-600"}`}
              >
                {viewModel.update.available ? <Bell size={12} /> : <Sparkles size={12} />}
                {viewModel.update.badgeLabel}
              </button>
              <button type="button" onClick={onAbout} className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-brand-50 hover:text-brand-600" title="打开项目主页" aria-label="打开项目主页">
                <Info size={16} />
              </button>
              <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 md:hidden" aria-label="关闭面板">
                <X size={17} />
              </button>
            </div>
          </header>

          {showUpdateReminder && (
            <div className="txzz-update-reminder flex min-h-12 shrink-0 items-center gap-2 border-b border-warning-100 bg-warning-50 px-3 py-1 text-[11px] font-semibold text-warning-600 md:hidden">
              <Bell size={13} className="shrink-0" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpenUpdate}>
                新版本 {viewModel.update.remoteVersion} 来啦，点这里看看
              </button>
              <button type="button" onClick={onHideUpdateReminder} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-warning-100" aria-label="暂时关闭此版本更新提示"><X size={13} /></button>
            </div>
          )}

          <main className="txzz-app-main flex-1 overflow-y-auto overscroll-contain scroll-smooth">
            {children}
          </main>

          <nav aria-label="移动端主要导航" className="txzz-app-mobile-nav flex min-h-[4.65rem] shrink-0 items-center border-t pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md md:hidden">
            {NAVIGATION_ITEMS.map((item) => {
              const active = page === item.id;
              const hasBadge = item.id === "downloads" && viewModel.activeDownloads > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPage(item.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={`前往${item.label}`}
                  className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition ${active ? "text-brand-600" : "text-slate-400"}`}
                >
                  <span className={`flex h-9 w-11 items-center justify-center rounded-[1rem] transition ${active ? "bg-brand-100 text-brand-600 shadow-sm" : "text-slate-400"}`}>
                    <item.icon size={18} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span>{item.shortLabel}</span>
                  {hasBadge && <span className="absolute right-[calc(50%-1.35rem)] top-0.5 h-3 w-3 rounded-full border-2 border-white bg-info-500" />}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {toast && (
        <div
          className={`txzz-app-toast fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[min(calc(100vw-1.5rem),28rem)] items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-xl backdrop-blur sm:bottom-8 ${toastPalette}`}
          role={toast.level === "error" ? "alert" : "status"}
          aria-live={toast.level === "error" ? "assertive" : "polite"}
        >
          <ToastIcon size={15} className={`mt-0.5 shrink-0 ${toast.level === "running" ? "animate-spin" : ""}`} aria-hidden="true" />
          <span className="txzz-app-toast-text min-w-0 flex-1 text-[12px] font-semibold leading-5">{toast.text}</span>
          <button type="button" onClick={onDismissToast} className="txzz-app-toast-close flex h-8 w-8 shrink-0 items-center justify-center rounded-xl opacity-60 transition hover:bg-black/5 hover:opacity-100" aria-label="关闭操作提示">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
