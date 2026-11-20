import { useSyncExternalStore } from "react";
import { Directory, File, Paths } from "expo-file-system";

// Downloaded media lives in <documents>/media, one file per mediaId, shared by all accounts.
// State is kept at module level so a download keeps running when its card or screen unmounts,
// and cards that show the same mediaId stay in sync.

export type DownloadState =
  | { status: "none" }
  | { status: "downloading"; progress: number | null } // 0–100; null when the size is unknown
  | { status: "downloaded" };

const NONE: DownloadState = { status: "none" };
const DOWNLOADED: DownloadState = { status: "downloaded" };

const states = new Map<number, DownloadState>();
const controllers = new Map<number, AbortController>();
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

function setState(mediaId: number, state: DownloadState) {
  states.set(mediaId, state);
  listeners.forEach((listener) => listener());
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
    let exists = false;
    try {
      exists = mediaFile(mediaId, fileUrl).exists;
    } catch {
      // Treat an unreadable file as not downloaded.
    }
    state = exists ? DOWNLOADED : NONE;
    states.set(mediaId, state);
  }
  return state;
}

// Resolves when the file is saved or the download was cancelled. Rejects if it failed.
export async function startDownload(mediaId: number, fileUrl: string): Promise<void> {
  if (getDownloadState(mediaId, fileUrl).status !== "none") return;

  const controller = new AbortController();
  controllers.set(mediaId, controller);
  setState(mediaId, { status: "downloading", progress: null });

  // Download to a temporary file first, so a half-finished download never looks finished.
  const temp = new File(Paths.cache, `media-${mediaId}.part`);
  let lastProgress: number | null = null;

  try {
    await File.downloadFileAsync(fileUrl, temp, {
      idempotent: true,
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
    if (controller.signal.aborted) throw new Error("Download cancelled");

    mediaDirectory().create({ idempotent: true });
    const destination = mediaFile(mediaId, fileUrl);
    if (destination.exists) destination.delete();
    await temp.move(destination);
    setState(mediaId, DOWNLOADED);
  } catch (err) {
    try {
      if (temp.exists) temp.delete();
    } catch {
      // A leftover temp file is overwritten by the next attempt.
    }
    setState(mediaId, NONE);
    if (!controller.signal.aborted) throw err;
  } finally {
    controllers.delete(mediaId);
  }
}

export function cancelDownload(mediaId: number) {
  controllers.get(mediaId)?.abort();
}

export function deleteDownload(mediaId: number, fileUrl: string) {
  const file = mediaFile(mediaId, fileUrl);
  if (file.exists) file.delete();
  setState(mediaId, NONE);
}

export function useMediaDownload(mediaId: number, fileUrl: string): DownloadState {
  return useSyncExternalStore(subscribeDownloads, () => getDownloadState(mediaId, fileUrl));
}
