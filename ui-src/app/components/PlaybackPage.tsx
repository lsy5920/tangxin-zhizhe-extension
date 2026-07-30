import { useCallback, useEffect, useMemo, useState } from "react";
import { Film, LoaderCircle, Ticket, WandSparkles } from "lucide-react";
import type { BridgeState, PlaybackBookmark } from "../types";
import { reconcileScreeningState } from "../playback/migration";
import type { PlaybackSession } from "../playback/types";
import { resolveEpisodePlayback } from "../cinema/episodePlayback";
import { buildCinemaPlaybackViewModel } from "../cinema/playbackViewModel";
import type { CinemaMovie } from "../cinema/types";
import { ScreeningStage, type PlaybackBookmarkCommand } from "./screening/ScreeningStage";
import { ScreeningSidebar } from "./screening/ScreeningSidebar";
import { ScreeningDrawer } from "./screening/ScreeningDrawer";

type Props = {
  state: BridgeState;
  routeMovieId: string;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onRouteMovieChange?: (movieId: string, movieTitle?: string) => void;
  onOpenDownloads: () => void;
};

export function PlaybackPage({ state, routeMovieId, onAction, onRouteMovieChange, onOpenDownloads }: Props) {
  const screening = useMemo(
    () => reconcileScreeningState(state.screening, state.fullDetails || []),
    [state.fullDetails, state.screening]
  );
  const view = useMemo(
    () => buildCinemaPlaybackViewModel(screening, routeMovieId),
    [routeMovieId, screening]
  );
  const selectedSession = view.session;
  const [playing, setPlaying] = useState(false);
  const [mediaStats, setMediaStats] = useState({ currentTime: 0, duration: 0 });
  const [bookmarkCommand, setBookmarkCommand] = useState<PlaybackBookmarkCommand | null>(null);
  const [autoNextEnabled, setAutoNextEnabled] = useState(true);
  const [pendingAutoPlayMovieId, setPendingAutoPlayMovieId] = useState("");
  const libraryEntry = selectedSession ? state.experience?.library?.[selectedSession.movieId] || null : null;
  const bookmarks = selectedSession ? state.experience?.bookmarks?.[selectedSession.movieId] || [] : [];
  const episodePlayback = useMemo(
    () => resolveEpisodePlayback(state.cinemaCollection, selectedSession?.movieId || ""),
    [selectedSession?.movieId, state.cinemaCollection]
  );

  useEffect(() => {
    setMediaStats({ currentTime: 0, duration: 0 });
    setBookmarkCommand(null);
    setPendingAutoPlayMovieId("");
  }, [selectedSession?.movieId]);

  const refresh = (session: PlaybackSession | null = selectedSession) => {
    const movieId = session?.movieId || routeMovieId || "";
    onAction("refresh-playback-session", {
      movieId,
      movieTitle: session?.title || view.requestedTitle || (movieId ? `影片 ${movieId}` : "")
    });
  };

  const updateCurrentLibrary = (patch: { favorite?: boolean; watchLater?: boolean }) => {
    if (!selectedSession) return;
    onAction("update-library-entry", {
      movieId: selectedSession.movieId,
      title: selectedSession.title,
      favorite: patch.favorite ?? libraryEntry?.favorite ?? false,
      watchLater: patch.watchLater ?? libraryEntry?.watchLater ?? false,
      tags: libraryEntry?.tags || [],
      note: libraryEntry?.note || ""
    });
  };

  const commandBookmark = (type: PlaybackBookmarkCommand["type"], bookmark: PlaybackBookmark) => {
    setBookmarkCommand({ nonce: Date.now() + Math.random(), type, bookmark });
  };

  const openEpisode = useCallback((episode: CinemaMovie) => {
    if (!episode.id || episode.id === selectedSession?.movieId) return;
    setPendingAutoPlayMovieId(episode.id);
    onRouteMovieChange?.(episode.id, episode.title);
    onAction("open-cinema-playback", { movieId: episode.id, movieTitle: episode.title });
  }, [onAction, onRouteMovieChange, selectedSession?.movieId]);

  const consumeAutoPlay = useCallback(() => {
    const currentMovieId = selectedSession?.movieId || "";
    setPendingAutoPlayMovieId((pending) => pending === currentMovieId ? "" : pending);
  }, [selectedSession?.movieId]);

  const planDownload = () => {
    if (!selectedSession) return;
    onAction("plan-full-video-download", {
      movieId: selectedSession.movieId,
      movieTitle: selectedSession.title,
      sourceId: selectedSession.decision.recommendedSourceId,
      lineKey: selectedSession.decision.recommendedSourceId || "auto"
    });
  };

  const waitingForRoute = view.resolving && !selectedSession;

  return (
    <div className="txzz-playback-root txzz-stream-playback-page">
      <div className="txzz-playback-workspace txzz-stream-playback-workspace">
        <main className="txzz-player-card txzz-stream-stage-card">
          {waitingForRoute ? (
            <div className="txzz-stream-stage-state">
              <div>
                <LoaderCircle className="animate-spin" size={34} />
                <h2>正在准备影片</h2>
                <p>{view.requestedTitle || `影片 ${routeMovieId}`}<br />完整线路送达前不会展示上一部影片。</p>
              </div>
            </div>
          ) : selectedSession ? (
            <ScreeningStage
              key={selectedSession.id}
              session={selectedSession}
              onAction={onAction}
              onPlayingChange={setPlaying}
              bookmarks={bookmarks}
              bookmarkCommand={bookmarkCommand}
              onMediaStatsChange={setMediaStats}
              episodes={episodePlayback.episodes}
              currentEpisodeIndex={episodePlayback.currentIndex}
              nextEpisode={episodePlayback.nextEpisode}
              autoNextEnabled={autoNextEnabled}
              autoPlayRequested={pendingAutoPlayMovieId === selectedSession.movieId}
              onSelectEpisode={openEpisode}
              onAutoNextEnabledChange={setAutoNextEnabled}
              onAutoPlayConsumed={consumeAutoPlay}
            />
          ) : (
            <div className="txzz-stream-stage-state is-empty">
              <div>
                <Ticket size={38} />
                <h2>当前影片还没有完整线路</h2>
                <p>已锁定影片 {routeMovieId || "未选择"}，重新准备只会刷新这一部影片。</p>
                <button type="button" onClick={() => refresh(null)}><WandSparkles size={14} />重新检票</button>
              </div>
            </div>
          )}
        </main>

        <div className="txzz-playback-hidden-during-fullscreen txzz-stream-session-column">
          <ScreeningSidebar
            session={selectedSession}
            request={screening.request}
            onRefresh={() => refresh()}
            libraryEntry={libraryEntry}
            onToggleFavorite={() => updateCurrentLibrary({ favorite: !libraryEntry?.favorite })}
            onToggleWatchLater={() => updateCurrentLibrary({ watchLater: !libraryEntry?.watchLater })}
            onPlanDownload={planDownload}
            onOpenDownloads={onOpenDownloads}
            playing={playing}
          />
        </div>
      </div>

      <div className="txzz-playback-hidden-during-fullscreen txzz-stream-screening-tools">
        <ScreeningDrawer
          state={state}
          session={selectedSession}
          currentDuration={mediaStats.duration}
          onSeekBookmark={(bookmark) => commandBookmark("seek", bookmark)}
          onLoopBookmark={(bookmark) => commandBookmark("loop", bookmark)}
          onAction={onAction}
        />
      </div>

      <footer className="txzz-playback-hidden-during-fullscreen txzz-stream-playback-footer">
        <Film size={11} /> Shaka Player · HLS 自适应 · 单次自动切线 · 30 天续播
      </footer>
    </div>
  );
}
