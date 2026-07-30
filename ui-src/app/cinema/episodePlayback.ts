import type { CinemaCollectionState, CinemaMovie } from "./types";

export type EpisodePlaybackModel = {
  episodes: CinemaMovie[];
  currentIndex: number;
  nextEpisode: CinemaMovie | null;
};

export function resolveEpisodePlayback(
  collection: CinemaCollectionState | null | undefined,
  currentMovieId: string
): EpisodePlaybackModel {
  const seen = new Set<string>();
  const episodes = (collection?.items || []).filter((episode) => {
    const id = String(episode?.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const currentIndex = episodes.findIndex((episode) => episode.id === currentMovieId);
  if (currentIndex < 0) return { episodes: [], currentIndex: -1, nextEpisode: null };
  return {
    episodes,
    currentIndex,
    nextEpisode: episodes[currentIndex + 1] || null
  };
}

/**
 * 金币分集可能产生新扣费，即使开启自动续播也必须由用户再次确认。
 * 免费与 VIP 分集才能在自然播完后进入倒计时。
 */
export function canAutoAdvanceEpisode(episode: CinemaMovie | null | undefined) {
  return Boolean(episode && !(episode.access === "coin" && episode.price > 0));
}
