import { File, Paths } from "expo-file-system";

// Where each lesson was left off, so the player can pick up from there next time.
// Stored outside media/, so removing a download keeps its position.

type SavedPosition = {
  seconds: number;
  duration: number;
  updatedAt: number; // ms since epoch
};

type Positions = Record<string, SavedPosition>;

// A position this close to the end counts as finished: the next open starts from 0.
export const RESUME_END_MARGIN_SECONDS = 5;
// Don't rewrite the file for changes smaller than this.
const MIN_CHANGE_SECONDS = 1;

const positionsFile = () => new File(Paths.document, "playback-positions.json");

let cache: Positions | null = null;

function isSavedPosition(value: unknown): value is SavedPosition {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.seconds === "number" && typeof v.duration === "number";
}

// Loaded once, on first use. A missing or broken file starts empty.
function positions(): Positions {
  if (cache) return cache;
  cache = {};
  try {
    const file = positionsFile();
    if (file.exists) {
      const data: unknown = JSON.parse(file.textSync());
      if (typeof data === "object" && data !== null) {
        for (const [key, value] of Object.entries(data)) {
          if (isSavedPosition(value)) cache[key] = value;
        }
      }
    }
  } catch (err) {
    console.warn("Could not read saved playback positions", err);
  }
  return cache;
}

// Where to start this lesson: the saved second, or 0 if there's none or it was finished.
export function getResumePosition(mediaId: number): number {
  const saved = positions()[String(mediaId)];
  if (!saved || saved.seconds <= 0) return 0;
  if (saved.duration > 0 && saved.seconds >= saved.duration - RESUME_END_MARGIN_SECONDS) return 0;
  return saved.seconds;
}

export function savePosition(mediaId: number, seconds: number, duration: number): void {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
  const all = positions();
  const key = String(mediaId);
  const previous = all[key];
  if (previous && Math.abs(previous.seconds - seconds) < MIN_CHANGE_SECONDS) return;

  all[key] = { seconds: Math.max(0, seconds), duration, updatedAt: Date.now() };
  try {
    const file = positionsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(all));
  } catch (err) {
    console.warn("Could not save the playback position", err);
  }
}
