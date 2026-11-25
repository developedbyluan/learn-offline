import { useCallback, useState } from "react";
import { File, Paths } from "expo-file-system";

// Whether fullscreen video shows subtitles, toggled by its CC button. On by default.
// Saved on the phone, for every lesson and account. See docs/video-fullscreen.md.
const settingsFile = () => new File(Paths.document, "fullscreen-subtitles.json");

let savedShown: boolean | null = null;

// Read once, on first use. A missing or broken file means shown.
function loadShown(): boolean {
  if (savedShown !== null) return savedShown;
  savedShown = true;
  try {
    const file = settingsFile();
    if (file.exists) {
      const data: unknown = JSON.parse(file.textSync());
      const shown = (data as { shown?: unknown } | null)?.shown;
      if (typeof shown === "boolean") savedShown = shown;
    }
  } catch {
    // Show them.
  }
  return savedShown;
}

function saveShown(shown: boolean) {
  savedShown = shown;
  try {
    const file = settingsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ shown }));
  } catch (err) {
    console.warn("Could not save the subtitles setting", err);
  }
}

// Whether subtitles are shown, and a function that flips and saves it.
export function useFullscreenSubtitles(): [boolean, () => boolean] {
  const [shown, setShown] = useState(loadShown);

  const toggle = useCallback(() => {
    const next = !loadShown();
    saveShown(next);
    setShown(next);
    return next;
  }, []);

  return [shown, toggle];
}
