import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from "react";
import type { LucideIcon } from "lucide-react";

type ScrollLockSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
  htmlOverscroll: string;
  bodyOverscroll: string;
  scrollbarGutter: string;
};

let documentScrollLockCount = 0;
let documentScrollLockSnapshot: ScrollLockSnapshot | null = null;
const modalStack: HTMLElement[] = [];

function acquireDocumentScrollLock() {
  if (typeof document === "undefined" || !document.documentElement || !document.body) return () => undefined;
  const html = document.documentElement;
  const body = document.body;
  if (documentScrollLockCount === 0) {
    documentScrollLockSnapshot = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      scrollbarGutter: html.style.scrollbarGutter
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    html.style.scrollbarGutter = "stable";
  }
  documentScrollLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    documentScrollLockCount = Math.max(0, documentScrollLockCount - 1);
    if (documentScrollLockCount !== 0 || !documentScrollLockSnapshot) return;
    html.style.overflow = documentScrollLockSnapshot.htmlOverflow;
    body.style.overflow = documentScrollLockSnapshot.bodyOverflow;
    html.style.overscrollBehavior = documentScrollLockSnapshot.htmlOverscroll;
    body.style.overscrollBehavior = documentScrollLockSnapshot.bodyOverscroll;
    html.style.scrollbarGutter = documentScrollLockSnapshot.scrollbarGutter;
    documentScrollLockSnapshot = null;
  };
}

/** 主面板和子弹层共用计数式滚动锁，避免先关闭一层就错误解锁宿主网页。 */
export function useDocumentScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireDocumentScrollLock();
  }, [active]);
}

function registerModal(element: HTMLElement) {
  if (!modalStack.includes(element)) modalStack.push(element);
  syncModalAccessibility(element.getRootNode());
}

function unregisterModal(element: HTMLElement) {
  const root = element.getRootNode();
  const index = modalStack.indexOf(element);
  if (index >= 0) modalStack.splice(index, 1);
  syncModalAccessibility(root);
}

function topModalFor(root: Node) {
  return modalStack
    .filter((item) => item.isConnected && item.getRootNode() === root)
    .reduce<HTMLElement | null>((top, item) => {
      if (!top) return item;
      return top.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING ? item : top;
    }, null);
}

/** 底层弹窗保留视觉上下文，但从键盘与无障碍树中暂时移除，只让顶层弹窗可交互。 */
function syncModalAccessibility(root: Node) {
  const top = topModalFor(root);
  modalStack
    .filter((item) => item.isConnected && item.getRootNode() === root)
    .forEach((item) => {
      const isTop = item === top;
      item.inert = !isTop;
      if (isTop) item.removeAttribute("aria-hidden");
      else item.setAttribute("aria-hidden", "true");
    });
}

function modalFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
  )).filter((item) => item.getClientRects().length > 0 && item.getAttribute("aria-hidden") !== "true");
}

function focusWithoutScroll(element?: HTMLElement | null) {
  if (!element?.isConnected) return false;
  try {
    element.focus({ preventScroll: true });
    return true;
  } catch {
    return false;
  }
}

/** 页面统一宽度、内边距和纵向节奏，桌面端充分利用工作台宽度。 */
export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`txzz-page mx-auto w-full max-w-[1120px] space-y-4 p-4 sm:p-5 lg:p-6 ${className}`}>
      {children}
    </div>
  );
}

/** 页面级说明区，统一承载标题、摘要和主操作。 */
export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-brand-600">{eyebrow}</p>}
        <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-900 sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-500">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 分区卡片：降低装饰噪声，用边框、留白和标题层级表达结构。 */
