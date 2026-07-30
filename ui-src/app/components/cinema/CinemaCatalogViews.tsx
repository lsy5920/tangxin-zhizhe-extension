import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Film,
  Flame,
  Gift,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
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
    <div className="txzz-stream-skeleton" aria-label="正在加载影院目录" aria-busy="true">
      {!compact && <span className="txzz-stream-skeleton-hero" />}
      <div>{Array.from({ length: compact ? 12 : 8 }, (_, index) => <span key={index} />)}</div>
    </div>
  );
}

function CatalogError({ catalog, hasContent, onRefresh }: { catalog: CinemaCatalogState; hasContent: boolean; onRefresh: () => void }) {
  if (catalog.phase !== "error") return null;
  return (
    <div className={`txzz-stream-inline-state is-error ${hasContent ? "is-compact" : ""}`} role="alert">
      <AlertTriangle size={18} />
      <div><strong>{hasContent ? "片单更新失败，正在展示上次内容" : "片单暂时没有送达"}</strong><span>{catalog.error || "目录服务暂时不可用"}</span></div>
      <button type="button" onClick={onRefresh}><RefreshCw size={13} />重试</button>
    </div>
  );
}

function SectionHeading({ title, eyebrow, count, onMore }: { title: string; eyebrow?: string; count?: number; onMore?: () => void }) {
  return (
    <div className="txzz-stream-section-heading">
      <div><span>{eyebrow}</span><h2>{title}</h2>{typeof count === "number" && <small>{count} 部</small>}</div>
      {onMore && <button type="button" onClick={onMore}>查看全部<ArrowRight size={14} /></button>}
    </div>
  );
}

function MediaRail({ title, eyebrow, movies, onMovie, onMore, ranked = false }: { title: string; eyebrow?: string; movies: CinemaMovie[]; onMovie: (movie: CinemaMovie) => void; onMore?: () => void; ranked?: boolean }) {
  if (!movies.length) return null;
  return (
    <section className="txzz-stream-section">
      <SectionHeading title={title} eyebrow={eyebrow} onMore={onMore} />
      <div className="txzz-stream-media-rail">{movies.map((movie, index) => <CinemaMovieCard key={movie.id} movie={movie} featured onOpen={onMovie} rank={ranked && index < 10 ? index + 1 : undefined} />)}</div>
    </section>
  );
}

function MovieGrid({ movies, onMovie }: { movies: CinemaMovie[]; onMovie: (movie: CinemaMovie) => void }) {
  if (!movies.length) {
    return <div className="txzz-stream-empty"><Film size={28} /><strong>没有匹配的影片</strong><span>换一个关键词或减少筛选条件</span></div>;
  }
  return <div className="txzz-stream-movie-grid">{movies.map((movie) => <CinemaMovieCard key={movie.id} movie={movie} onOpen={onMovie} />)}</div>;
}

function LoadMoreButton({ catalog, onLoadMore }: { catalog: CinemaCatalogState; onLoadMore: () => void }) {
  if (!catalog.hasMore) return null;
  const loading = catalog.phase === "loading-more";
  return <button type="button" disabled={loading} onClick={onLoadMore} className="txzz-stream-load-more">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <Film size={15} />}{loading ? "正在加载" : "加载更多影片"}</button>;
}

