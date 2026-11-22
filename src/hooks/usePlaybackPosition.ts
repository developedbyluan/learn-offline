import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getResumePosition, savePosition } from "@/data/playbackPositions";

// Save at least this often while playing.
const SAVE_EVERY_SECONDS = 5;
// How close the player must get to the restored second before saving starts.
const RESTORE_TOLERANCE_SECONDS = 1.5;

type Options = {
  mediaId: number;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  playing: boolean;
  onSeek: (seconds: number) => Promise<void> | void;
};

// Opens the lesson where it was left off (paused), and remembers the position:
// every few seconds while playing, on pause, when the app goes to the background,
// and when the player closes.
export function usePlaybackPosition({
  mediaId,
  currentTime,
  duration,
  isLoaded,
  playing,
  onSeek,
}: Options) {
  const latest = useRef({ currentTime, duration });
  const restored = useRef(false);
  // Until the jump to the saved second has landed, the player still reports 0,
  // which must not overwrite the saved position.
  const restoreTarget = useRef<number | null>(null);
  const lastSaved = useRef(0);

  useEffect(() => {
    latest.current = { currentTime, duration };
    const target = restoreTarget.current;
    if (target !== null && (playing || Math.abs(currentTime - target) <= RESTORE_TOLERANCE_SECONDS)) {
      restoreTarget.current = null;
    }
  });

  const save = useCallback(() => {
    if (!restored.current || restoreTarget.current !== null) return;
    const { currentTime: seconds, duration: total } = latest.current;
    if (total <= 0) return;
    savePosition(mediaId, seconds, total);
    lastSaved.current = seconds;
  }, [mediaId]);

  // Restore once, as soon as the file is loaded and its length is known.
  useEffect(() => {
    if (restored.current || !isLoaded || duration <= 0) return;
    restored.current = true;
    const seconds = getResumePosition(mediaId);
    lastSaved.current = seconds;
    if (seconds > 0) {
      restoreTarget.current = seconds;
      void onSeek(seconds);
    }
  }, [isLoaded, duration, mediaId, onSeek]);

  // Every few seconds of playback.
  useEffect(() => {
    if (playing && Math.abs(currentTime - lastSaved.current) >= SAVE_EVERY_SECONDS) save();
  }, [playing, currentTime, save]);

  // On pause, including reaching the end or pausing from the notification.
  useEffect(() => {
    if (!playing) save();
  }, [playing, save]);

  // When the app leaves the screen. Background playback goes on; this is in case
  // the app is then closed.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") save();
    });
    return () => subscription.remove();
  }, [save]);

  // When the player closes.
  useEffect(() => () => save(), [save]);
}
