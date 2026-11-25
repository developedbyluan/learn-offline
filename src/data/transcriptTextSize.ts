import { useSyncExternalStore } from "react";
import { File, Paths } from "expo-file-system";

// Transcript text sizes, cycled by the player's "Aa" button. Medium (16) is Android's usual
// reading size; line heights are about 1.4x. The phone's font-size setting scales these too.
// The same setting sizes fullscreen video subtitles, a few steps bigger because the screen
// is watched from further away (see docs/video-fullscreen.md).
export const TEXT_SIZES = [
  { name: "Small", fontSize: 14, lineHeight: 20, subtitleFontSize: 16, subtitleLineHeight: 22 },
  { name: "Medium", fontSize: 16, lineHeight: 22, subtitleFontSize: 20, subtitleLineHeight: 27 },
  { name: "Large", fontSize: 18, lineHeight: 25, subtitleFontSize: 24, subtitleLineHeight: 32 },
  {
    name: "Extra large",
    fontSize: 20,
    lineHeight: 28,
    subtitleFontSize: 28,
    subtitleLineHeight: 37,
  },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

const DEFAULT_INDEX = 1;

// Saved on the phone, for every lesson and account.
const settingsFile = () => new File(Paths.document, "transcript-text-size.json");

let savedIndex: number | null = null;

function isValidIndex(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < TEXT_SIZES.length
  );
}

// Read once, on first use. A missing, broken or out-of-range value means Medium.
function loadIndex(): number {
  if (savedIndex !== null) return savedIndex;
  savedIndex = DEFAULT_INDEX;
  try {
    const file = settingsFile();
    if (file.exists) {
      const data: unknown = JSON.parse(file.textSync());
      const index = (data as { index?: unknown } | null)?.index;
      if (isValidIndex(index)) savedIndex = index;
    }
  } catch {
    // Use the default size.
  }
  return savedIndex;
}

function saveIndex(index: number) {
  savedIndex = index;
  try {
    const file = settingsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ index }));
  } catch (err) {
    console.warn("Could not save the transcript text size", err);
  }
}

// Every screen using the size updates together: the player stays mounted under fullscreen.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Moves to the next size (wrapping around), saves it, and returns it.
function cycleTextSize(): TextSize {
  const next = (loadIndex() + 1) % TEXT_SIZES.length;
  saveIndex(next);
  listeners.forEach((listener) => listener());
  return TEXT_SIZES[next];
}

// The current text size, and a function that moves to the next one.
export function useTranscriptTextSize(): [TextSize, () => TextSize] {
  const index = useSyncExternalStore(subscribe, loadIndex);
  return [TEXT_SIZES[index], cycleTextSize];
}
