import { File, Paths } from "expo-file-system";
import type { MediaItem } from "@/data/media";

// One file per user, so a different account on the same phone never sees another user's list.
function cacheFile(userId: string) {
  return new File(Paths.document, `favorites-${encodeURIComponent(userId)}.json`);
}

export async function loadCachedFavorites(userId: string): Promise<MediaItem[] | null> {
  try {
    const file = cacheFile(userId);
    if (!file.exists) return null;
    const data: unknown = JSON.parse(await file.text());
    return Array.isArray(data) ? (data as MediaItem[]) : null;
  } catch {
    return null;
  }
}

export function saveCachedFavorites(userId: string, items: MediaItem[]): void {
  try {
    const file = cacheFile(userId);
    if (!file.exists) file.create();
    file.write(JSON.stringify(items));
  } catch (err) {
    console.warn("Could not save favorites for offline use", err);
  }
}
