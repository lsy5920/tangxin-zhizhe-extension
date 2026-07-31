import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  Clapperboard,
  Coins,
  Crown,
  Download,
  Eye,
  Heart,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star
} from "lucide-react";
import type { CinemaCollectionState, CinemaMovie } from "../../cinema/types";
import type { LibraryEntry } from "../../types";
import { CinemaMovieCard } from "./CinemaMovieCard";
import { CinemaPoster } from "./CinemaPoster";

type Props = {
  movie: CinemaMovie | null;
  collection?: CinemaCollectionState | null;
  libraryEntry?: LibraryEntry | null;
  resolving: boolean;
  related: CinemaMovie[];
  onOpenPlayback: (movie: CinemaMovie) => void;
  onPlanDownload: (movie: CinemaMovie) => void;
  onRefreshCollection: (movie: CinemaMovie) => void;
  onToggleFavorite: (movie: CinemaMovie) => void;
  onToggleWatchLater: (movie: CinemaMovie) => void;
  onMovie: (movie: CinemaMovie) => void;
  onBack: () => void;
};

function accessMeta(movie: CinemaMovie) {
  if (movie.access === "coin") return { label: `${movie.price || 0} 金币解锁`, icon: Coins, className: "is-coin" };
  if (movie.access === "vip") return { label: "VIP 影片", icon: Crown, className: "is-vip" };
  return { label: "免费放映", icon: Sparkles, className: "is-free" };
}

