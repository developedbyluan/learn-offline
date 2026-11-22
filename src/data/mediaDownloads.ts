import { useSyncExternalStore } from "react";
import { Directory, File, Paths, type DownloadOptions } from "expo-file-system";

// Downloaded media lives in <documents>/media, one file per mediaId, shared by all accounts:
//   media-<mediaId><ext>     the media file
//   media-<mediaId>-thumb    its thumbnail (no extension; image decoders read the format from the bytes)
// State is kept at module level so a download keeps running when its card or screen unmounts,
// and cards that show the same mediaId stay in sync.

export type DownloadState =
  | { status: "none" }
  | { status: "downloading"; progress: number | null } // 0–100; null when the size is unknown
  | { status: "downloaded"; hasThumbnail: boolean };

const NONE: DownloadState = { status: "none" };

const states = new Map<number, DownloadState>();
const controllers = new Map<number, AbortController>();
const thumbnailsInFlight = new Set<number>();
const listeners = new Set<() => void>();

function mediaDirectory() {
  return new Directory(Paths.document, "media");
}

// Extension from the end of the URL path, e.g. ".mp3". Empty if there isn't one.
function extensionOf(fileUrl: string) {
  const path = fileUrl.split(/[?#]/)[0];
  const match = /\.([a-z0-9]{1,5})$/i.exec(path);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function mediaFile(mediaId: number, fileUrl: string) {
  return new File(mediaDirectory(), `media-${mediaId}${extensionOf(fileUrl)}`);
}

function thumbnailFile(mediaId: number) {
  return new File(mediaDirectory(), `media-${mediaId}-thumb`);
}

function fileExists(file: File) {
  try {
    return file.exists;
  } catch {
    // Treat an unreadable file as missing.
    return false;
  }
}

function deleteIfExists(file: File) {
  if (fileExists(file)) file.delete();
}

function setState(mediaId: number, state: DownloadState) {
  states.set(mediaId, state);
  listeners.forEach((listener) => listener());
}

// Downloads to a temporary file in the cache, then moves it into place, so a half-finished
// download never appears at the destination. Cleans up the temporary file if anything fails.
async function downloadTo(
  url: string,
  tempName: string,
  destination: File,
  options?: Pick<DownloadOptions, "signal" | "onProgress">,
) {
  const temp = new File(Paths.cache, tempName);
  try {
    await File.downloadFileAsync(url, temp, { ...options, idempotent: true });
    if (options?.signal?.aborted) throw new Error("Download cancelled");
    mediaDirectory().create({ idempotent: true });
    deleteIfExists(destination);
    await temp.move(destination);
  } catch (err) {
    try {
      deleteIfExists(temp);
    } catch {
      // A leftover temp file is overwritten by the next attempt.
    }
    throw err;
  }
}

export function subscribeDownloads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Returns the same object until the state changes, as useSyncExternalStore requires.
export function getDownloadState(mediaId: number, fileUrl: string): DownloadState {
  let state = states.get(mediaId);
  if (!state) {
    state = fileExists(mediaFile(mediaId, fileUrl))
      ? { status: "downloaded", hasThumbnail: fileExists(thumbnailFile(mediaId)) }
      : NONE;
    states.set(mediaId, state);
  }
  return state;
}

// Resolves when the media file is saved or the download was cancelled. Rejects if it failed.
// The thumbnail is saved afterwards in the background; if that fails, the media still counts
// as downloaded and ensureThumbnail tries again later.
export async function startDownload(
  mediaId: number,
  fileUrl: string,
  thumbnailUrl?: string,
): Promise<void> {
  if (getDownloadState(mediaId, fileUrl).status !== "none") return;

  const controller = new AbortController();
  controllers.set(mediaId, controller);
  setState(mediaId, { status: "downloading", progress: null });
  let lastProgress: number | null = null;

  try {
    await downloadTo(fileUrl, `media-${mediaId}.part`, mediaFile(mediaId, fileUrl), {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (controller.signal.aborted || totalBytes <= 0) return;
        const progress = Math.min(100, Math.floor((bytesWritten / totalBytes) * 100));
        // Only re-render when the whole percentage changes.
        if (progress === lastProgress) return;
        lastProgress = progress;
        setState(mediaId, { status: "downloading", progress });
      },
    });
  } catch (err) {
    setState(mediaId, NONE);
    if (!controller.signal.aborted) throw err;
    return;
  } finally {
    controllers.delete(mediaId);
  }

  setState(mediaId, { status: "downloaded", hasThumbnail: fileExists(thumbnailFile(mediaId)) });
  if (thumbnailUrl) void ensureThumbnail(mediaId, thumbnailUrl);
}

// Saves the thumbnail of a downloaded item that doesn't have one yet: items downloaded before
// thumbnails were saved, or whose thumbnail failed. Never rejects; failures are retried the next
// time it's called.
export async function ensureThumbnail(mediaId: number, thumbnailUrl: string): Promise<void> {
  const state = states.get(mediaId);
  if (state?.status !== "downloaded" || state.hasThumbnail) return;
  if (thumbnailsInFlight.has(mediaId)) return;

  thumbnailsInFlight.add(mediaId);
  try {
    await downloadTo(thumbnailUrl, `media-${mediaId}-thumb.part`, thumbnailFile(mediaId));
    if (states.get(mediaId)?.status === "downloaded") {
      setState(mediaId, { status: "downloaded", hasThumbnail: true });
    } else {
      // The download was removed while the thumbnail was saving.
      deleteIfExists(thumbnailFile(mediaId));
    }
  } catch {
    // Offline or the thumbnail URL failed. The remote or cached image is shown instead.
  } finally {
    thumbnailsInFlight.delete(mediaId);
  }
}

export function cancelDownload(mediaId: number) {
  controllers.get(mediaId)?.abort();
}

export function deleteDownload(mediaId: number, fileUrl: string) {
  deleteIfExists(mediaFile(mediaId, fileUrl));
  deleteIfExists(thumbnailFile(mediaId));
  setState(mediaId, NONE);
}

// The local file:// URI of a downloaded media file, or null if it isn't on the phone.
// Always work the path out with this function instead of saving it: on iOS the app's
// documents folder path can change after an app update.
export function getLocalMediaUri(mediaId: number, fileUrl: string): string | null {
  let file: File;
  try {
    file = mediaFile(mediaId, fileUrl);
  } catch {
    return null;
  }
  if (!fileExists(file)) {
    // The file was removed outside the app. Correct the cached state so the card updates.
    if (states.get(mediaId)?.status === "downloaded") setState(mediaId, NONE);
    return null;
  }
  return file.uri;
}

// What a player should load: the local file when it's downloaded, otherwise the online URL.
export function getPlaybackUri(mediaId: number, fileUrl: string): string {
  return getLocalMediaUri(mediaId, fileUrl) ?? fileUrl;
}

// The local file:// URI of a downloaded item's thumbnail, or null if there isn't one.
// Uses the cached download state, so it's cheap to call while rendering.
export function getLocalThumbnailUri(mediaId: number): string | null {
  const state = states.get(mediaId);
  return state?.status === "downloaded" && state.hasThumbnail ? thumbnailFile(mediaId).uri : null;
}

// Like getLocalMediaUri, but re-renders when the download finishes or is removed.
// Uses the cached download state, so it doesn't check the disk on every render.
export function useLocalMediaUri(mediaId: number, fileUrl: string): string | null {
  const state = useMediaDownload(mediaId, fileUrl);
  return state.status === "downloaded" ? mediaFile(mediaId, fileUrl).uri : null;
}

export function useMediaDownload(mediaId: number, fileUrl: string): DownloadState;
export function useMediaDownload(
  mediaId: number | undefined,
  fileUrl: string | undefined,
): DownloadState | null;
// Returns null when there's nothing to download (no mediaId or fileUrl).
export function useMediaDownload(
  mediaId: number | undefined,
  fileUrl: string | undefined,
): DownloadState | null {
  return useSyncExternalStore(subscribeDownloads, () =>
    mediaId === undefined || !fileUrl ? null : getDownloadState(mediaId, fileUrl),
  );
}
