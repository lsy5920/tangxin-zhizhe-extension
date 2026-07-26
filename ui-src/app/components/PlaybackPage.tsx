import { useEffect, useMemo, useState } from "react";
import { Film, RefreshCw, Sparkles, Ticket, WandSparkles } from "lucide-react";
import type { BridgeState, Page } from "../types";
import { reconcileScreeningState } from "../playback/migration";
import type { PlaybackSession } from "../playback/types";
import { ScreeningStage } from "./screening/ScreeningStage";
import { ScreeningSidebar } from "./screening/ScreeningSidebar";
import { ScreeningDrawer } from "./screening/ScreeningDrawer";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage?: (page: Page) => void;
};

export function PlaybackPage({ state, onAction }: Props) {
  const screening = useMemo(
    () => reconcileScreeningState(state.screening, state.fullDetails || []),
    [state.fullDetails, state.screening]
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [playing, setPlaying] = useState(false);
  const activeSession = screening.activeSession;
  const selectedSession = screening.history.find((item) => item.id === selectedSessionId) || activeSession;

  useEffect(() => {
    if (!activeSession?.id) return;
    setSelectedSessionId((current) => current && screening.history.some((item) => item.id === current) ? current : activeSession.id);
  }, [activeSession?.id, screening.history]);

  const refresh = (session: PlaybackSession | null = selectedSession) => {
    onAction("refresh-playback-session", { movieId: session?.movieId || "", movieTitle: session?.title || "" });
  };

  return (
    <div className="txzz-playback-root txzz-page relative mx-auto w-full max-w-[1180px] overflow-hidden p-3 pb-6 sm:p-5 lg:p-6">
      <div className={`txzz-playback-hidden-during-fullscreen pointer-events-none absolute inset-x-3 top-2 h-44 overflow-hidden rounded-[2rem] transition-opacity duration-300 ${playing ? "opacity-0" : "opacity-100"}`} aria-hidden="true">
        <span className="absolute left-[8%] top-8 h-2 w-2 rounded-full bg-fuchsia-300/70 shadow-[0_0_18px_6px_rgba(240,171,252,.35)]" />
        <span className="absolute right-[12%] top-16 h-1.5 w-1.5 rounded-full bg-violet-300/80 shadow-[0_0_16px_5px_rgba(196,181,253,.38)]" />
        <span className="absolute left-[45%] top-3 text-lg text-amber-300/75">✦</span>
      </div>

      <header className="txzz-playback-hidden-during-fullscreen relative mb-4 overflow-hidden rounded-[1.65rem] border border-white/80 bg-gradient-to-r from-white/88 via-[#fff6fb]/88 to-[#f3efff]/88 px-4 py-4 shadow-[0_18px_55px_rgba(113,70,160,.10)] backdrop-blur-xl sm:px-5">
        <span className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-fuchsia-200/35 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-black tracking-[.18em] text-fuchsia-500"><Sparkles size={12} /> CANDY CINEMA 5.0</p>
            <h1 className="mt-1 flex items-center gap-2 text-[19px] font-black tracking-[-.03em] text-slate-900 sm:text-[22px]"><Ticket size={20} className="text-violet-500" />沉浸糖果影院</h1>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">检票、轮换、解锁和选线都由同一会话编排；资源就绪后仍需你亲自点击开映。</p>
          </div>
          <button type="button" onClick={() => refresh()} disabled={screening.request.phase === "resolving"} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 px-3.5 text-[11px] font-extrabold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55">
            <RefreshCw size={14} className={screening.request.phase === "resolving" ? "animate-spin" : ""} />{screening.request.phase === "resolving" ? "检票中" : "重新检票"}
          </button>
        </div>
      </header>

      <div className="txzz-playback-workspace relative grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.72fr)]">
        <main className="txzz-player-card min-w-0 overflow-hidden rounded-[1.7rem] border border-white/70 bg-white/72 p-2.5 shadow-[0_24px_70px_rgba(75,45,108,.16)] backdrop-blur-xl sm:p-3">
          {selectedSession ? (
            <ScreeningStage key={selectedSession.id} session={selectedSession} onAction={onAction} onPlayingChange={setPlaying} />
          ) : (
            <div className="relative flex min-h-[19rem] aspect-video items-center justify-center overflow-hidden rounded-[1.35rem] bg-[radial-gradient(circle_at_50%_20%,#35294c_0%,#17131f_48%,#09080d_100%)] p-6 text-center text-white">
              <span className="absolute left-[12%] top-[18%] text-amber-200/70">✦</span><span className="absolute right-[16%] top-[28%] text-fuchsia-200/70">✦</span>
              <div className="relative max-w-sm">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/12 bg-white/8 text-5xl shadow-2xl backdrop-blur">🍭</div>
                <h2 className="mt-5 text-[17px] font-black">糖糖检票员还没收到电影票</h2>
                <p className="mt-2 text-[11px] leading-5 text-white/55">请先打开网站中的影片详情页。识别到影片后，这里会自动准备线路，但不会擅自播放。</p>
                <button type="button" onClick={() => refresh(null)} className="mt-4 min-h-11 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 text-[11px] font-extrabold text-white shadow-lg shadow-fuchsia-500/20"><WandSparkles size={14} className="mr-1.5 inline" />让糖糖检查当前页面</button>
              </div>
            </div>
          )}
        </main>

        <div className="txzz-playback-hidden-during-fullscreen">
          <ScreeningSidebar session={selectedSession || null} request={screening.request} onRefresh={() => refresh()} />
        </div>
      </div>

      <div className="txzz-playback-hidden-during-fullscreen mt-4">
        <ScreeningDrawer
          state={state}
          session={selectedSession || null}
          history={screening.history}
          onSelectHistory={(session) => setSelectedSessionId(session.id)}
          onAction={onAction}
        />
      </div>

      <footer className="txzz-playback-hidden-during-fullscreen mt-3 flex items-center justify-center gap-2 text-[9px] font-semibold text-violet-400/75">
        <Film size={11} /> ArtPlayer + hls.js · 单内核 · 单次自动切线 · 30 天续播
      </footer>
    </div>
  );
}
