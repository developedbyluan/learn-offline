import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "@/data/media";
import { activeLineIndex } from "@/components/Transcript";

// A part of the lesson that plays on repeat, in seconds. See docs/play-range.md.
export type PlayRange = { start: number; end: number };

// The shortest range allowed, so Start and End never meet.
const MIN_LENGTH_SECONDS = 0.5;
// Without subtitles, a new range covers this much from the current time.
const NO_LINES_LENGTH_SECONDS = 10;
// Jump back this close to End, to make up a little for the 250 ms time updates.
const LOOP_EARLY_SECONDS = 0.05;
// A bigger step between two time updates is a seek, not playback crossing End.
const MAX_TICK_SECONDS = 1.5;

const round1 = (seconds: number) => Math.round(seconds * 10) / 10;

// When a line ends. A line with broken timing (end not after start) ends where the next
// line starts, or at the end of the lesson.
export function lineEnd(lines: TranscriptLine[], index: number, duration: number) {
  const line = lines[index];
  if (line.end > line.start) return line.end;
  const next = lines[index + 1];
  if (next && next.start > line.start) return next.start;
  return Math.max(duration, line.start + MIN_LENGTH_SECONDS);
}

export function rangeForLine(lines: TranscriptLine[], index: number, duration: number): PlayRange {
  return { start: lines[index].start, end: lineEnd(lines, index, duration) };
}

// From now to 10 s later, or the last 10 s when there's almost nothing left.
export function rangeWithoutLines(currentTime: number, duration: number): PlayRange {
  const start = round1(currentTime);
  if (duration - start >= MIN_LENGTH_SECONDS) {
    return { start, end: Math.min(start + NO_LINES_LENGTH_SECONDS, duration) };
  }
  return { start: Math.max(0, duration - NO_LINES_LENGTH_SECONDS), end: duration };
}

// The range for the highlighted line (line 0 before the first line starts), or null when
// there are no lines.
export function initialRange(
  lines: TranscriptLine[] | null,
  currentTime: number,
  duration: number,
): PlayRange | null {
  if (!lines || lines.length === 0) return null;
  return rangeForLine(lines, Math.max(0, activeLineIndex(lines, currentTime)), duration);
}

// Grows the range to include a line.
export function extendRange(
  range: PlayRange,
  lines: TranscriptLine[],
  index: number,
  duration: number,
): PlayRange {
  const line = rangeForLine(lines, index, duration);
  return { start: Math.min(range.start, line.start), end: Math.max(range.end, line.end) };
}

type Change = { range: PlayRange; notice: string | null };

// Start moves to `time`. If that's at or after End, End moves to the end of the lesson.
export function withStart(range: PlayRange, time: number, duration: number): Change {
  const start = round1(time);
  if (start <= range.end - MIN_LENGTH_SECONDS) return { range: { start, end: range.end }, notice: null };
  return {
    range: { start, end: Math.max(duration, start + MIN_LENGTH_SECONDS) },
    notice: "End moved to the end of the lesson.",
  };
}

// End moves to `time`. If that's at or before Start, Start moves to the beginning.
export function withEnd(range: PlayRange, time: number): Change {
  const end = round1(time);
  if (end >= range.start + MIN_LENGTH_SECONDS) return { range: { start: range.start, end }, notice: null };
  return {
    range: { start: 0, end: Math.max(end, MIN_LENGTH_SECONDS) },
    notice: "Start moved to the beginning.",
  };
}

type Options = {
  currentTime: number;
  playing: boolean;
  onSeek: (seconds: number) => Promise<void> | void;
};

// The repeat range and its loop: when playback runs across End from inside the range, it
// jumps back to Start. A seek past End doesn't loop, so the user can look for a new End.
export function usePlayRange({ currentTime, playing, onSeek }: Options) {
  const [range, setRange] = useState<PlayRange | null>(null);
  const prevTime = useRef(currentTime);
  // Set while the jump back to Start is landing, so it never seeks twice.
  const jumping = useRef(false);

  useEffect(() => {
    const previous = prevTime.current;
    prevTime.current = currentTime;
    if (!range) {
      jumping.current = false;
      return;
    }
    if (jumping.current) {
      if (currentTime < range.end) jumping.current = false;
      return;
    }
    if (!playing) return;
    const crossedEnd =
      previous < range.end &&
      currentTime >= range.end - LOOP_EARLY_SECONDS &&
      currentTime - previous < MAX_TICK_SECONDS;
    if (crossedEnd) {
      jumping.current = true;
      void onSeek(range.start);
    }
  }, [currentTime, playing, range, onSeek]);

  const clear = useCallback(() => setRange(null), []);

  return { range, setRange, clear };
}
