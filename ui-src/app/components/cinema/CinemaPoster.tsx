import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CinemaMovie } from "../../cinema/types";
import { requestCinemaPoster } from "../../bridge";

type PosterPhase = "idle" | "loading" | "ready" | "error";

type Props = {
  movie: CinemaMovie;
  alt?: string;
  eager?: boolean;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
};

const resolvedPosterCache = new Map<string, string>();
const pendingPosterRequests = new Map<string, Promise<string>>();
const MAX_RENDER_CACHE_ITEMS = 64;
const POSTER_RETRY_DELAYS_MS = [0, 350, 1200] as const;

function rememberPoster(url: string, dataUrl: string) {
  resolvedPosterCache.delete(url);
  resolvedPosterCache.set(url, dataUrl);
  while (resolvedPosterCache.size > MAX_RENDER_CACHE_ITEMS) {
    resolvedPosterCache.delete(resolvedPosterCache.keys().next().value as string);
  }
}

async function resolvePoster(movie: CinemaMovie) {
  const url = String(movie.posterUrl || "");
  if (!url) throw new Error("影片没有海报地址");
  if (!/\.bnc(?:\?|$)/i.test(url)) return url;
  const cached = resolvedPosterCache.get(url);
  if (cached) {
    rememberPoster(url, cached);
    return cached;
  }
  if (pendingPosterRequests.has(url)) return pendingPosterRequests.get(url) as Promise<string>;
  const task = requestCinemaPoster(movie.id, url).then((dataUrl) => {
    rememberPoster(url, dataUrl);
    return dataUrl;
  });
  pendingPosterRequests.set(url, task);
  try {
    return await task;
  } finally {
    if (pendingPosterRequests.get(url) === task) pendingPosterRequests.delete(url);
  }
}

export function CinemaPoster({ movie, alt = "", eager = false, className = "", imageClassName = "", fallback = null }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(eager);
  const [phase, setPhase] = useState<PosterPhase>("idle");
  const [source, setSource] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    setSource("");
    setPhase("idle");
    setShouldLoad(eager);
  }, [eager, movie.id, movie.posterUrl]);

  useEffect(() => {
    if (eager || shouldLoad || !movie.posterUrl) return;
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "360px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, [eager, movie.posterUrl, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || !movie.posterUrl) return;
    let active = true;
    setPhase("loading");
    void (async () => {
      for (let attempt = 0; attempt < POSTER_RETRY_DELAYS_MS.length; attempt += 1) {
        const delay = POSTER_RETRY_DELAYS_MS[attempt];
        if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (!active) return;
        try {
          const nextSource = await resolvePoster(movie);
          if (!active) return;
          setSource(nextSource);
          setPhase("ready");
          return;
        } catch (_) {
          if (!active) return;
          if (attempt < POSTER_RETRY_DELAYS_MS.length - 1) continue;
          setSource("");
          setPhase("error");
        }
      }
    })();
    return () => { active = false; };
  }, [movie.id, movie.posterUrl, retryNonce, shouldLoad]);

  useEffect(() => {
    if (phase !== "error") return;
    // 未打包扩展重载时，UI 可能比新 Service Worker 早一个节拍到达。
    // 页面重新获得焦点后有限重试，避免把短暂的 unknown message 固化为永久空海报。
    const retry = () => setRetryNonce((value) => value + 1);
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [phase]);

  return (
    <div ref={hostRef} className={className} data-cinema-poster-state={phase} aria-busy={phase === "loading" || undefined}>
      {source && phase === "ready" ? (
        <img
          src={source}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => {
            resolvedPosterCache.delete(String(movie.posterUrl || ""));
            setSource("");
            setPhase("error");
          }}
          className={imageClassName}
        />
      ) : fallback}
      {phase === "error" && alt && (
        <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded-lg bg-black/64 px-2 py-1 text-center text-[8px] font-bold text-white/72 backdrop-blur">海报加载失败，刷新页面可重试</span>
      )}
    </div>
  );
}
