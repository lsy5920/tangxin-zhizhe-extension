import {
  AlertTriangle,
  ArrowRight,
  Compass,
  Film,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { CinemaHistoryItem, CinemaPrimaryRoute } from "../../cinema/appModel";
import type { CinemaCatalogFilters, CinemaCatalogMode, CinemaCatalogState, CinemaMovie } from "../../cinema/types";
import { CinemaFilters } from "./CinemaFilters";
import { CinemaHero } from "./CinemaHero";
import { CinemaMovieCard } from "./CinemaMovieCard";

export type CinemaQuery = { mode: CinemaCatalogMode; query: string; filters: CinemaCatalogFilters };

type CommonProps = {
  catalog: CinemaCatalogState;
  resolvingMovieId: string;
  onMovie: (movie: CinemaMovie) => void;
  onPlay: (movie: CinemaMovie) => void;
  onQuery: (query: CinemaQuery) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
};

type HomeProps = CommonProps & {
  history: CinemaHistoryItem[];
  onNavigate: (route: CinemaPrimaryRoute) => void;
};

function CatalogSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-5" aria-label="正在加载影院目录" aria-busy="true">
      {!compact && <div className="h-[clamp(20rem,48vh,33rem)] animate-pulse rounded-[1.7rem] border border-white/8 bg-white/5" />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: compact ? 6 : 12 }, (_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-[1.25rem] border border-white/7 bg-white/4" />)}
      </div>
    </div>
  );
}

function CatalogError({ catalog, hasContent, onRefresh }: { catalog: CinemaCatalogState; hasContent: boolean; onRefresh: () => void }) {
  if (catalog.phase !== "error") return null;
  if (hasContent) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-amber-300/20 bg-amber-300/8 px-4 py-3" role="alert">
        <AlertTriangle size={17} className="shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1"><p className="text-[11px] font-black text-amber-100">目录更新失败，已保留上次片单</p><p className="mt-0.5 truncate text-[9px] font-semibold text-white/45">{catalog.error || "目录服务暂时不可用"}</p></div>
        <button type="button" onClick={onRefresh} className="min-h-9 rounded-xl border border-amber-200/20 bg-black/20 px-3 text-[10px] font-black text-amber-100 hover:bg-white/8">重试</button>
      </div>
    );
  }
  return (
    <div className="rounded-[1.6rem] border border-rose-300/18 bg-rose-300/8 px-5 py-12 text-center" role="alert">
      <AlertTriangle size={30} className="mx-auto text-rose-300" />
      <h2 className="mt-3 text-[15px] font-black">影院片单暂时没有到场</h2>
      <p className="mx-auto mt-2 max-w-md text-[11px] font-medium leading-5 text-white/45">{catalog.error || "目录接口返回异常，请稍后重试。"}</p>
      <button type="button" onClick={onRefresh} className="mt-4 min-h-11 rounded-2xl bg-white px-4 text-[11px] font-black text-[#211329]">重新同步</button>
    </div>
  );
}

function MovieGrid({ movies, onMovie }: { movies: CinemaMovie[]; onMovie: (movie: CinemaMovie) => void }) {
  if (!movies.length) {
    return <div className="rounded-[1.35rem] border border-dashed border-white/12 py-12 text-center text-white/42"><SearchX size={29} className="mx-auto" /><p className="mt-2 text-[12px] font-black">没有找到匹配影片</p><p className="mt-1 text-[9px] font-semibold">可以换个关键词或减少筛选条件</p></div>;
  }
  return <div className="txzz-cinema-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{movies.map((movie) => <CinemaMovieCard key={movie.id} movie={movie} onOpen={onMovie} />)}</div>;
}

function LoadMoreButton({ catalog, onLoadMore }: { catalog: CinemaCatalogState; onLoadMore: () => void }) {
  if (!catalog.hasMore) return null;
  const loading = catalog.phase === "loading-more";
  return (
    <div className="mt-5 flex justify-center">
      <button type="button" disabled={loading} onClick={onLoadMore} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/12 bg-white/7 px-5 text-[11px] font-black text-white transition hover:bg-white/12 disabled:opacity-45">
        {loading ? <LoaderCircle size={14} className="animate-spin" /> : <Film size={14} />}{loading ? "正在接片" : "继续加载"}
      </button>
    </div>
  );
}

