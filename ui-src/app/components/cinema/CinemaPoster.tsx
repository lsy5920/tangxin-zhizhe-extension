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
    void resolvePoster(movie).then((nextSource) => {
      if (!active) return;
      setSource(nextSource);
      setPhase("ready");
    }).catch(() => {
      if (!active) return;
      setSource("");
      setPhase("error");
    });
    return () => { active = false; };
  }, [movie.id, movie.posterUrl, shouldLoad]);

  return (
    <div ref={hostRef} className={className} data-cinema-poster-state={phase} aria-busy={phase === "loading" || undefined}>
      {source && phase === "ready" ? (
        <img
          src={source}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => { setSource(""); setPhase("error"); }}
          className={imageClassName}
        />
      ) : fallback}
    </div>
  );
}
