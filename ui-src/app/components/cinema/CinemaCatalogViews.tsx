import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Crown,
  Film,
  Flame,
  Gift,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  WandSparkles
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
    <div className={`txzz-cinema58-skeleton ${compact ? "is-compact" : ""}`} aria-label="正在加载影院目录" aria-busy="true">
      {!compact && <span className="txzz-cinema58-skeleton-hero" />}
      <div>{Array.from({ length: compact ? 12 : 8 }, (_, index) => <span key={index} />)}</div>
    </div>
  );
}

function CatalogError({ catalog, hasContent, onRefresh }: { catalog: CinemaCatalogState; hasContent: boolean; onRefresh: () => void }) {
  if (catalog.phase !== "error") return null;
  return (
    <div className={`txzz-cinema58-inline-state is-error ${hasContent ? "is-compact" : ""}`} role="alert">
      <i><AlertTriangle size={20} /></i>
      <div><strong>{hasContent ? "片单更新失败，正在展示上次内容" : "片单暂时没有送达"}</strong><span>{catalog.error || "目录服务暂时不可用"}</span></div>
      <button type="button" onClick={onRefresh}><RefreshCw size={14} />重试</button>
    </div>
  );
}

function SectionHeading({ title, eyebrow, count, onMore }: { title: string; eyebrow?: string; count?: number; onMore?: () => void }) {
  return (
    <div className="txzz-cinema58-section-heading">
      <div><span>{eyebrow}</span><h2>{title}</h2>{typeof count === "number" && <small>{count} 部</small>}</div>
      {onMore && <button type="button" onClick={onMore}>查看全部<ArrowRight size={15} /></button>}
    </div>
  );
}

function MediaRail({ title, eyebrow, movies, onMovie, onPlay, onMore, ranked = false }: {
  title: string;
  eyebrow?: string;
  movies: CinemaMovie[];
  onMovie: (movie: CinemaMovie) => void;
  onPlay?: (movie: CinemaMovie) => void;
  onMore?: () => void;
  ranked?: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  if (!movies.length) return null;
  const move = (direction: -1 | 1) => railRef.current?.scrollBy({ left: direction * Math.max(280, railRef.current.clientWidth * 0.78), behavior: "smooth" });
  return (
    <section className="txzz-cinema58-section">
      <div className="txzz-cinema58-section-top">
        <SectionHeading title={title} eyebrow={eyebrow} onMore={onMore} />
        <div className="txzz-cinema58-rail-buttons" aria-label={`${title} 横向滚动`}>
          <button type="button" onClick={() => move(-1)} aria-label="向前浏览"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => move(1)} aria-label="向后浏览"><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="txzz-cinema58-media-rail" ref={railRef}>
        {movies.map((movie, index) => <CinemaMovieCard key={movie.id} movie={movie} featured onOpen={onMovie} onPlay={onPlay} rank={ranked && index < 10 ? index + 1 : undefined} />)}
      </div>
    </section>
  );
}

function MovieGrid({ movies, onMovie, onPlay }: { movies: CinemaMovie[]; onMovie: (movie: CinemaMovie) => void; onPlay: (movie: CinemaMovie) => void }) {
  if (!movies.length) {
    return <div className="txzz-cinema58-empty"><i><Clapperboard size={30} /></i><strong>没有匹配的影片</strong><span>换一个关键词，或减少筛选条件再试试。</span></div>;
  }
  return <div className="txzz-cinema58-movie-grid">{movies.map((movie) => <CinemaMovieCard key={movie.id} movie={movie} onOpen={onMovie} onPlay={onPlay} />)}</div>;
}

function LoadMoreButton({ catalog, onLoadMore }: { catalog: CinemaCatalogState; onLoadMore: () => void }) {
  if (!catalog.hasMore) return null;
  const loading = catalog.phase === "loading-more";
  return <button type="button" disabled={loading} onClick={onLoadMore} className="txzz-cinema58-load-more">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Film size={16} />}{loading ? "正在加载" : "加载更多影片"}</button>;
}

function uniqueHeroMovies(catalog: CinemaCatalogState) {
  const seen = new Set<string>();
  const candidates = [...(catalog.items || []), ...(catalog.sections || []).flatMap((section) => section.items || [])];
  return candidates.filter((movie) => movie?.id && !seen.has(movie.id) && seen.add(movie.id)).slice(0, 5);
}

