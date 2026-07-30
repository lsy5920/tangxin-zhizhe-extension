import {
  AlertTriangle,
  Bookmark,
  Check,
  Clock3,
  Coins,
  Crown,
  Download,
  Eye,
  Heart,
  Layers3,
  ListVideo,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  WandSparkles
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
  if (movie.access === "coin") return { label: `${movie.price || 0} 金币`, icon: Coins, tone: "text-amber-200" };
  if (movie.access === "vip") return { label: "VIP 影片", icon: Crown, tone: "text-violet-200" };
  return { label: "免费影片", icon: Sparkles, tone: "text-emerald-200" };
}

function CinemaCollectionPanel({
  movie,
  collection,
  resolving,
  onMovie,
  onOpenPlayback,
  onPlanDownload,
  onRefresh
}: {
  movie: CinemaMovie;
  collection: CinemaCollectionState | null;
  resolving: boolean;
  onMovie: (movie: CinemaMovie) => void;
  onOpenPlayback: (movie: CinemaMovie) => void;
  onPlanDownload: (movie: CinemaMovie) => void;
  onRefresh: (movie: CinemaMovie) => void;
}) {
  const episodes = collection?.items || [];
  const selectedIndex = episodes.findIndex((episode) => episode.id === movie.id);
  const loading = !collection || collection.phase === "idle" || collection.phase === "loading";
  const failed = collection?.phase === "error";

  return (
    <section className="mt-8 overflow-hidden rounded-[1.65rem] border border-violet-300/14 bg-[linear-gradient(145deg,rgba(124,74,168,.13),rgba(255,255,255,.025))] shadow-[0_24px_75px_rgba(0,0,0,.18)]">
      <div className="flex flex-col gap-4 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[8px] font-black tracking-[.18em] text-violet-300/65"><Layers3 size={11} /> COLLECTION</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[18px] font-black tracking-[-.025em]">{collection?.title || "影片合集"}</h3>
            {episodes.length > 0 && <span className="rounded-full border border-violet-200/14 bg-violet-300/9 px-2 py-1 text-[9px] font-black text-violet-100/75">共 {episodes.length} 集</span>}
          </div>
          <p className="mt-1 text-[9px] font-semibold leading-5 text-white/40">选集只读取目标站原始合集元数据；选中后再点“开映当前集”才获取完整线路。</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => onRefresh(movie)} disabled={loading} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/10 bg-black/18 px-3 text-[10px] font-black text-white/58 transition hover:bg-white/8 hover:text-white disabled:opacity-45">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />刷新选集
          </button>
          <button type="button" onClick={() => onOpenPlayback(movie)} disabled={resolving} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-white px-3.5 text-[10px] font-black text-[#211329] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50">
            {resolving ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}{resolving ? "检票中" : "开映当前集"}
          </button>
          <button type="button" onClick={() => onPlanDownload(movie)} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-fuchsia-200/18 bg-fuchsia-400/13 px-3.5 text-[10px] font-black text-fuchsia-50 transition hover:-translate-y-0.5 hover:bg-fuchsia-400/20">
            <Download size={13} />下载当前集
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {loading && !episodes.length && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="正在读取合集分集">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[5.35rem] animate-pulse rounded-2xl border border-white/7 bg-white/4" />)}
          </div>
        )}

        {failed && !episodes.length && (
          <div className="flex flex-col items-center rounded-[1.25rem] border border-amber-300/16 bg-amber-300/7 px-4 py-8 text-center" role="alert">
            <AlertTriangle size={24} className="text-amber-200" />
            <p className="mt-3 text-[12px] font-black text-amber-50">选集暂时未到场</p>
            <p className="mt-1 max-w-md text-[9px] font-semibold leading-5 text-white/42">{collection?.error || "合集元数据读取失败，不会因此触发播放或购买。"}</p>
            <button type="button" onClick={() => onRefresh(movie)} className="mt-4 min-h-10 rounded-xl bg-white px-4 text-[10px] font-black text-[#211329]">重新读取选集</button>
          </div>
        )}

        {episodes.length > 0 && (
          <>
            {(loading || failed) && (
              <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[9px] font-bold ${failed ? "border-amber-300/16 bg-amber-300/7 text-amber-100" : "border-violet-300/14 bg-violet-300/7 text-violet-100"}`} role={failed ? "alert" : "status"}>
                {failed ? <AlertTriangle size={12} /> : <LoaderCircle size={12} className="animate-spin" />}
                {failed ? `刷新失败，已保留上次的 ${episodes.length} 集` : `正在刷新，先展示已缓存的 ${episodes.length} 集`}
              </div>
            )}
            <div className="txzz-cinema-episode-grid grid max-h-[28rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {episodes.map((episode, index) => {
                const selected = episode.id === movie.id;
                const episodeAccess = accessMeta(episode);
                const EpisodeAccessIcon = episodeAccess.icon;
                return (
                  <button
                    key={episode.id}
                    type="button"
                    onClick={() => onMovie(episode)}
                    aria-current={selected ? "true" : undefined}
                    className={`group grid min-h-[5.35rem] grid-cols-[4.35rem_minmax(0,1fr)] overflow-hidden rounded-2xl border text-left transition ${selected ? "border-fuchsia-300/42 bg-fuchsia-300/12 shadow-[0_12px_30px_rgba(198,74,179,.14)]" : "border-white/8 bg-black/16 hover:border-violet-200/23 hover:bg-white/6"}`}
                  >
                    <span className="relative overflow-hidden bg-[#17111f]">
                      <CinemaPoster movie={episode} alt="" className="absolute inset-0" imageClassName="size-full object-cover transition duration-300 group-hover:scale-[1.04]" fallback={<span className="flex size-full items-center justify-center text-2xl" aria-hidden="true">🍿</span>} />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/48 to-transparent" />
                      <span className="absolute bottom-1 left-1 rounded-md bg-black/64 px-1.5 py-0.5 text-[8px] font-black text-white/80">{index + 1}</span>
                    </span>
                    <span className="flex min-w-0 flex-col justify-center px-3 py-2">
                      <span className={`line-clamp-2 text-[10px] font-black leading-4 ${selected ? "text-fuchsia-50" : "text-white/78"}`}>{episode.title}</span>
                      <span className="mt-1 flex min-w-0 items-center gap-2 text-[8px] font-bold text-white/36">
                        <span className="inline-flex items-center gap-1"><Clock3 size={9} />{episode.durationLabel}</span>
                        <span className={`inline-flex min-w-0 items-center gap-1 truncate ${episodeAccess.tone}`}><EpisodeAccessIcon size={9} />{episodeAccess.label}</span>
                      </span>
                      <span className={`mt-1.5 inline-flex w-fit items-center gap-1 text-[8px] font-black ${selected ? "text-fuchsia-200" : "text-violet-200/48"}`}><ListVideo size={9} />{selected ? `当前第 ${selectedIndex + 1} 集` : `选择第 ${index + 1} 集`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function CinemaDetailPage({ movie, collection = null, libraryEntry, resolving, related, onOpenPlayback, onPlanDownload, onRefreshCollection, onToggleFavorite, onToggleWatchLater, onMovie, onBack }: Props) {
  if (!movie) {
    return (
      <div className="flex min-h-full items-center justify-center p-5">
        <div className="max-w-md rounded-[1.7rem] border border-white/9 bg-white/[.035] px-6 py-12 text-center"><span className="text-5xl" aria-hidden="true">🎞️</span><h2 className="mt-4 text-[16px] font-black">影片信息已过期</h2><p className="mt-2 text-[10px] font-semibold leading-5 text-white/42">目录页可能已刷新，返回重新选择即可。不会因此在后台解析或购买。</p><button type="button" onClick={onBack} className="mt-5 min-h-11 rounded-2xl bg-white px-5 text-[11px] font-black text-[#211329]">返回选片</button></div>
      </div>
    );
  }
  const access = accessMeta(movie);
  const AccessIcon = access.icon;
  const collectionCount = collection?.items?.length || 0;
  const isCollection = movie.isCollection === true || collectionCount > 1;

  return (
    <div className="relative min-h-full overflow-hidden">
      <CinemaPoster movie={movie} eager alt="" className="pointer-events-none absolute inset-x-0 top-0 h-[min(72vh,46rem)]" imageClassName="size-full object-cover opacity-52 blur-[1px]" fallback={<div className="size-full bg-[radial-gradient(circle_at_70%_20%,#684779_0%,#25162e_48%,#0b0810_100%)]" />} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[min(72vh,46rem)] bg-[linear-gradient(90deg,rgba(8,6,12,.97)_0%,rgba(8,6,12,.82)_42%,rgba(8,6,12,.3)_78%,rgba(8,6,12,.68)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[min(72vh,46rem)] bg-gradient-to-t from-[#08060c] via-transparent to-black/24" />

      <div className="relative mx-auto w-full max-w-[1500px] px-3 pb-10 pt-5 sm:px-6 sm:pt-8 lg:px-10 lg:pt-12">
        <div className="grid min-h-[min(62vh,38rem)] items-end gap-6 lg:grid-cols-[minmax(0,1.2fr)_18rem] xl:grid-cols-[minmax(0,1.35fr)_21rem]">
          <section className="max-w-3xl pb-2">
            <p className="flex items-center gap-1.5 text-[9px] font-black tracking-[.2em] text-fuchsia-200/75"><WandSparkles size={12} /> CINEMA FEATURE · #{movie.id}</p>
            <h2 className="mt-3 text-[clamp(1.85rem,5vw,4.2rem)] font-black leading-[1.03] tracking-[-.055em] text-white drop-shadow-2xl">{movie.title}</h2>
            <p className="mt-3 text-[12px] font-bold text-white/56">{movie.creator || "目标站影片"}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-black text-white/68">
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/9 bg-black/24 px-3 backdrop-blur"><Clock3 size={12} />{movie.durationLabel}</span>
              <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/9 bg-black/24 px-3 backdrop-blur ${access.tone}`}><AccessIcon size={12} />{access.label}</span>
              {isCollection && <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-violet-300/18 bg-violet-300/10 px-3 text-violet-100"><Layers3 size={12} />{collectionCount > 1 ? `合集 · ${collectionCount} 集` : "合集影片"}</span>}
              <span className="inline-flex min-h-8 items-center rounded-full border border-white/9 bg-black/24 px-3 backdrop-blur">{movie.orientation === "portrait" ? "9:16 竖屏" : movie.orientation === "landscape" ? "横屏" : "方屏"}</span>
              {movie.score && <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-amber-300/15 bg-amber-300/10 px-3 text-amber-200"><Star size={11} fill="currentColor" />{movie.score}</span>}
              {movie.views && <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/9 bg-black/24 px-3"><Eye size={11} />{movie.views}</span>}
            </div>
            <p className="mt-5 max-w-2xl text-[11px] font-semibold leading-6 text-white/48">当前展示的是目标站原始目录元数据。糖心影院不会在浏览、搜索或打开详情时预取完整播放地址；只有你明确点击开映或下载后，才进入可见检票、线路决策与安全解锁流程。</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button type="button" disabled={resolving} onClick={() => onOpenPlayback(movie)} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 text-[12px] font-black text-[#211329] shadow-[0_18px_42px_rgba(255,255,255,.12)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55">
                {resolving ? <Sparkles size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}{resolving ? "正在检票" : isCollection ? "获取当前集完整线路" : "获取完整线路并开映"}
              </button>
              <button type="button" onClick={() => onPlanDownload(movie)} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-fuchsia-200/18 bg-fuchsia-400/14 px-4 text-[11px] font-black text-fuchsia-50 backdrop-blur transition hover:-translate-y-0.5 hover:bg-fuchsia-400/22">
                <Download size={15} />{isCollection ? "下载当前集" : "下载完整视频"}
              </button>
              <button type="button" onClick={() => onToggleFavorite(movie)} className={`inline-flex min-h-12 items-center gap-2 rounded-2xl border px-4 text-[11px] font-black backdrop-blur transition ${libraryEntry?.favorite ? "border-fuchsia-300/35 bg-fuchsia-300/15 text-fuchsia-100" : "border-white/13 bg-black/26 text-white/70 hover:bg-white/9 hover:text-white"}`}>{libraryEntry?.favorite ? <Check size={15} /> : <Heart size={15} />}{libraryEntry?.favorite ? "已收藏" : "收藏"}</button>
              <button type="button" onClick={() => onToggleWatchLater(movie)} className={`inline-flex min-h-12 items-center gap-2 rounded-2xl border px-4 text-[11px] font-black backdrop-blur transition ${libraryEntry?.watchLater ? "border-violet-300/35 bg-violet-300/15 text-violet-100" : "border-white/13 bg-black/26 text-white/70 hover:bg-white/9 hover:text-white"}`}>{libraryEntry?.watchLater ? <Check size={15} /> : <Bookmark size={15} />}{libraryEntry?.watchLater ? "已稍后看" : "稍后看"}</button>
            </div>
          </section>

          <aside className="hidden justify-self-end lg:block">
            <div className="w-full overflow-hidden rounded-[1.6rem] border border-white/14 bg-[#17111f] shadow-[0_28px_80px_rgba(0,0,0,.42)]">
              <CinemaPoster movie={movie} eager alt={`${movie.title} 海报`} className="aspect-[3/4]" imageClassName="size-full object-cover" fallback={<div className="flex aspect-[3/4] items-center justify-center bg-[radial-gradient(circle_at_50%_20%,#5b3b70,#17111f)] text-6xl">🍿</div>} />
            </div>
          </aside>
        </div>

        {isCollection && (
          <CinemaCollectionPanel
            movie={movie}
            collection={collection}
            resolving={resolving}
            onMovie={onMovie}
            onOpenPlayback={onOpenPlayback}
            onPlanDownload={onPlanDownload}
            onRefresh={onRefreshCollection}
          />
        )}

        <section className="mt-7 grid gap-3 md:grid-cols-3">
          <article className="rounded-[1.35rem] border border-emerald-300/12 bg-emerald-300/6 p-4"><ShieldCheck size={18} className="text-emerald-200" /><h3 className="mt-3 text-[12px] font-black">目录安全边界</h3><p className="mt-1.5 text-[9px] font-semibold leading-5 text-white/42">浏览详情本身不包含完整播放 URL，也不会在后台自动购买。</p></article>
          <article className="rounded-[1.35rem] border border-violet-300/12 bg-violet-300/6 p-4"><Sparkles size={18} className="text-violet-200" /><h3 className="mt-3 text-[12px] font-black">智能线路决策</h3><p className="mt-1.5 text-[9px] font-semibold leading-5 text-white/42">明确点击开映或下载后，按健康度、实际探测与主备角色选择线路。</p></article>
          <article className="rounded-[1.35rem] border border-fuchsia-300/12 bg-fuchsia-300/6 p-4"><Play size={18} className="text-fuchsia-200" /><h3 className="mt-3 text-[12px] font-black">由你亲自开映</h3><p className="mt-1.5 text-[9px] font-semibold leading-5 text-white/42">资源就绪后仍保持暂停，不会因打开详情而自动播放。</p></article>
        </section>

        {related.length > 0 && (
          <section className="mt-8">
            <div className="mb-3"><p className="text-[8px] font-black tracking-[.18em] text-fuchsia-300/58">MORE LIKE THIS</p><h3 className="mt-1 text-[17px] font-black">也许你还会喜欢</h3></div>
            <div className="txzz-cinema-shelf flex gap-3 overflow-x-auto pb-3">{related.slice(0, 12).map((item) => <CinemaMovieCard key={item.id} movie={item} featured onOpen={onMovie} />)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
