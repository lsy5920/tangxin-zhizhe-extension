import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  RefObject,
  TextareaHTMLAttributes
} from "react";
import type { LucideIcon } from "lucide-react";
import { BrandCompanion } from "../layout/BrandCompanion";

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
const modalRegisteredRoots = new WeakMap<HTMLElement, Node>();

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
  const root = element.getRootNode();
  modalRegisteredRoots.set(element, root);
  if (!modalStack.includes(element)) modalStack.push(element);
  syncModalAccessibility(root);
}

function unregisterModal(element: HTMLElement, registeredRoot: Node = element.getRootNode()) {
  // React 清理 layout effect 时，Portal 节点可能已经从 ShadowRoot 断开。
  // 注册顺序比 isConnected/getRootNode() 更稳定，可确保关闭后恢复原触发按钮的焦点。
  const topBeforeRemoval = [...modalStack]
    .reverse()
    .find((item) => modalRegisteredRoots.get(item) === registeredRoot) || null;
  const wasTop = topBeforeRemoval === element;
  const index = modalStack.indexOf(element);
  if (index >= 0) modalStack.splice(index, 1);
  modalRegisteredRoots.delete(element);
  // React 卸载时节点可能已经脱离 ShadowRoot；必须使用注册阶段保存的根节点恢复底层工作台。
  syncModalAccessibility(registeredRoot);
  return wasTop;
}

function topModalFor(root: Node) {
  return modalStack
    .filter((item) => item.isConnected && modalRegisteredRoots.get(item) === root)
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
  const workspace = root instanceof Document || root instanceof ShadowRoot
    ? root.querySelector<HTMLElement>('[data-txzz-workspace-panel="true"]')
    : null;
  if (workspace) {
    workspace.inert = Boolean(top);
    if (top) workspace.setAttribute("aria-hidden", "true");
    else workspace.removeAttribute("aria-hidden");
  }
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

/** 让定制外观弹层复用统一弹层栈、焦点循环、Esc 和关闭后焦点恢复。 */
export function useModalFocusTrap<TDialog extends HTMLElement, TInitial extends HTMLElement>(
  active: boolean,
  onClose: () => void,
  dialogRef: RefObject<TDialog | null>,
  initialFocusRef: RefObject<TInitial | null>
) {
  const onCloseRef = useRef(onClose);
  useDocumentScrollLock(active);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!active) return;
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
      if (topModalFor(root) === dialog) focusWithoutScroll(initialFocusRef.current || dialog);
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
      const focused = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!(focused instanceof Node) || !dialog.contains(focused)) {
        event.preventDefault();
        focusWithoutScroll(event.shiftKey ? last : first);
      } else if (event.shiftKey && focused === first) {
        event.preventDefault();
        focusWithoutScroll(last);
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        focusWithoutScroll(first);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      const wasTop = unregisterModal(dialog, root);
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
  }, [active]);
}

/**
 * 将业务弹层放到工作台的 ShadowRoot 直属层。工作台进入 inert 时，
 * 弹层若仍是其后代，浏览器会把弹层一起禁用，造成“看得见但点不到”。
 */
export function portalIntoPluginUi(node: ReactNode) {
  const portalRoot = typeof document === "undefined"
    ? null
    : document.getElementById("txzz-candy-ui-root")?.shadowRoot;
  return portalRoot ? createPortal(node, portalRoot) : node;
}