export function SectionCard({
  title,
  icon: Icon,
  hint,
  action,
  children,
  className = "",
  tone = "default"
}: {
  title?: string;
  icon?: LucideIcon;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "sky" | "emerald" | "amber" | "rose" | "soft";
}) {
  const toneClass =
    tone === "sky"
      ? "border-info-100"
      : tone === "emerald"
        ? "border-success-100"
        : tone === "amber"
          ? "border-warning-100"
          : tone === "rose"
            ? "border-danger-100"
            : tone === "soft"
              ? "border-slate-100 bg-slate-50/75"
              : "border-slate-200";

  const iconClass =
    tone === "sky"
      ? "bg-info-50 text-info-600"
      : tone === "emerald"
        ? "bg-success-50 text-success-600"
        : tone === "amber"
          ? "bg-warning-50 text-warning-600"
          : tone === "rose"
            ? "bg-danger-50 text-danger-600"
            : "bg-brand-50 text-brand-600";

  return (
    <section className={`txzz-section overflow-hidden rounded-2xl border bg-white shadow-[var(--txzz-shadow-sm)] ${toneClass} ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
                <Icon size={15} strokeWidth={2.15} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-[14px] font-semibold leading-5 text-slate-900">{title}</h3>}
              {hint && <p className="mt-0.5 text-[11px] leading-[1.55] text-slate-500">{hint}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** 重点信息头，仅用于总览和少数品牌场景，避免每页重复使用大面积渐变。 */
export function HeroBanner({
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
  emoji = "✦"
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  emoji?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[1.35rem] border border-white/10 p-5 text-white shadow-[var(--txzz-shadow-md)] sm:p-6"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #111827 58%, #37317f 100%)" }}
    >
      <div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-32 w-48 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-white/65">{eyebrow}</p>}
          <h2 className="text-xl font-bold leading-tight tracking-[-0.025em] sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-white/70 sm:text-[13px]">{subtitle}</p>}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-lg backdrop-blur">
          {emoji}
        </span>
      </div>
      {badges && <div className="relative mt-4 flex flex-wrap gap-1.5">{badges}</div>}
      {actions && <div className="relative mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pill({
  children,
  className = "",
  onClick
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const base = `inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} transition hover:brightness-95 active:scale-95`}>
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}

/** 统计瓷砖网格：使用中性底色和细状态条，不再让每项都成为强渐变按钮。 */
export function StatGrid({
  items
}: {
  items: Array<{ label: string; value: string | number; tone?: "purple" | "emerald" | "sky" | "amber" | "rose" | "pink"; onClick?: () => void }>;
}) {
  const toneMap = {
    purple: "before:bg-brand-500 text-brand-700",
    emerald: "before:bg-success-500 text-success-600",
    sky: "before:bg-info-500 text-info-600",
    amber: "before:bg-warning-500 text-warning-600",
    rose: "before:bg-danger-500 text-danger-600",
    pink: "before:bg-fuchsia-500 text-fuchsia-700"
  };
  return (
    <div className={`grid gap-2.5 ${items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((item) => {
        const tone = toneMap[item.tone || "purple"];
        const body = (
          <>
            <p className="truncate text-xl font-bold tabular-nums leading-none text-slate-900">{item.value}</p>
            <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">{item.label}</p>
          </>
        );
        const cls = `relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-[var(--txzz-shadow-sm)] before:absolute before:inset-y-0 before:left-0 before:w-1 ${tone}`;
        if (item.onClick) {
          return (
            <button key={item.label} type="button" onClick={item.onClick} className={`${cls} transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md active:translate-y-0`}>
              {body}
            </button>
          );
        }
        return <div key={item.label} className={cls}>{body}</div>;
      })}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "sky" | "emerald" | "amber" | "soft";

const btnVariantClass: Record<BtnVariant, string> = {
  primary: "border border-brand-600 bg-brand-600 text-white shadow-sm hover:border-brand-700 hover:bg-brand-700",
  secondary: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700",
  ghost: "border border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800",
  danger: "border border-danger-100 bg-danger-50 text-danger-600 hover:border-danger-200 hover:bg-danger-100",
  sky: "border border-info-500 bg-info-500 text-white shadow-sm hover:bg-info-600",
  emerald: "border border-success-500 bg-success-500 text-white shadow-sm hover:bg-success-600",
  amber: "border border-warning-500 bg-warning-500 text-white shadow-sm hover:bg-warning-600",
  soft: "border border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/18"
};

export function SoftButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  icon: Icon,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "xs" | "sm" | "md" | "lg";
  icon?: LucideIcon;
}) {
  const sizeClass =
    size === "xs"
      ? "min-h-8 gap-1 rounded-lg px-2.5 text-[11px]"
      : size === "sm"
        ? "min-h-9 gap-1.5 rounded-xl px-3 text-[12px]"
        : size === "lg"
          ? "min-h-11 gap-2 rounded-xl px-4 text-[14px]"
          : "min-h-10 gap-1.5 rounded-xl px-3.5 text-[13px]";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${sizeClass} ${btnVariantClass[variant]} ${className}`}
      aria-label={rest["aria-label"] || (!children && rest.title ? rest.title : undefined)}
      {...rest}
    >
      {Icon && <Icon aria-hidden="true" size={size === "xs" ? 12 : size === "sm" ? 13 : size === "lg" ? 16 : 14} strokeWidth={2.1} />}
      {children}
    </button>
  );
}

/** 分段筛选器，适合状态筛选和页面内二级导航。 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className = ""
}: {
  items: Array<{ key: T; label: string; count?: number; tone?: string }>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div role="group" className={`grid gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            className={`rounded-lg px-1.5 py-2 text-center transition-all ${active ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60 hover:text-slate-700"}`}
          >
            {typeof item.count === "number" && <p className={`text-base font-bold tabular-nums ${active ? "text-brand-700" : item.tone || "text-slate-700"}`}>{item.count}</p>}
            <p className={`text-[11px] font-medium ${typeof item.count === "number" ? "mt-0.5" : ""}`}>{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}

export function SoftInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 ${className}`}
      {...rest}
    />
  );
}

export function SoftTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={`w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 ${className}`}
      {...rest}
    />
  );
}

export function FieldLabel({ children, className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return <label className={`mb-1.5 block text-[12px] font-semibold text-slate-700 ${className}`} {...rest}>{children}</label>;
}

export function EmptyState({
  icon: Icon,
  title,
  desc,
  action
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/75 px-5 py-9 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-brand-600 shadow-sm">
        <Icon size={21} strokeWidth={1.9} />
      </div>
      <p className="text-[14px] font-semibold text-slate-800">{title}</p>
      {desc && <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-5 text-slate-500">{desc}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** 底部或居中弹层骨架，包含焦点循环、Esc 和关闭后焦点恢复。 */
export function ModalSheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  contentClassName = ""
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  contentClassName?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useDocumentScrollLock(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = dialog.getRootNode();
    const shadowActive = root instanceof ShadowRoot ? root.activeElement : null;
    const previous = shadowActive instanceof HTMLElement
      ? shadowActive
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    registerModal(dialog);
    const focusTimer = window.setTimeout(() => {
      if (topModalFor(root) === dialog) focusWithoutScroll(closeButtonRef.current);
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (topModalFor(root) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = modalFocusableElements(dialog);
      if (!focusable.length) return;
      const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!(active instanceof Node) || !dialog.contains(active)) {
        event.preventDefault();
        focusWithoutScroll(event.shiftKey ? last : first);
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        focusWithoutScroll(last);
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        focusWithoutScroll(first);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      const wasTop = topModalFor(root) === dialog;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      unregisterModal(dialog);
      if (!wasTop) return;
      window.setTimeout(() => {
        const remainingTop = topModalFor(root);
        if (remainingTop) {
          if (previous && remainingTop.contains(previous) && focusWithoutScroll(previous)) return;
          focusWithoutScroll(modalFocusableElements(remainingTop)[0] || remainingTop);
          return;
        }
        focusWithoutScroll(previous);
      }, 0);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="txzz-modal-layer txzz-candy-interactive fixed inset-0 z-[60] flex min-h-0 items-end justify-center overflow-hidden bg-slate-950/45 backdrop-blur-[5px] sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && dialogRef.current && topModalFor(dialogRef.current.getRootNode()) === dialogRef.current) {
          onCloseRef.current();
        }
      }}
    >
      <div
        ref={dialogRef}
        data-txzz-modal-sheet="true"
        tabIndex={-1}
        className={`txzz-modal-sheet flex max-h-full w-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[var(--txzz-shadow-lg)] ${size === "lg" ? "max-w-xl" : "max-w-md"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <h3 id={titleId} className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="关闭弹窗">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={`txzz-modal-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 ${contentClassName}`}>{children}</div>
        {footer && <div className="txzz-modal-footer shrink-0 border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">{footer}</div>}
      </div>
    </div>
  );
}

