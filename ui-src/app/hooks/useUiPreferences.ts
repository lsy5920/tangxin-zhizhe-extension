import { useEffect, useState } from "react";
import type { Page } from "../types";
import { isPage } from "../model/navigation";
import { isCinemaPrimaryRoute, type CinemaPrimaryRoute } from "../cinema/appModel";

const UI_PREFERENCES_KEY = "txzzUiPreferencesV1";
const LAUNCHER_SIZE = 64;

export type UiPreferences = {
  page?: Page;
  cinemaRoute?: CinemaPrimaryRoute;
  ballPos?: { x: number; y: number };
};

/** 把伙伴入口限制在可视区域内，地址栏收缩或横竖屏切换后也不会丢失。 */
export function clampLauncherPosition(position: { x: number; y: number }) {
  const margin = 12;
  const baseLeft = window.innerWidth - 20 - LAUNCHER_SIZE;
  const baseTop = window.innerHeight - 80 - LAUNCHER_SIZE;
  return {
    x: Math.round(Math.min(window.innerWidth - margin - LAUNCHER_SIZE - baseLeft, Math.max(margin - baseLeft, position.x))),
    y: Math.round(Math.min(window.innerHeight - margin - LAUNCHER_SIZE - baseTop, Math.max(margin - baseTop, position.y)))
  };
}

function persistPreferences(preferences: UiPreferences) {
  return chrome.storage.local.set({ [UI_PREFERENCES_KEY]: preferences }).catch(() => undefined);
}

export function useUiPreferences() {
  const [page, setPage] = useState<Page>("overview");
  const [cinemaRoute, setCinemaRoute] = useState<CinemaPrimaryRoute>("home");
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    chrome.storage.local.get(UI_PREFERENCES_KEY).then((stored) => {
      if (!alive) return;
      const preferences = (stored?.[UI_PREFERENCES_KEY] || {}) as UiPreferences;
      // 旧版本可能持久化了已经迁入影院的 playback/downloads 页面。isPage 会把
      // 它们拒绝掉；cinema 仍是启动动作，因此普通面板打开时回落到总览。
      if (isPage(preferences.page)) setPage(preferences.page === "cinema" ? "overview" : preferences.page);
      if (isCinemaPrimaryRoute(preferences.cinemaRoute)) setCinemaRoute(preferences.cinemaRoute);
      if (preferences.ballPos) setBallPos(clampLauncherPosition(preferences.ballPos));
      setReady(true);
    }).catch(() => setReady(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void persistPreferences({ page, cinemaRoute, ballPos });
  }, [cinemaRoute, page, ready]);

  useEffect(() => {
    const onResize = () => setBallPos((current) => clampLauncherPosition(current));
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  const saveBallPosition = (position: { x: number; y: number }) => {
    const next = clampLauncherPosition(position);
    setBallPos(next);
    void persistPreferences({ page, cinemaRoute, ballPos: next });
    return next;
  };

  return {
    page,
    setPage,
    cinemaRoute,
    setCinemaRoute,
    ballPos,
    setBallPos,
    saveBallPosition,
    preferencesReady: ready
  };
}
