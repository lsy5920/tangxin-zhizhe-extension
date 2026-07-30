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
    <div className="txzz-stream-filter-panel">
      <form onSubmit={submit} className="txzz-stream-search-form">
        <label>
          <span className="sr-only">搜索影院影片</span>
          <Search size={17} />
          <input id="txzz-cinema-search" name="txzz-cinema-search" value={text} onChange={(event) => setText(event.target.value)} placeholder="输入片名、创作者或关键词" />
        </label>
        <button type="submit" disabled={loading}>
          <Search size={14} />搜索
        </button>
      </form>
      <div className="txzz-stream-filter-strip" role="group" aria-label="影片筛选">
        {PRESETS.map((preset) => {
          const active = cinemaPresetActive(preset, mode, filters);
          return (
            <button key={preset.key} type="button" onClick={() => onQuery(buildCinemaPresetQuery(preset, text))} aria-pressed={active} className={active ? "is-active" : ""}>
              <preset.icon size={12} />{preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