export function CinemaHomeView({ catalog, history, resolvingMovieId, onMovie, onPlay, onQuery, onRefresh, onNavigate }: HomeProps) {
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const heroMovies = useMemo(() => uniqueHeroMovies(catalog), [catalog]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const featured = heroMovies[heroIndex] || null;
  const hasContent = Boolean(featured);
  const loadingEmpty = catalog.phase === "loading" && !featured;
  const ranked = (sections[0]?.items || items).slice(0, 10);

  useEffect(() => {
    if (heroIndex >= heroMovies.length) setHeroIndex(0);
  }, [heroIndex, heroMovies.length]);

  useEffect(() => {
    if (heroPaused || heroMovies.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setHeroIndex((current) => (current + 1) % heroMovies.length), 8000);
    return () => window.clearInterval(timer);
  }, [heroMovies.length, heroPaused]);

  const moveHero = (direction: -1 | 1) => setHeroIndex((current) => (current + direction + heroMovies.length) % heroMovies.length);

  return (
    <div className="txzz-cinema58-home">
      <p className="sr-only" role="status" aria-live="polite">{catalog.phase === "loading" ? "正在同步影院首页" : "影院目录已经载入"}</p>
      {loadingEmpty ? <CatalogSkeleton /> : <CatalogError catalog={catalog} hasContent={hasContent} onRefresh={onRefresh} />}
      {featured && (
        <CinemaHero
          movie={featured}
          onDetails={onMovie}
          onPlay={onPlay}
          resolving={resolvingMovieId === featured.id}
          position={heroIndex}
          total={heroMovies.length}
          onPrevious={() => moveHero(-1)}
          onNext={() => moveHero(1)}
          onPauseChange={setHeroPaused}
        />
      )}

      <div className="txzz-cinema58-home-content">
        <section className="txzz-cinema58-mood-section">
          <div className="txzz-cinema58-mood-copy"><span><WandSparkles size={14} />快速选片</span><h2>今天想看哪一种？</h2><p>按热度、权益与上新时间，快速抵达合适的片场。</p></div>
          <div className="txzz-cinema58-quick-picks">
            {[
              { title: "刚刚上新", detail: "看看本期新片", icon: Sparkles, className: "is-new", filters: { order: "new" } },
              { title: "人气热映", detail: "大家正在观看", icon: Flame, className: "is-hot", filters: { order: "hot" } },
              { title: "免费片场", detail: "无需额外权益", icon: Gift, className: "is-free", filters: { pay_type: "free" } },
              { title: "VIP 精选", detail: "会员专属片单", icon: Crown, className: "is-vip", filters: { pay_type: "vip" } }
            ].map((channel) => (
              <button key={channel.title} type="button" onClick={() => { onNavigate("discover"); onQuery({ mode: "browse", query: "", filters: channel.filters }); }} className={channel.className}>
                <i><channel.icon size={19} /></i><span><strong>{channel.title}</strong><small>{channel.detail}</small></span><ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>

        {history.length > 0 && <MediaRail title="接着上次看" eyebrow="继续观影" movies={history.slice(0, 12).map((item) => item.movie)} onMovie={onMovie} onPlay={onPlay} onMore={() => onNavigate("history")} />}
        {ranked.length > 0 && <MediaRail title="影院热播榜" eyebrow="本期人气" movies={ranked} onMovie={onMovie} onPlay={onPlay} onMore={() => onNavigate("discover")} ranked />}
        {sections.slice(ranked.length ? 1 : 0).map((section) => (
          <MediaRail key={section.id} title={section.title} eyebrow="为你整理" movies={section.items} onMovie={onMovie} onPlay={onPlay} onMore={Object.keys(section.filter || {}).length ? () => { onNavigate("discover"); onQuery({ mode: "browse", query: "", filters: section.filter }); } : undefined} />
        ))}

        {!loadingEmpty && !featured && catalog.phase !== "error" && <div className="txzz-cinema58-empty"><i><Clapperboard size={31} /></i><strong>本期片单为空</strong><span>稍后刷新，或前往搜索寻找影片。</span></div>}
        <footer className="txzz-cinema58-catalog-note"><Sparkles size={13} />浏览片单不会提前请求完整片源；播放与下载只在你的明确点击之后准备。</footer>
      </div>
    </div>
  );
}

export function CinemaExploreView({ catalog, resolvingMovieId, onMovie, onPlay, onQuery, onLoadMore, onRefresh, searchOnly = false }: CommonProps & { searchOnly?: boolean }) {
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const sectionMovies = sections.flatMap((section) => section.items);
  const movies = catalog.mode === "discover" ? (sectionMovies.length ? sectionMovies : items) : items;
  const hasContent = movies.length > 0;
  const loadingEmpty = catalog.phase === "loading" && !hasContent;
  const resultTitle = searchOnly
    ? catalog.query ? `“${catalog.query}” 的结果` : "等待你的关键词"
    : catalog.mode === "discover" ? "全部影片" : "筛选结果";

  return (
    <div className="txzz-cinema58-browse-page">
      <header className={`txzz-cinema58-page-lead ${searchOnly ? "is-search" : ""}`}>
        <div><span>{searchOnly ? <><Search size={13} />全站检索</> : <><Compass size={13} />探索片场</>}</span><h2>{searchOnly ? "找到今晚想看的那一部" : "从丰富片单里发现惊喜"}</h2><p>{searchOnly ? "输入片名、创作者或编号；搜索只读取目录资料。" : "按上新、热度、权益与画面方向精准筛选。"}</p></div>
        <i aria-hidden="true"><Clapperboard size={44} /><Sparkles size={18} /></i>
      </header>
      <CinemaFilters query={catalog.query} mode={catalog.mode} filters={catalog.filters} loading={catalog.phase === "loading" || catalog.phase === "loading-more"} onQuery={onQuery} />
      <CatalogError catalog={catalog} hasContent={hasContent} onRefresh={onRefresh} />
      {loadingEmpty ? <CatalogSkeleton compact /> : (
        <section className="txzz-cinema58-results">
          <div className="txzz-cinema58-results-head">
            <SectionHeading title={resultTitle} eyebrow={searchOnly ? "搜索结果" : "完整片库"} count={movies.length} />
            <button type="button" onClick={onRefresh} disabled={catalog.phase === "loading"} className="txzz-cinema58-refresh"><RefreshCw size={14} className={catalog.phase === "loading" ? "animate-spin" : ""} />刷新</button>
          </div>
          <MovieGrid movies={movies} onMovie={onMovie} onPlay={onPlay} />
          <LoadMoreButton catalog={catalog} onLoadMore={onLoadMore} />
        </section>
      )}
      {resolvingMovieId && <p className="sr-only" role="status">影片 {resolvingMovieId} 正在检票</p>}
    </div>
  );
}
