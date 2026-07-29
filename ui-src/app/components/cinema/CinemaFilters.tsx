import { FormEvent, useEffect, useState } from "react";
import { Compass, Crown, Flame, Grid2X2, MonitorPlay, Search, Smartphone, Sparkles } from "lucide-react";
import type { CinemaCatalogFilters, CinemaCatalogMode } from "../../cinema/types";

type Query = { mode: CinemaCatalogMode; query: string; filters: CinemaCatalogFilters };

type Props = {
  query?: string;
  mode?: CinemaCatalogMode;
  filters?: CinemaCatalogFilters;
  loading?: boolean;
  onQuery: (query: Query) => void;
};

const PRESETS = [
  { key: "discover", label: "发现", icon: Compass, mode: "discover" as const, filters: {} },
  { key: "new", label: "最新", icon: Sparkles, mode: "browse" as const, filters: { order: "new" } },
  { key: "hot", label: "热门", icon: Flame, mode: "browse" as const, filters: { order: "hot" } },
  { key: "free", label: "免费", icon: Grid2X2, mode: "browse" as const, filters: { pay_type: "free" } },
  { key: "vip", label: "VIP", icon: Crown, mode: "browse" as const, filters: { pay_type: "vip" } },
  { key: "portrait", label: "竖屏", icon: Smartphone, mode: "browse" as const, filters: { canvas: "long" } },
  { key: "landscape", label: "横屏", icon: MonitorPlay, mode: "browse" as const, filters: { canvas: "short" } }
];

type QueryPreset = { mode: "discover" | "browse"; filters: CinemaCatalogFilters };

export function cinemaPresetActive(preset: QueryPreset, mode: CinemaCatalogMode, filters: CinemaCatalogFilters) {
  if (preset.mode === "discover") return mode === "discover";
  if (mode === "discover") return false;
  const entries = Object.entries(preset.filters);
  return entries.every(([key, value]) => filters[key as keyof CinemaCatalogFilters] === value);
}

export function buildCinemaSearchQuery(keyword: string, filters: CinemaCatalogFilters): Query {
  const query = keyword.trim();
  const hasFilters = Object.values(filters).some((value) => String(value || "").trim());
  return {
    mode: query ? "search" : hasFilters ? "browse" : "discover",
    query,
    filters: hasFilters ? filters : {}
  };
}

export function buildCinemaPresetQuery(preset: QueryPreset, keyword: string): Query {
  if (preset.mode === "discover") return { mode: "discover", query: "", filters: {} };
  const query = keyword.trim();
  return {
    mode: query ? "search" : "browse",
    query,
    filters: preset.filters
  };
}

export function CinemaFilters({ query = "", mode = "discover", filters = {}, loading = false, onQuery }: Props) {
  const [text, setText] = useState(query);
  useEffect(() => setText(query), [query]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onQuery(buildCinemaSearchQuery(text, filters));
  };

  return (
    <div className="txzz-cinema-toolbar sticky top-0 z-10 space-y-2 rounded-[1.35rem] border border-white/12 bg-[#17111f]/92 p-2.5 shadow-[0_14px_35px_rgba(13,8,20,.28)] backdrop-blur-xl sm:p-3">
      <form onSubmit={submit} className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索影院影片</span>
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-200/55" />
          <input id="txzz-cinema-search" name="txzz-cinema-search" value={text} onChange={(event) => setText(event.target.value)} placeholder="搜索标题或关键词" className="h-11 w-full rounded-2xl border border-white/10 bg-white/7 pl-10 pr-3 text-[12px] font-bold text-white outline-none transition placeholder:text-white/35 focus:border-fuchsia-300/45 focus:bg-white/10 focus:ring-3 focus:ring-fuchsia-300/10" />
        </label>
        <button type="submit" disabled={loading} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 text-[11px] font-black text-white shadow-lg shadow-fuchsia-950/25 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55">
          <Search size={13} /> 搜索
        </button>
      </form>
      <div className="txzz-cinema-filter-strip flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="影片筛选">
        {PRESETS.map((preset) => {
          const active = cinemaPresetActive(preset, mode, filters);
          return (
            <button key={preset.key} type="button" onClick={() => onQuery(buildCinemaPresetQuery(preset, text))} aria-pressed={active} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-extrabold transition ${active ? "border-fuchsia-300/45 bg-fuchsia-300/18 text-fuchsia-100" : "border-white/8 bg-white/5 text-violet-100/55 hover:bg-white/10 hover:text-white"}`}>
              <preset.icon size={12} />{preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
