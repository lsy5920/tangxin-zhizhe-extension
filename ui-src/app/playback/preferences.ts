export type PlayerFillMode = "contain" | "cover" | "fill";
export type PlayerFitMode = "auto" | "wide" | "vertical";
export type PlayerOrientationMode = "auto" | "landscape" | "portrait";
export type PlaybackNetworkMode = "data-saver" | "balanced" | "high-quality";

export type PlaybackPreferences = {
  volume: number;
  muted: boolean;
  rate: number;
  brightness: number;
  fillMode: PlayerFillMode;
  fitMode: PlayerFitMode;
  orientationMode: PlayerOrientationMode;
  seekStep: number;
  networkMode: PlaybackNetworkMode;
};

const KEY = "txzz-playback-v2-preferences";

export const defaultPlaybackPreferences: PlaybackPreferences = {
  volume: 0.8,
  muted: false,
  rate: 1,
  brightness: 100,
  fillMode: "contain",
  fitMode: "auto",
  orientationMode: "auto",
  seekStep: 10,
  networkMode: "balanced"
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizePlaybackPreferences(value: Partial<PlaybackPreferences> = {}): PlaybackPreferences {
  return {
    volume: clamp(Number(value.volume ?? 0.8), 0, 1),
    muted: Boolean(value.muted),
    rate: [0.75, 1, 1.25, 1.5, 2].includes(Number(value.rate)) ? Number(value.rate) : 1,
    brightness: clamp(Number(value.brightness ?? 100), 60, 140),
    fillMode: value.fillMode === "cover" || value.fillMode === "fill" ? value.fillMode : "contain",
    fitMode: value.fitMode === "wide" || value.fitMode === "vertical" ? value.fitMode : "auto",
    orientationMode: value.orientationMode === "landscape" || value.orientationMode === "portrait" ? value.orientationMode : "auto",
    seekStep: [5, 10, 30, 60].includes(Number(value.seekStep)) ? Number(value.seekStep) : 10,
    networkMode: value.networkMode === "data-saver" || value.networkMode === "high-quality"
      ? value.networkMode
      : "balanced"
  };
}

export function loadPlaybackPreferences(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    return normalizePlaybackPreferences(JSON.parse(storage.getItem(KEY) || "{}"));
  } catch {
    return defaultPlaybackPreferences;
  }
}

export function savePlaybackPreferences(
  value: PlaybackPreferences,
  storage: Pick<Storage, "setItem"> = window.localStorage
) {
  const normalized = normalizePlaybackPreferences(value);
  storage.setItem(KEY, JSON.stringify(normalized));
  return normalized;
}