/** 页面统一宽度、内边距和纵向节奏，桌面端充分利用工作台宽度。 */
export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`txzz-page mx-auto w-full max-w-[1120px] space-y-4 p-4 pb-6 sm:p-5 sm:pb-7 lg:p-6 lg:pb-8 ${className}`}>
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
    <div className={`txzz-page-intro flex flex-col gap-3 rounded-[1.55rem] border border-white/70 bg-white/62 p-4 shadow-[0_10px_30px_rgba(154,91,117,0.06)] backdrop-blur-sm sm:flex-row sm:items-end sm:justify-between sm:p-5 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-1 hidden h-11 w-2 shrink-0 rounded-full bg-gradient-to-b from-brand-400 via-brand-500 to-[#9a83e5] shadow-[0_5px_12px_rgba(230,92,128,0.2)] sm:block" />
        <div className="min-w-0">
        {eyebrow && <p className="mb-1 inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-brand-600">{eyebrow}</p>}
        <h2 className="text-xl font-extrabold tracking-[-0.025em] text-slate-900 sm:text-2xl">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] font-medium leading-5 text-slate-500">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 分区卡片使用柔和色签区分业务语义，状态仍主要依赖文字与图标而不是只靠颜色。 */
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
      ? "border-info-100 bg-[#fcfdff]"
      : tone === "emerald"
        ? "border-success-100 bg-[#fcfffd]"
        : tone === "amber"
          ? "border-warning-100 bg-[#fffefa]"
          : tone === "rose"
            ? "border-danger-100 bg-[#fffdfd]"
            : tone === "soft"
              ? "border-slate-100 bg-slate-50/80"
              : "border-slate-200 bg-white";

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
    <section className={`txzz-section relative overflow-hidden rounded-[1.55rem] border shadow-[var(--txzz-shadow-sm)] ${toneClass} ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100/80 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 rotate-[-3deg] items-center justify-center rounded-[0.95rem] border border-white shadow-sm ${iconClass}`}>
                <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-[14px] font-bold leading-5 text-slate-900">{title}</h3>}
              {hint && <p className="mt-0.5 text-[11px] font-medium leading-[1.55] text-slate-500">{hint}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** 品牌信息头保持浅色可读，伙伴形象只做视觉锚点，不承载关键状态。 */
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
    <div className="txzz-hero-banner relative overflow-hidden rounded-[1.8rem] border border-brand-100 p-5 text-slate-900 shadow-[var(--txzz-shadow-md)] sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-brand-200/55 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-56 rounded-full bg-[#ddd5ff]/55 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(225,112,146,.25) 1px, transparent 0)", backgroundSize: "18px 18px" }} />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[10px] font-bold tracking-[0.15em] text-brand-600">{eyebrow}</p>}
          <h2 className="text-xl font-extrabold leading-tight tracking-[-0.03em] sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[12px] font-medium leading-5 text-slate-600 sm:text-[13px]">{subtitle}</p>}
        </div>
        <div className="relative shrink-0">
          <BrandCompanion />
          <span className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-warning-50 text-sm shadow-sm">{emoji}</span>
        </div>
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
  const base = `inline-flex min-h-6 items-center gap-1 rounded-full border border-white/65 px-2.5 py-0.5 text-[11px] font-semibold leading-none shadow-[0_2px_6px_rgba(97,55,75,0.035)] ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} transition hover:brightness-95 active:scale-95`}>
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}

/** 统计瓷砖使用低饱和糖果色底，并保留文字标签，避免颜色成为唯一信息载体。 */
export function StatGrid({
  items
}: {
  items: Array<{ label: string; value: string | number; tone?: "purple" | "emerald" | "sky" | "amber" | "rose" | "pink"; onClick?: () => void }>;
}) {
  const toneMap = {
    purple: { card: "border-[#ddd5ff] bg-[#f4f1ff]", accent: "#9a88e3" },
    emerald: { card: "border-success-100 bg-success-50", accent: "#24a77f" },
    sky: { card: "border-info-100 bg-info-50", accent: "#4b91d1" },
    amber: { card: "border-warning-100 bg-warning-50", accent: "#d9963c" },
    rose: { card: "border-danger-100 bg-danger-50", accent: "#dc5d76" },
    pink: { card: "border-brand-100 bg-brand-50", accent: "#e04c71" }
  };
  return (
    <div className={`grid gap-2.5 ${items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((item) => {
        const tone = toneMap[item.tone || "purple"];
        const body = (
          <>
            <span
              aria-hidden="true"
              className="txzz-stat-ornament"
              style={{ "--txzz-stat-accent": tone.accent } as CSSProperties}
            />
            <p className="truncate text-xl font-extrabold tabular-nums leading-none text-slate-900">{item.value}</p>
            <p className="mt-1.5 truncate text-[11px] font-semibold text-slate-500">{item.label}</p>
          </>
        );
        const cls = `relative overflow-hidden rounded-[1.35rem] border px-3.5 py-3.5 text-left shadow-[var(--txzz-shadow-sm)] ${tone.card}`;
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
  primary: "border border-brand-500 bg-brand-500 text-white shadow-[0_6px_15px_rgba(224,76,113,0.2)] hover:border-brand-600 hover:bg-brand-600",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700",
  ghost: "border border-transparent bg-slate-100/80 text-slate-600 hover:bg-brand-50 hover:text-brand-700",
  danger: "border border-danger-100 bg-danger-50 text-danger-600 hover:border-danger-200 hover:bg-danger-100",
  sky: "border border-info-500 bg-info-500 text-white shadow-sm hover:bg-info-600",
  emerald: "border border-success-500 bg-success-500 text-white shadow-sm hover:bg-success-600",
  amber: "border border-warning-500 bg-warning-500 text-white shadow-sm hover:bg-warning-600",
  soft: "border border-white/80 bg-white/65 text-brand-700 shadow-sm backdrop-blur hover:bg-white"
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
      ? "min-h-8 gap-1 rounded-xl px-2.5 text-[11px]"
      : size === "sm"
        ? "min-h-9 gap-1.5 rounded-[0.9rem] px-3 text-[12px]"
        : size === "lg"
          ? "min-h-11 gap-2 rounded-2xl px-4 text-[14px]"
          : "min-h-10 gap-1.5 rounded-[0.95rem] px-3.5 text-[13px]";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-45 ${sizeClass} ${btnVariantClass[variant]} ${className}`}
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
    <div role="group" className={`grid gap-1 rounded-[1.15rem] border border-slate-200 bg-slate-100/85 p-1.5 shadow-inner ${className}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            className={`rounded-[0.85rem] px-1.5 py-2 text-center transition-all ${active ? "bg-white text-brand-700 shadow-[0_5px_13px_rgba(130,72,96,0.08)] ring-1 ring-brand-100" : "text-slate-500 hover:bg-white/65 hover:text-slate-700"}`}
          >
            {typeof item.count === "number" && <p className={`text-base font-bold tabular-nums ${active ? "text-brand-700" : item.tone || "text-slate-700"}`}>{item.count}</p>}
            <p className={`text-[11px] font-semibold ${typeof item.count === "number" ? "mt-0.5" : ""}`}>{item.label}</p>
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
      className={`w-full rounded-[1rem] border border-slate-300 bg-white/92 px-3.5 py-2.5 text-[13px] font-medium text-slate-900 shadow-[0_3px_10px_rgba(100,57,78,0.035)] outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-brand-200 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 ${className}`}
      {...rest}
    />
  );
}

export function SoftTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={`w-full resize-y rounded-[1rem] border border-slate-300 bg-white/92 px-3.5 py-2.5 text-[13px] font-medium text-slate-900 shadow-[0_3px_10px_rgba(100,57,78,0.035)] outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-brand-200 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 ${className}`}
      {...rest}
    />
  );
}

