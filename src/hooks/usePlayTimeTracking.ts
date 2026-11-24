import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { randomUUID } from "expo-crypto";
import { checkpointSession, finishSession, insertOpenSession } from "@/data/playTimeDb";

// While playing, save the running total at most this often, so a crash or force-quit
// loses at most about this much time.
const CHECKPOINT_MS = 10_000;

type Options = {
  mediaId: number;
  userId: string | null;
  playing: boolean;
  currentTime: number; // only used as a frequent "still playing" tick
};

// The phone's local calendar date, YYYY-MM-DD.
function localDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Records one listening session for as long as the player is open. Only time while media
// is actually playing counts, measured with the monotonic clock (performance.now()), so
// changing the phone's clock can't affect it. See docs/play-time-tracking.md.
export function usePlayTimeTracking({ mediaId, userId, playing, currentTime }: Options) {
  const sessionId = useRef<string | null>(null);
  const totalMs = useRef(0); // finished playing segments
  const segmentStart = useRef<number | null>(null); // monotonic start of the current segment
  const lastCheckpoint = useRef(0);
  // Read when the session starts; later changes don't move the session to another user.
  const startUserId = useRef(userId);

  // Total playing time so far, including the segment in progress.
  const playedSeconds = () => {
    const open = segmentStart.current === null ? 0 : performance.now() - segmentStart.current;
    return Math.floor((totalMs.current + open) / 1000);
  };

  const checkpoint = () => {
    if (!sessionId.current) return;
    lastCheckpoint.current = performance.now();
    checkpointSession(sessionId.current, playedSeconds(), new Date().toISOString());
  };

  // Start the session when the player opens; finish it when the player closes.
  useEffect(() => {
    const now = new Date();
    const id = randomUUID();
    sessionId.current = id;
    insertOpenSession({
      id,
      mediaId,
      seconds: 0,
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      startedDate: localDate(now),
      userId: startUserId.current,
      source: "mobile",
    });

    return () => {
      if (segmentStart.current !== null) {
        totalMs.current += performance.now() - segmentStart.current;
        segmentStart.current = null;
      }
      finishSession(id, Math.floor(totalMs.current / 1000), new Date().toISOString());
      sessionId.current = null;
    };
  }, [mediaId]);

  // Playing starts or stops, for any reason: count the segment, and checkpoint on stop.
  useEffect(() => {
    if (playing) {
      if (segmentStart.current === null) segmentStart.current = performance.now();
    } else if (segmentStart.current !== null) {
      totalMs.current += performance.now() - segmentStart.current;
      segmentStart.current = null;
      checkpoint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Progress updates keep arriving while playing, even in the background, so they drive
  // the periodic checkpoint without a separate timer.
  useEffect(() => {
    if (segmentStart.current === null) return;
    if (performance.now() - lastCheckpoint.current >= CHECKPOINT_MS) checkpoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  // Save when the app leaves the foreground, in case it's killed there.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") checkpoint();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
