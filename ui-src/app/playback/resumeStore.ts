export type PlaybackResumeEntry = {
  movieId: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
};

export type ResumeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const RESUME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function playbackResumeKey(movieId: string) {
  return `txzz-playback-v2-resume:${movieId}`;
}

export function shouldPersistResume(currentTime: number, duration: number) {
  return currentTime >= 15 && (!duration || duration - currentTime >= 30);
}

export function savePlaybackResume(
  storage: ResumeStorage,
  movieId: string,
  currentTime: number,
  duration: number,
  now = Date.now()
) {
  if (!movieId || !shouldPersistResume(currentTime, duration)) {
    if (movieId) storage.removeItem(playbackResumeKey(movieId));
    return null;
  }
  const entry: PlaybackResumeEntry = { movieId, currentTime, duration, updatedAt: now };
  storage.setItem(playbackResumeKey(movieId), JSON.stringify(entry));
  return entry;
}

export function loadPlaybackResume(storage: ResumeStorage, movieId: string, now = Date.now()) {
  if (!movieId) return null;
  const key = playbackResumeKey(movieId);
  try {
    const entry = JSON.parse(storage.getItem(key) || "null") as PlaybackResumeEntry | null;
    if (!entry || entry.movieId !== movieId || now - Number(entry.updatedAt || 0) > RESUME_MAX_AGE_MS
      || !shouldPersistResume(Number(entry.currentTime || 0), Number(entry.duration || 0))) {
      storage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

