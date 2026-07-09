import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

/** 页面统一内边距与纵向间距，保证五页节奏一致。 */
export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`txzz-page space-y-3.5 p-3.5 sm:p-4 ${className}`}>{children}</div>;
}

/** 分区卡片：标题栏 + 正文，可选右侧操作。 */
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
  const toneBorder =
    tone === "sky"
      ? "border-sky-100"
      : tone === "emerald"
        ? "border-emerald-100"
        : tone === "amber"
          ? "border-amber-100"
          : tone === "rose"
            ? "border-rose-100"
            : tone === "soft"
              ? "border-purple-50"
              : "border-pink-100/90";
  return (
    <section className={`txzz-section overflow-hidden rounded-2xl border bg-white/95 shadow-[0_8px_28px_rgba(147,51,234,0.06)] ${toneBorder} ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-2 border-b border-purple-50/90 px-3.5 py-2.5">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-purple-800">
                {Icon && <Icon size={14} className="shrink-0 text-pink-400" strokeWidth={2.25} />}
                {title}
              </h3>
            )}
            {hint && <p className="mt-0.5 text-[10px] leading-relaxed text-purple-400">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  );
}

/** 英雄头图：总览/播放页顶部身份区。 */
export function HeroBanner({
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
  emoji = "🍭",
  gradient = "from-pink-400 via-rose-400 to-purple-500"
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  emoji?: string;
  gradient?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-[0_14px_36px_rgba(236,72,153,0.28)]`}>
      <div className="pointer-events-none absolute -right-2 -top-3 select-none text-5xl opacity-[0.14]">{emoji}</div>
      <div className="pointer-events-none absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      {eyebrow && <p className="relative mb-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">{eyebrow}</p>}
      <h2 className="relative text-lg font-bold leading-snug tracking-tight sm:text-xl">{title}</h2>
      {subtitle && <p className="relative mt-1 text-[11px] leading-relaxed text-white/75">{subtitle}</p>}
      {badges && <div className="relative mt-2.5 flex flex-wrap gap-1.5">{badges}</div>}
      {actions && <div className="relative mt-3 flex flex-wrap gap-1.5">{actions}</div>}
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
  const base = `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} transition active:scale-95`}>
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}

/** 统计瓷砖网格。 */
export function StatGrid({
  items
}: {
  items: Array<{ label: string; value: string | number; tone?: "purple" | "emerald" | "sky" | "amber" | "rose" | "pink"; onClick?: () => void }>;
}) {
  const toneMap = {
    purple: "from-purple-50 to-fuchsia-50 text-purple-700 ring-purple-100",
    emerald: "from-emerald-50 to-teal-50 text-emerald-700 ring-emerald-100",
    sky: "from-sky-50 to-cyan-50 text-sky-700 ring-sky-100",
    amber: "from-amber-50 to-orange-50 text-amber-700 ring-amber-100",
    rose: "from-rose-50 to-pink-50 text-rose-700 ring-rose-100",
    pink: "from-pink-50 to-rose-50 text-pink-700 ring-pink-100"
  };
  return (
    <div className={`grid gap-2 ${items.length >= 4 ? "grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((item) => {
        const tone = toneMap[item.tone || "purple"];
        const body = (
          <>
            <p className="truncate text-base font-bold tabular-nums leading-none sm:text-lg">{item.value}</p>
            <p className="mt-1 truncate text-[10px] font-medium opacity-75">{item.label}</p>
          </>
        );
        const cls = `rounded-2xl bg-gradient-to-br p-2.5 text-center ring-1 shadow-sm ${tone}`;
        if (item.onClick) {
          return (
            <button key={item.label} type="button" onClick={item.onClick} className={`${cls} transition active:scale-[0.98]`}>
              {body}
            </button>
          );
        }
        return (
          <div key={item.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "sky" | "emerald" | "amber" | "soft";

const btnVariantClass: Record<BtnVariant, string> = {
  primary: "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-md shadow-pink-400/25 hover:brightness-[1.03]",
  secondary: "border border-purple-200/90 bg-white text-purple-600 hover:bg-purple-50",
  ghost: "bg-purple-50/80 text-purple-500 hover:bg-purple-100",
  danger: "border border-rose-200 bg-white text-rose-500 hover:bg-rose-50",
  sky: "bg-gradient-to-r from-sky-400 to-blue-500 text-white shadow-md shadow-sky-400/20",
  emerald: "bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-400/20",
  amber: "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md shadow-amber-400/20",
  soft: "bg-white/20 text-white backdrop-blur hover:bg-white/30"
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
      ? "min-h-7 gap-1 rounded-lg px-2 text-[10px]"
      : size === "sm"
        ? "min-h-8 gap-1 rounded-xl px-2.5 text-[11px]"
        : size === "lg"
          ? "min-h-11 gap-1.5 rounded-xl px-4 text-sm"
          : "min-h-9 gap-1.5 rounded-xl px-3 text-xs";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center font-semibold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${sizeClass} ${btnVariantClass[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === "xs" ? 11 : size === "sm" ? 12 : 13} strokeWidth={2.25} />}
      {children}
    </button>
  );
}

/** 分段筛选器（全部/进行中等）。 */
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
    <div className={`grid gap-1 rounded-2xl border border-pink-100 bg-white p-1 shadow-sm ${className}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`rounded-xl px-1 py-2 text-center transition-all ${active ? "bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-sm" : "text-purple-400 hover:bg-purple-50"}`}
          >
            {typeof item.count === "number" && (
              <p className={`text-sm font-bold tabular-nums ${active ? "text-white" : item.tone || "text-purple-700"}`}>{item.count}</p>
            )}
            <p className={`text-[10px] font-medium ${typeof item.count === "number" ? "mt-0.5" : ""}`}>{item.label}</p>
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
      className={`w-full rounded-xl border border-pink-200/90 bg-gradient-to-b from-white to-pink-50/40 px-3 py-2 text-xs text-purple-800 outline-none transition placeholder:text-purple-300 focus:border-purple-300 focus:ring-2 focus:ring-purple-100 ${className}`}
      {...rest}
    />
  );
}