const QUICK_ACTION_TONE: Record<string, { icon: string; hover: string }> = {
  pink: { icon: "bg-rose-50 text-rose-600", hover: "hover:border-rose-200" },
  purple: { icon: "bg-brand-50 text-brand-600", hover: "hover:border-brand-200" },
  sky: { icon: "bg-info-50 text-info-600", hover: "hover:border-info-100" },
  amber: { icon: "bg-warning-50 text-warning-600", hover: "hover:border-warning-100" },
  emerald: { icon: "bg-success-50 text-success-600", hover: "hover:border-success-100" },
  rose: { icon: "bg-danger-50 text-danger-600", hover: "hover:border-danger-100" }
};

/** 快捷操作宫格：图标强调、容器中性，降低多彩按钮带来的竞争。 */
export function QuickActionGrid({
  items
}: {
  items: Array<{ label: string; icon: LucideIcon; tone?: keyof typeof QUICK_ACTION_TONE; color?: string; onClick: () => void }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map((item) => {
        const tone = QUICK_ACTION_TONE[item.tone || "purple"] || QUICK_ACTION_TONE.purple;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`txzz-quick-action-btn group flex min-h-[5.25rem] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-[var(--txzz-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${tone.hover}`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.icon}`}>
              <item.icon size={17} strokeWidth={2.1} />
            </span>
            <span className="text-[12px] font-semibold text-slate-700 group-hover:text-slate-900">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StatusDot({ ok, pulse }: { ok?: boolean; pulse?: boolean }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${ok ? "bg-success-500" : "bg-danger-500"} ${pulse ? "animate-pulse" : ""}`} />;
}

export function ActionToolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

export function ListRow({
  children,
  className = "",
  onClick
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 active:scale-[0.995] ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${className}`}>{children}</div>;
}