export function CinemaHomeView({ catalog, history, resolvingMovieId, onMovie, onPlay, onQuery, onRefresh, onNavigate }: HomeProps) {
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const featured = items[0] || sections[0]?.items?.[0] || null;
  const hasContent = Boolean(featured);
  const loadingEmpty = catalog.phase === "loading" && !featured;
  const ranked = (sections[0]?.items || items).slice(0, 10);

  return (
    <div className="txzz-stream-home">
      <p className="sr-only" role="status" aria-live="polite">{catalog.phase === "loading" ? "正在同步影院首页" : `影院目录已经载入`}</p>
      {loadingEmpty ? <CatalogSkeleton /> : <CatalogError catalog={catalog} hasContent={hasContent} onRefresh={onRefresh} />}
      {featured && <CinemaHero movie={featured} onDetails={onMovie} onPlay={onPlay} resolving={resolvingMovieId === featured.id} />}

      <div className="txzz-stream-home-content">
        {history.length > 0 && <MediaRail title="最近看过" eyebrow="继续你的观影时间" movies={history.slice(0, 12).map((item) => item.movie)} onMovie={onMovie} onMore={() => onNavigate("history")} />}

        <section className="txzz-stream-section">
          <SectionHeading title="快速选片" eyebrow="按今天的心情" onMore={() => onNavigate("discover")} />
          <div className="txzz-stream-quick-picks">
            {[
              { title: "刚刚上新", detail: "看看最新片单", icon: Sparkles, className: "is-new", filters: { order: "new" } },
              { title: "正在热播", detail: "大家都在看", icon: Flame, className: "is-hot", filters: { order: "hot" } },
              { title: "免费放映", detail: "无需额外权益", icon: Gift, className: "is-free", filters: { pay_type: "free" } },
              { title: "VIP 精选", detail: "会员专属片单", icon: Crown, className: "is-vip", filters: { pay_type: "vip" } }
            ].map((channel) => (
              <button key={channel.title} type="button" onClick={() => { onNavigate("discover"); onQuery({ mode: "browse", query: "", filters: channel.filters }); }} className={channel.className}>
                <channel.icon size={18} /><span><strong>{channel.title}</strong><small>{channel.detail}</small></span><ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>

        {ranked.length > 0 && <MediaRail title="影院热播榜" eyebrow="本期人气片单" movies={ranked} onMovie={onMovie} onMore={() => onNavigate("discover")} ranked />}

        {sections.slice(ranked.length ? 1 : 0).map((section) => (
          <MediaRail key={section.id} title={section.title} eyebrow="为你整理" movies={section.items} onMovie={onMovie} onMore={Object.keys(section.filter || {}).length ? () => { onNavigate("discover"); onQuery({ mode: "browse", query: "", filters: section.filter }); } : undefined} />
        ))}

        {!loadingEmpty && !featured && catalog.phase !== "error" && <div className="txzz-stream-empty"><Film size={30} /><strong>本期片单为空</strong><span>稍后刷新，或前往搜索寻找影片</span></div>}
        <footer className="txzz-stream-catalog-note">目录页只加载影片资料；播放与下载会在你的点击之后单独准备完整线路。</footer>
      </div>
    </div>
  );
}

export function CinemaExploreView({ catalog, resolvingMovieId, onMovie, onQuery, onLoadMore, onRefresh, searchOnly = false }: CommonProps & { searchOnly?: boolean }) {
  const sections = catalog.sections || [];
  const items = catalog.items || [];
  const sectionMovies = sections.flatMap((section) => section.items);
  const movies = catalog.mode === "discover" ? (sectionMovies.length ? sectionMovies : items) : items;
  const hasContent = movies.length > 0;
  const loadingEmpty = catalog.phase === "loading" && !hasContent;
  const resultTitle = searchOnly
    ? catalog.query ? `“${catalog.query}” 的结果` : "搜索影片"
    : catalog.mode === "discover" ? "全部影片" : "筛选结果";

  return (
    <div className="txzz-stream-browse-page">
      <header className="txzz-stream-page-lead">
        <div><span>{searchOnly ? "SEARCH" : "DISCOVER"}</span><h2>{searchOnly ? "想看什么？" : "发现下一部好片"}</h2><p>{searchOnly ? "输入片名或关键词，目录搜索不会提前获取播放线路。" : "按照时间、热度、权益和画面比例快速筛选。"}</p></div>
      </header>
      <CinemaFilters query={catalog.query} mode={catalog.mode} filters={catalog.filters} loading={catalog.phase === "loading" || catalog.phase === "loading-more"} onQuery={onQuery} />
      <CatalogError catalog={catalog} hasContent={hasContent} onRefresh={onRefresh} />
      {loadingEmpty ? <CatalogSkeleton compact /> : (
        <section className="txzz-stream-results">
          <SectionHeading title={resultTitle} eyebrow={searchOnly ? "搜索结果" : "影院片库"} count={movies.length} />
          <button type="button" onClick={onRefresh} disabled={catalog.phase === "loading"} className="txzz-stream-refresh"><RefreshCw size={13} className={catalog.phase === "loading" ? "animate-spin" : ""} />刷新片单</button>
          <MovieGrid movies={movies} onMovie={onMovie} />
          <LoadMoreButton catalog={catalog} onLoadMore={onLoadMore} />
        </section>
      )}
      {resolvingMovieId && <p className="sr-only" role="status">影片 {resolvingMovieId} 正在检票</p>}
    </div>
  );
}