export function SoftTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={`w-full resize-none rounded-xl border border-pink-200/90 bg-gradient-to-b from-white to-pink-50/40 px-3 py-2 text-xs text-purple-800 outline-none transition placeholder:text-purple-300 focus:border-purple-300 focus:ring-2 focus:ring-purple-100 ${className}`}
      {...rest}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-[11px] font-medium text-purple-400">{children}</label>;
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
    <div className="rounded-2xl border border-dashed border-pink-200 bg-gradient-to-b from-white to-pink-50/40 px-4 py-8 text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-100 to-purple-100 text-purple-400">
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <p className="text-xs font-semibold text-purple-700">{title}</p>
      {desc && <p className="mx-auto mt-1 max-w-xs text-[10px] leading-relaxed text-purple-400">{desc}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** 底部/居中弹层骨架。 */
export function ModalSheet({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="txzz-candy-interactive fixed inset-0 z-[60] flex items-end justify-center bg-black/35 p-3 backdrop-blur-[6px] sm:items-center sm:p-5" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-pink-100 bg-white shadow-[0_24px_80px_rgba(147,51,234,0.22)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-purple-50 px-4 py-3">
          <h3 className="text-sm font-bold text-purple-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-purple-300 transition hover:bg-purple-50 hover:text-purple-500" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[min(70vh,480px)] overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-purple-50 p-3">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * 快捷操作宫格。
 * 注意：渐变 class 必须写完整静态字符串，不能靠变量拼接，否则 Tailwind 扫不到、移动端会只剩白底白字。
 */
const QUICK_ACTION_TONE: Record<string, string> = {
  pink: "bg-gradient-to-br from-pink-400 to-rose-500 shadow-pink-400/30",
  purple: "bg-gradient-to-br from-purple-400 to-violet-500 shadow-purple-400/30",
  sky: "bg-gradient-to-br from-sky-400 to-blue-500 shadow-sky-400/30",
  amber: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-400/30",
  emerald: "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-400/30",
  rose: "bg-gradient-to-br from-rose-400 to-pink-500 shadow-rose-400/30"
};

export function QuickActionGrid({
  items
}: {
  items: Array<{ label: string; icon: LucideIcon; tone?: keyof typeof QUICK_ACTION_TONE; color?: string; onClick: () => void }>;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => {
        // 优先用 tone 映射完整 class；兼容旧 color 字段时回落到 purple。
        const toneKey = (item.tone || "purple") as keyof typeof QUICK_ACTION_TONE;
        const toneClass = QUICK_ACTION_TONE[toneKey] || QUICK_ACTION_TONE.purple;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl p-2.5 text-white shadow-md transition-transform active:scale-95 ${toneClass}`}
          >
            <item.icon size={18} strokeWidth={2.2} className="text-white" />
            <span className="text-center text-[10px] font-semibold leading-tight text-white">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StatusDot({ ok, pulse }: { ok?: boolean; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"} ${pulse ? "animate-pulse" : ""}`}
    />
  );
}

export function ActionToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
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
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-purple-50/80 active:scale-[0.99] ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${className}`}>{children}</div>;
}
