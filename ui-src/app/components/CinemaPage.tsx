import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clapperboard, Film, LoaderCircle, RefreshCw, SearchX, ShieldCheck, Sparkles } from "lucide-react";
import type { CinemaCatalogFilters, CinemaCatalogMode, CinemaMovie } from "../cinema/types";
import type { BridgeState, Page } from "../types";
import { CinemaDetailModal } from "./cinema/CinemaDetailModal";
import { CinemaFilters } from "./cinema/CinemaFilters";
import { CinemaHero } from "./cinema/CinemaHero";
import { CinemaMovieCard } from "./cinema/CinemaMovieCard";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage: (page: Page) => void;
};

const EMPTY_CATALOG = {
  mode: "discover" as CinemaCatalogMode,
  phase: "idle",
  query: "",
  filters: {} as CinemaCatalogFilters,
  sections: [],
  items: [],
  page: 0,
  pageSize: 24,
  hasMore: false,
  fetchedAt: "",
  error: ""
};

function formatFetchedAt(value?: string) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function CinemaSkeleton() {
  return (
    <div className="space-y-5" aria-label="正在加载影院目录" aria-busy="true">
      <div className="h-[20rem] animate-pulse rounded-[1.8rem] border border-white/10 bg-white/6" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-[1.35rem] border border-white/8 bg-white/5" />)}
      </div>
    </div>
  );
}