function Shelf({ title, eyebrow, movies, onMovie, onMore }: { title: string; eyebrow?: string; movies: CinemaMovie[]; onMovie: (movie: CinemaMovie) => void; onMore?: () => void }) {
  if (!movies.length) return null;
  return (
    <section className="txzz-cinema-app-shelf">
      <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0"><p className="text-[8px] font-black tracking-[.18em] text-violet-300/58">{eyebrow || "CURATED FOR YOU"}</p><h2 className="mt-1 truncate text-[16px] font-black tracking-[-.02em] text-white sm:text-[18px]">{title}</h2></div>
        {onMore && <button type="button" onClick={onMore} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-[10px] font-black text-fuchsia-200/75 transition hover:bg-white/7 hover:text-fuchsia-100">全部 <ArrowRight size={12} /></button>}
      </div>
      <div className="txzz-cinema-shelf flex gap-3 overflow-x-auto pb-3">{movies.map((movie) => <CinemaMovieCard key={movie.id} movie={movie} featured onOpen={onMovie} />)}</div>
    </section>
  );
}

export function CinemaHomeView({ catalog, history, resolvingMovieId, onMovie, onPlay, onQuery, onRefresh, onNavigate }: HomeProps) {
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const featured = items[0] || sections[0]?.items?.[0] || null;
  const hasContent = Boolean(featured);
  const loadingEmpty = catalog.phase === "loading" && !featured;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 p-3 pb-8 sm:p-5 lg:p-7 xl:px-9">
      <p className="sr-only" role="status" aria-live="polite">{catalog.phase === "loading" ? "正在同步影院首页" : `已载入 ${items.length || sections.reduce((sum, section) => sum + section.items.length, 0)} 部影片`}</p>
      {loadingEmpty ? <CatalogSkeleton /> : <CatalogError catalog={catalog} hasContent={hasContent} onRefresh={onRefresh} />}
      {featured && <CinemaHero movie={featured} onDetails={onMovie} onPlay={onPlay} resolving={resolvingMovieId === featured.id} />}

      {history.length > 0 && (
        <Shelf title="继续今晚的故事" eyebrow="RECENTLY CHECKED" movies={history.slice(0, 12).map((item) => item.movie)} onMovie={onMovie} onMore={() => onNavigate("history")} />
      )}

      {sections.map((section) => (
        <Shelf
          key={section.id}
          title={section.title}
          movies={section.items}
          onMovie={onMovie}
          onMore={Object.keys(section.filter || {}).length ? () => {
            onNavigate("discover");
            onQuery({ mode: "browse", query: "", filters: section.filter });
          } : undefined}
        />
      ))}

      {!loadingEmpty && !featured && catalog.phase !== "error" && <div className="rounded-[1.6rem] border border-dashed border-white/12 bg-white/3 py-14 text-center text-white/42"><Film size={30} className="mx-auto" /><p className="mt-3 text-[13px] font-black">本期片单为空</p></div>}

      <section className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => onNavigate("discover")} className="group relative min-h-28 overflow-hidden rounded-[1.5rem] border border-violet-300/13 bg-[linear-gradient(135deg,rgba(105,71,164,.24),rgba(255,255,255,.035))] p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-200/25">
          <Compass size={22} className="text-violet-200" /><h3 className="mt-3 text-[13px] font-black">按类型慢慢逛</h3><p className="mt-1 text-[9px] font-semibold leading-4 text-white/40">最新、热门、免费、VIP 和横竖屏组合筛选</p><ArrowRight className="absolute right-4 top-4 text-white/20 transition group-hover:translate-x-1 group-hover:text-white/55" size={18} />
        </button>
        <button type="button" onClick={() => onNavigate("search")} className="group relative min-h-28 overflow-hidden rounded-[1.5rem] border border-fuchsia-300/13 bg-[linear-gradient(135deg,rgba(177,54,137,.22),rgba(255,255,255,.035))] p-4 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-200/25">
          <Search size={22} className="text-fuchsia-200" /><h3 className="mt-3 text-[13px] font-black">直接搜想看的</h3><p className="mt-1 text-[9px] font-semibold leading-4 text-white/40">搜索只读原始目录，点击开映才会获取完整线路</p><ArrowRight className="absolute right-4 top-4 text-white/20 transition group-hover:translate-x-1 group-hover:text-white/55" size={18} />
        </button>
      </section>

      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/7 pt-5 text-center text-[9px] font-semibold text-white/28"><span className="inline-flex items-center gap-1"><ShieldCheck size={10} />目录不含完整播放 URL</span><span>·</span><span>开映前不轮换账号</span><span>·</span><span>资源就绪后默认暂停</span></footer>
    </div>
  );
}

export function CinemaExploreView({ catalog, resolvingMovieId, onMovie, onQuery, onLoadMore, onRefresh, searchOnly = false }: CommonProps & { searchOnly?: boolean }) {
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const sectionMovies = sections.flatMap((section) => section.items);
  // 个别版本的首页只返回扁平 items；发现页必须回退到该列表，不把已有片单渲染成空状态。
  const movies = catalog.mode === "discover" ? (sectionMovies.length ? sectionMovies : items) : items;
  const hasContent = movies.length > 0;
  const loadingEmpty = catalog.phase === "loading" && !hasContent;
  const resultTitle = searchOnly
    ? catalog.query ? `“${catalog.query}” 的搜索结果` : "输入标题或关键词"
    : catalog.mode === "discover" ? "全部发现" : "本次筛选片单";

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 pb-8 sm:p-5 lg:p-7 xl:px-9">
      <CinemaFilters query={catalog.query} mode={catalog.mode} filters={catalog.filters} loading={catalog.phase === "loading" || catalog.phase === "loading-more"} onQuery={onQuery} />
      <CatalogError catalog={catalog} hasContent={hasContent} onRefresh={onRefresh} />
      {loadingEmpty ? <CatalogSkeleton compact /> : (
        <section className="rounded-[1.55rem] border border-white/8 bg-white/[.025] p-3.5 sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="flex items-center gap-1.5 text-[8px] font-black tracking-[.17em] text-fuchsia-300/58">{searchOnly ? <Search size={10} /> : <Sparkles size={10} />}{searchOnly ? "SEARCH RESULTS" : "CINEMA DISCOVERY"}</p><h2 className="mt-1 text-[17px] font-black tracking-[-.025em]">{resultTitle}</h2></div>
            <button type="button" onClick={onRefresh} disabled={catalog.phase === "loading"} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/9 bg-white/5 px-3 text-[10px] font-black text-white/55 transition hover:bg-white/9 hover:text-white disabled:opacity-45"><RefreshCw size={12} className={catalog.phase === "loading" ? "animate-spin" : ""} />刷新</button>
          </div>
          <MovieGrid movies={movies} onMovie={onMovie} />
          <LoadMoreButton catalog={catalog} onLoadMore={onLoadMore} />
        </section>
      )}
      {resolvingMovieId && <p className="sr-only" role="status">影片 {resolvingMovieId} 正在检票</p>}
    </div>
  );
}