export function FieldLabel({ children, className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return <label className={`mb-1.5 block text-[12px] font-bold text-slate-700 ${className}`} {...rest}>{children}</label>;
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
    <div className="relative overflow-hidden rounded-[1.45rem] border border-dashed border-brand-200 bg-gradient-to-br from-white/80 to-brand-50/70 px-5 py-8 text-center">
      <span className="pointer-events-none absolute -right-4 -top-5 opacity-25"><BrandCompanion compact /></span>
      <div className="mx-auto mb-3 flex h-12 w-12 rotate-[-3deg] items-center justify-center rounded-[1.1rem] border border-white bg-white text-brand-600 shadow-[0_6px_16px_rgba(132,72,98,0.1)]">
        <Icon size={21} strokeWidth={2} />
      </div>
      <p className="text-[14px] font-bold text-slate-800">{title}</p>
      {desc && <p className="mx-auto mt-1.5 max-w-sm text-[12px] font-medium leading-5 text-slate-500">{desc}</p>}
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
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      const wasTop = unregisterModal(dialog, root);
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
  const layer = (
    <div
      className="txzz-modal-layer txzz-candy-interactive fixed inset-0 z-[60] flex min-h-0 items-end justify-center overflow-hidden bg-slate-950/50 backdrop-blur-[7px] sm:items-center"
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
        className={`txzz-modal-sheet flex max-h-full w-full min-h-0 flex-col overflow-hidden rounded-[1.75rem] border-2 border-white bg-white shadow-[var(--txzz-shadow-lg)] ring-1 ring-brand-100 ${size === "lg" ? "max-w-xl" : "max-w-md"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-brand-100 bg-gradient-to-r from-brand-50/80 to-[#f3f0ff]/80 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5"><span className="h-3 w-3 shrink-0 rounded-full bg-brand-400 ring-4 ring-white" /><h3 id={titleId} className="truncate text-[15px] font-bold text-slate-900">{title}</h3></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-white hover:text-brand-600" aria-label="关闭弹窗">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={`txzz-modal-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 ${contentClassName}`}>{children}</div>
        {footer && <div className="txzz-modal-footer shrink-0 border-t border-slate-100 bg-slate-50/75 p-3 sm:p-4">{footer}</div>}
      </div>
    </div>
  );
  return portalIntoPluginUi(layer);
}

const QUICK_ACTION_TONE: Record<string, { icon: string; card: string }> = {
  pink: { icon: "bg-white text-brand-600", card: "border-brand-100 bg-brand-50/75 hover:border-brand-200" },
  purple: { icon: "bg-white text-[#7965cf]", card: "border-[#dfd8ff] bg-[#f3f0ff]/85 hover:border-[#cfc4ff]" },
  sky: { icon: "bg-white text-info-600", card: "border-info-100 bg-info-50/80 hover:border-[#c4ddfa]" },
  amber: { icon: "bg-white text-warning-600", card: "border-warning-100 bg-warning-50/80 hover:border-[#f2d9a9]" },
  emerald: { icon: "bg-white text-success-600", card: "border-success-100 bg-success-50/80 hover:border-[#bce7d5]" },
  rose: { icon: "bg-white text-danger-600", card: "border-danger-100 bg-danger-50/80 hover:border-danger-200" }
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
            className={`txzz-quick-action-btn group flex min-h-[5.5rem] flex-col items-start justify-between rounded-[1.35rem] border p-3.5 text-left shadow-[var(--txzz-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${tone.card}`}
          >
            <span className={`flex h-9 w-9 rotate-[-3deg] items-center justify-center rounded-[0.9rem] border border-white shadow-sm ${tone.icon}`}>
              <item.icon size={17} strokeWidth={2.1} />
            </span>
            <span className="text-[12px] font-bold text-slate-700 group-hover:text-slate-900">{item.label}</span>
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
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-brand-50/65 active:scale-[0.995] ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${className}`}>{children}</div>;
}
