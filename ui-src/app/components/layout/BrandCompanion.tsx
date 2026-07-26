import { Sparkles } from "lucide-react";

export function BrandCompanion({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`txzz-brand-companion ${compact ? "txzz-brand-companion--compact" : ""}`}
      aria-hidden="true"
    >
      <span className="txzz-brand-companion-ear txzz-brand-companion-ear--left" />
      <span className="txzz-brand-companion-ear txzz-brand-companion-ear--right" />
      <span className="txzz-brand-companion-face">
        <span className="txzz-brand-companion-eyes">•ᴗ•</span>
        <span className="txzz-brand-companion-cheek txzz-brand-companion-cheek--left" />
        <span className="txzz-brand-companion-cheek txzz-brand-companion-cheek--right" />
      </span>
      <Sparkles className="txzz-brand-companion-sparkle" size={compact ? 10 : 12} />
    </span>
  );
}