export function CinemaPage({ state, onAction, onPage }: Props) {
  const catalog = state.cinemaCatalog || EMPTY_CATALOG;
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const [selectedId, setSelectedId] = useState("");
  const selectedMovie = useMemo(
    () => items.find((movie) => movie.id === selectedId) || sections.flatMap((section) => section.items).find((movie) => movie.id === selectedId) || null,
    [items, sections, selectedId]
  );
  const featured = items[0] || sections[0]?.items?.[0] || null;
  const phase = catalog.phase || "idle";
  const loading = phase === "loading" || phase === "loading-more";
  const resolvingMovieId = state.screening?.request?.phase === "resolving"
    ? String(state.screening.request.movieId || "")
    : "";

  useEffect(() => {
    if (phase !== "idle" || items.length || sections.length) return;
    onAction("load-cinema-catalog", { mode: "discover" });
  }, [items.length, onAction, phase, sections.length]);

  const runQuery = ({ mode, query, filters }: { mode: CinemaCatalogMode; query: string; filters: CinemaCatalogFilters }) => {
    setSelectedId("");
    onAction("load-cinema-catalog", { mode, query, filters, forceRefresh: false });
  };

  const openPlayback = (movie: CinemaMovie) => {
    setSelectedId("");
    onAction("open-cinema-playback", { movieId: movie.id, movieTitle: movie.title });
    onPage("playback");
  };

  const updateLibrary = (movie: CinemaMovie, patch: { favorite?: boolean; watchLater?: boolean }) => {
    const current = state.experience?.library?.[movie.id];
    onAction("update-library-entry", {
      movieId: movie.id,
      title: movie.title,
      favorite: patch.favorite ?? current?.favorite ?? false,
      watchLater: patch.watchLater ?? current?.watchLater ?? false,
      tags: current?.tags || [],
      note: current?.note || ""
    });
  };

  const refresh = () => {
    onAction("load-cinema-catalog", {
      mode: catalog.mode || "discover",
      query: catalog.query || "",
      filters: catalog.filters || {},
      forceRefresh: true
    });
  };

  return (
    <div className="txzz-cinema-page txzz-page relative min-h-full overflow-hidden bg-[#0e0914] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-fuchsia-600/13 blur-3xl" />
        <span className="absolute -right-28 top-36 h-80 w-80 rounded-full bg-violet-600/15 blur-3xl" />
        <span className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-amber-400/7 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1180px] space-y-4 p-3 pb-7 sm:p-5 lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur sm:px-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[9px] font-black tracking-[.2em] text-fuchsia-300"><Sparkles size={11} /> CANDY CINEMA CATALOG</p>
            <h1 className="mt-1 flex items-center gap-2 text-[20px] font-black tracking-[-.035em] text-white sm:text-[23px]"><Clapperboard size={20} className="text-violet-300" />今晚想看什么？</h1>
            <p className="mt-1 max-w-2xl text-[10px] font-medium leading-5 text-white/42">全部片单实时来自目标网站；浏览目录不会预取线路，也不会在后台触发购买。</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full border border-emerald-300/15 bg-emerald-300/8 px-2.5 py-1.5 text-[9px] font-bold text-emerald-200 sm:inline-flex"><ShieldCheck size={11} />目录安全边界</span>
            <button type="button" onClick={refresh} disabled={loading} className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/7 px-3 text-[10px] font-black text-white/70 transition hover:bg-white/12 hover:text-white disabled:opacity-45">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />刷新
            </button>
          </div>
        </header>

        <CinemaFilters
          query={catalog.query}
          mode={catalog.mode}
          filters={catalog.filters}
          loading={loading}
          onQuery={runQuery}
        />

        {phase === "loading" && !featured ? (
          <CinemaSkeleton />
        ) : phase === "error" && !featured ? (
          <div className="rounded-[1.7rem] border border-rose-300/18 bg-rose-300/8 px-5 py-10 text-center">
            <AlertTriangle size={30} className="mx-auto text-rose-300" />
            <h2 className="mt-3 text-[15px] font-black">影院目录暂时没有到场</h2>
            <p className="mx-auto mt-2 max-w-md text-[11px] font-medium leading-5 text-white/45">{catalog.error || "目录接口返回异常，请稍后重试。"}</p>
            <button type="button" onClick={refresh} className="mt-4 min-h-11 rounded-2xl bg-white px-4 text-[11px] font-black text-[#27172f]">重新同步</button>
          </div>
        ) : featured ? (
          <>
            <CinemaHero movie={featured} onDetails={(movie) => setSelectedId(movie.id)} onPlay={openPlayback} resolving={resolvingMovieId === featured.id} />

            {catalog.mode === "discover" && sections.length > 0 ? (
              <div className="space-y-5">
                {sections.map((section) => (
                  <section key={section.id} className="rounded-[1.55rem] border border-white/9 bg-white/[.035] p-3.5 sm:p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black tracking-[.15em] text-violet-300/70">CURATED SHELF</p>
                        <h2 className="mt-0.5 truncate text-[15px] font-black text-white">{section.title}</h2>
                      </div>
                      {Object.keys(section.filter || {}).length > 0 && (
                        <button type="button" onClick={() => runQuery({ mode: "browse", query: "", filters: section.filter })} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[10px] font-black text-fuchsia-200 transition hover:bg-white/8">查看全部<ArrowRight size={12} /></button>
                      )}
                    </div>
                    <div className="txzz-cinema-shelf flex gap-3 overflow-x-auto pb-2">
                      {section.items.map((movie) => <CinemaMovieCard key={movie.id} movie={movie} featured onOpen={(item) => setSelectedId(item.id)} />)}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <section className="rounded-[1.55rem] border border-white/9 bg-white/[.035] p-3.5 sm:p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-black tracking-[.15em] text-violet-300/70">{catalog.mode === "search" ? "SEARCH RESULTS" : "CINEMA BROWSE"}</p>
                    <h2 className="mt-0.5 text-[15px] font-black text-white">{catalog.mode === "search" ? `“${catalog.query || "全部"}” 的搜索结果` : "本次筛选片单"}</h2>
                  </div>
                  <span className="text-[9px] font-bold text-white/35">已载入 {items.length} 部 · {formatFetchedAt(catalog.fetchedAt)}</span>
                </div>
                {items.length ? (
                  <div className="txzz-cinema-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {items.map((movie) => <CinemaMovieCard key={movie.id} movie={movie} onOpen={(item) => setSelectedId(item.id)} />)}
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-white/12 py-10 text-center text-white/45">
                    <SearchX size={28} className="mx-auto" /><p className="mt-2 text-[12px] font-black">没有找到匹配影片</p>
                  </div>
                )}
                {catalog.hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button type="button" disabled={loading} onClick={() => onAction("load-more-cinema-catalog", { mode: catalog.mode, query: catalog.query || "", filters: catalog.filters || {}, pageSize: catalog.pageSize || 24 })} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/12 bg-white/7 px-5 text-[11px] font-black text-white transition hover:bg-white/12 disabled:opacity-45">
                      {phase === "loading-more" ? <LoaderCircle size={14} className="animate-spin" /> : <Film size={14} />}{phase === "loading-more" ? "正在接片" : "继续加载"}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <div className="rounded-[1.7rem] border border-dashed border-white/12 bg-white/4 py-12 text-center text-white/45">
            <SearchX size={30} className="mx-auto" /><p className="mt-3 text-[13px] font-black">本期片单为空</p>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[9px] font-semibold text-white/30">
          <span className="inline-flex items-center gap-1"><ShieldCheck size={10} />目录不含完整播放 URL</span>
          <span>·</span><span>开映前不轮换账号</span><span>·</span><span>资源就绪后默认暂停</span>
        </footer>
      </div>

      <CinemaDetailModal
        movie={selectedMovie}
        libraryEntry={selectedMovie ? state.experience?.library?.[selectedMovie.id] || null : null}
        resolving={Boolean(selectedMovie && resolvingMovieId === selectedMovie.id)}
        onClose={() => setSelectedId("")}
        onOpenPlayback={openPlayback}
        onToggleFavorite={(movie) => updateLibrary(movie, { favorite: !state.experience?.library?.[movie.id]?.favorite })}
        onToggleWatchLater={(movie) => updateLibrary(movie, { watchLater: !state.experience?.library?.[movie.id]?.watchLater })}
      />
    </div>
  );
}
