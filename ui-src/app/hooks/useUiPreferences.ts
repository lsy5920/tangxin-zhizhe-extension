import { useEffect, useState } from "react";
import type { Page } from "../types";
import { isPage } from "../model/navigation";

const UI_PREFERENCES_KEY = "txzzUiPreferencesV1";
const LAUNCHER_SIZE = 64;

export type UiPreferences = {
  page?: Page;
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
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    chrome.storage.local.get(UI_PREFERENCES_KEY).then((stored) => {
      if (!alive) return;
      const preferences = (stored?.[UI_PREFERENCES_KEY] || {}) as UiPreferences;
      if (isPage(preferences.page)) setPage(preferences.page);
      if (preferences.ballPos) setBallPos(clampLauncherPosition(preferences.ballPos));
      setReady(true);
    }).catch(() => setReady(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void persistPreferences({ page, ballPos });
  }, [page, ready]);

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
    void persistPreferences({ page, ballPos: next });
    return next;
  };

  return {
    page,
    setPage,
    ballPos,
    setBallPos,
    saveBallPosition,
    preferencesReady: ready
  };
}
