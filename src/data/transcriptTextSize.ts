import { useCallback, useState } from "react";
import { File, Paths } from "expo-file-system";

// Transcript text sizes, cycled by the player's "Aa" button. Medium (16) is Android's usual
// reading size; line heights are about 1.4x. The phone's font-size setting scales these too.
export const TEXT_SIZES = [
  { name: "Small", fontSize: 14, lineHeight: 20 },
  { name: "Medium", fontSize: 16, lineHeight: 22 },
  { name: "Large", fontSize: 18, lineHeight: 25 },
  { name: "Extra large", fontSize: 20, lineHeight: 28 },
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

// The current transcript size, and a function that moves to the next one (wrapping around).
export function useTranscriptTextSize(): [TextSize, () => void] {
  const [index, setIndex] = useState(loadIndex);

  const cycle = useCallback(() => {
    setIndex((current) => {
      const next = (current + 1) % TEXT_SIZES.length;
      saveIndex(next);
      return next;
    });
  }, []);

  return [TEXT_SIZES[index], cycle];
}