function CinemaCollectionPanel({ movie, collection, resolving, onMovie, onOpenPlayback, onPlanDownload, onRefresh }: {
  movie: CinemaMovie;
  collection: CinemaCollectionState | null;
  resolving: boolean;
  onMovie: (movie: CinemaMovie) => void;
  onOpenPlayback: (movie: CinemaMovie) => void;
  onPlanDownload: (movie: CinemaMovie) => void;
  onRefresh: (movie: CinemaMovie) => void;
}) {
  const episodes = collection?.items || [];
  const selectedIndex = Math.max(0, episodes.findIndex((episode) => episode.id === movie.id));
  const loading = !collection || collection.phase === "idle" || collection.phase === "loading";
  const failed = collection?.phase === "error";

  return (
    <section className="txzz-cinema58-episodes">
      <header className="txzz-cinema58-episodes-head">
        <div><span><Layers3 size={14} />系列选集</span><h3>{collection?.title || movie.title}</h3><p>{episodes.length ? <>共 {episodes.length} 集 <i /> 当前第 {selectedIndex + 1} 集</> : "正在读取合集目录"}</p></div>
        <div>
          <button type="button" onClick={() => onRefresh(movie)} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</button>
          <button type="button" onClick={() => onPlanDownload(movie)}><Download size={15} />下载本集</button>
          <button type="button" onClick={() => onOpenPlayback(movie)} disabled={resolving} className="is-primary">{resolving ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}{resolving ? "准备中" : "播放当前集"}</button>
        </div>
      </header>

      {loading && !episodes.length && <div className="txzz-cinema58-episode-skeleton" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>}
      {failed && !episodes.length && <div className="txzz-cinema58-episode-error" role="alert"><AlertTriangle size={21} /><div><strong>选集暂时不可用</strong><p>{collection?.error || "合集目录读取失败，没有触发播放或购买。"}</p></div><button type="button" onClick={() => onRefresh(movie)}>重新读取</button></div>}
      {failed && episodes.length > 0 && <div className="txzz-cinema58-episode-error is-compact" role="alert"><AlertTriangle size={18} /><div><strong>刷新失败，已保留上次的 {episodes.length} 集</strong><p>{collection?.error || "合集目录暂时没有更新。"}</p></div><button type="button" onClick={() => onRefresh(movie)}>再次刷新</button></div>}

      {episodes.length > 0 && (
        <div className="txzz-cinema58-episode-list">
          {episodes.map((episode, index) => {
            const selected = episode.id === movie.id;
            const episodeAccess = accessMeta(episode);
            const EpisodeAccessIcon = episodeAccess.icon;
            return (
              <button key={episode.id} type="button" onClick={() => onMovie(episode)} aria-current={selected ? "true" : undefined} className={selected ? "is-active" : ""}>
                <span className="txzz-cinema58-episode-thumb">
                  <CinemaPoster movie={episode} alt="" className="size-full" imageClassName="size-full object-cover" fallback={<i aria-hidden="true"><Clapperboard size={24} /></i>} />
                  <em>{String(index + 1).padStart(2, "0")}</em>
                  {selected && <i><Play size={14} fill="currentColor" /></i>}
                </span>
                <span className="txzz-cinema58-episode-copy"><strong>{episode.title}</strong><small><span><Clock3 size={10} />{episode.durationLabel}</span><em className={episodeAccess.className}><EpisodeAccessIcon size={9} />{episodeAccess.label}</em></small></span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CinemaDetailPage({ movie, collection = null, libraryEntry, resolving, related, onOpenPlayback, onPlanDownload, onRefreshCollection, onToggleFavorite, onToggleWatchLater, onMovie, onBack }: Props) {
  if (!movie) {
    return <div className="txzz-cinema58-detail-empty"><i><Clapperboard size={34} /></i><h2>影片信息已过期</h2><p>目录已经更新，请返回重新选择。后台没有解析或购买。</p><button type="button" onClick={onBack}>返回选片</button></div>;
  }

  const access = accessMeta(movie);
  const AccessIcon = access.icon;
  const collectionCount = collection?.items?.length || 0;
  const isCollection = movie.isCollection === true || collectionCount > 1;

  return (
    <div className="txzz-cinema58-detail">
      <section className="txzz-cinema58-detail-hero">
        <CinemaPoster movie={movie} eager alt="" className="txzz-cinema58-detail-backdrop" imageClassName="size-full object-cover" fallback={<span className="txzz-cinema58-poster-symbol"><Clapperboard size={44} /></span>} />
        <div className="txzz-cinema58-detail-shade" />
        <div className="txzz-cinema58-detail-inner">
          <div className="txzz-cinema58-detail-poster">
            <CinemaPoster movie={movie} eager alt={`${movie.title} 海报`} className="size-full" imageClassName="size-full object-cover" fallback={<span className="txzz-cinema58-poster-symbol"><Clapperboard size={31} /></span>} />
            {isCollection && <span><Layers3 size={12} />{collectionCount > 1 ? `${collectionCount} 集` : "系列合集"}</span>}
          </div>
          <div className="txzz-cinema58-detail-copy">
            <span className="txzz-cinema58-detail-kicker">影片档案 · #{movie.id}</span>
            <h2>{movie.title}</h2>
            <p className="txzz-cinema58-detail-creator">{movie.creator || "糖心影院片单"}</p>
            <div className="txzz-cinema58-detail-meta">
              {movie.score && <span className="is-score"><Star size={12} fill="currentColor" />{movie.score}</span>}
              <span><Clock3 size={12} />{movie.durationLabel}</span>
              <span className={access.className}><AccessIcon size={12} />{access.label}</span>
              <span>{movie.orientation === "portrait" ? "9:16 竖屏" : movie.orientation === "square" ? "方屏" : "横屏"}</span>
              {movie.views && <span><Eye size={12} />{movie.views}</span>}
            </div>
            <p className="txzz-cinema58-detail-summary">影片详情只展示目录资料。点击播放或下载后，影院才会为当前影片执行可见检票、线路探测和必要的账号流程。</p>
            <div className="txzz-cinema58-detail-actions">
              <button type="button" disabled={resolving} onClick={() => onOpenPlayback(movie)} className="is-primary">{resolving ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}{resolving ? "正在准备" : isCollection ? "播放当前集" : "立即播放"}</button>
              <button type="button" onClick={() => onPlanDownload(movie)}><Download size={17} />下载</button>
              <button type="button" onClick={() => onToggleFavorite(movie)} className={libraryEntry?.favorite ? "is-selected" : ""} aria-pressed={libraryEntry?.favorite === true}>{libraryEntry?.favorite ? <Check size={17} /> : <Heart size={17} />}{libraryEntry?.favorite ? "已收藏" : "收藏"}</button>
              <button type="button" onClick={() => onToggleWatchLater(movie)} className={libraryEntry?.watchLater ? "is-selected" : ""} aria-pressed={libraryEntry?.watchLater === true}>{libraryEntry?.watchLater ? <Check size={17} /> : <Bookmark size={17} />}{libraryEntry?.watchLater ? "已稍后看" : "稍后看"}</button>
            </div>
          </div>
        </div>
      </section>

      <div className="txzz-cinema58-detail-content">
        {isCollection && <CinemaCollectionPanel movie={movie} collection={collection} resolving={resolving} onMovie={onMovie} onOpenPlayback={onOpenPlayback} onPlanDownload={onPlanDownload} onRefresh={onRefreshCollection} />}
        <div className="txzz-cinema58-boundary-note"><i><ShieldCheck size={18} /></i><span><strong>按需获取完整线路</strong><small>点击播放或下载后才会准备资源；播放就绪后仍保持暂停，由你决定何时开映。</small></span></div>
        {related.length > 0 && <section className="txzz-cinema58-detail-related"><header><span>猜你喜欢</span><h3>更多相似影片</h3></header><div className="txzz-cinema58-media-rail">{related.slice(0, 12).map((item) => <CinemaMovieCard key={item.id} movie={item} featured onOpen={onMovie} onPlay={onOpenPlayback} />)}</div></section>}
      </div>
    </div>
  );
}
