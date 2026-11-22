import { useSyncExternalStore } from "react";
import { Directory, File, Paths, type DownloadOptions } from "expo-file-system";
import { fetchMediaJson, isMediaJson, mediaJsonUrl, type MediaJson } from "@/data/media";

// Downloaded media lives in <documents>/media, one set of files per mediaId, shared by all accounts:
//   media-<mediaId><ext>     the media file
//   media-<mediaId>.json     its transcript (required: a download only finishes when it's saved)
//   media-<mediaId>-thumb    its thumbnail (best effort; no extension, decoders read the format from the bytes)
// State is kept at module level so a download keeps running when its card or screen unmounts,
// and cards that show the same mediaId stay in sync.

export type DownloadState =
  | { status: "none" }
  | { status: "downloading"; progress: number | null } // 0–100; null when the size is unknown
  | { status: "downloaded"; hasThumbnail: boolean; hasTranscript: boolean };

// What's needed to download an item.
export type DownloadSource = {
  mediaId: number;
  fileUrl: string;
  fileJsonId: number;
  thumbnailUrl?: string;
};

const NONE: DownloadState = { status: "none" };

const states = new Map<number, DownloadState>();
const controllers = new Map<number, AbortController>();
const extrasInFlight = new Set<number>();
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

function transcriptFile(mediaId: number) {
  return new File(mediaDirectory(), `media-${mediaId}.json`);
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

function deleteQuietly(file: File) {
  try {
    deleteIfExists(file);
  } catch {
    // Leftovers are overwritten by the next attempt.
  }
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
    deleteQuietly(temp);
    throw err;
  }
}

async function readTranscript(file: File): Promise<MediaJson | null> {
  try {
    if (!fileExists(file)) return null;
    const data: unknown = JSON.parse(await file.text());
    return isMediaJson(data) ? data : null;
  } catch {
    return null;
  }
}

// Saves the transcript and checks that it's a real transcript, not an error page.
async function downloadTranscript(mediaId: number, fileJsonId: number, signal?: AbortSignal) {
  const destination = transcriptFile(mediaId);
  try {
    await downloadTo(mediaJsonUrl(fileJsonId), `media-${mediaId}.json.part`, destination, {
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Couldn't download the transcript: ${reason}`);
  }
  if (!(await readTranscript(destination))) {
    deleteQuietly(destination);
    throw new Error("Couldn't download the transcript: unexpected format");
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
      ? {
          status: "downloaded",
          hasThumbnail: fileExists(thumbnailFile(mediaId)),
          hasTranscript: fileExists(transcriptFile(mediaId)),
        }
      : NONE;
    states.set(mediaId, state);
  }
  return state;
}

// Downloads the transcript, then the media file. Resolves when both are saved or the download
// was cancelled; rejects if either failed, keeping nothing. The media file is moved into place
// last, so a downloaded item always has its transcript. The thumbnail follows in the background.
export async function startDownload(source: DownloadSource): Promise<void> {
  const { mediaId, fileUrl, fileJsonId } = source;
  if (getDownloadState(mediaId, fileUrl).status !== "none") return;

  const controller = new AbortController();
  controllers.set(mediaId, controller);
  setState(mediaId, { status: "downloading", progress: null });
  let lastProgress: number | null = null;

  try {
    await downloadTranscript(mediaId, fileJsonId, controller.signal);
    if (controller.signal.aborted) throw new Error("Download cancelled");

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
    deleteQuietly(transcriptFile(mediaId));
    setState(mediaId, NONE);
    if (!controller.signal.aborted) throw err;
    return;
  } finally {
    controllers.delete(mediaId);
  }

  setState(mediaId, {
    status: "downloaded",
    hasThumbnail: fileExists(thumbnailFile(mediaId)),
    hasTranscript: true,
  });
  void ensureExtras(source);
}

// Saves what a downloaded item is missing: its thumbnail (if there's a URL), and its transcript
// for items downloaded before transcripts were saved. Never rejects; failures are retried the
// next time it's called.
export async function ensureExtras(source: DownloadSource): Promise<void> {
  const { mediaId, fileJsonId, thumbnailUrl } = source;
  const state = states.get(mediaId);
  if (state?.status !== "downloaded") return;
  const needsThumbnail = !state.hasThumbnail && !!thumbnailUrl;
  const needsTranscript = !state.hasTranscript;
  if (!needsThumbnail && !needsTranscript) return;
  if (extrasInFlight.has(mediaId)) return;

  extrasInFlight.add(mediaId);
  try {
    let gotTranscript = false;
    let gotThumbnail = false;

    if (needsTranscript) {
      try {
        await downloadTranscript(mediaId, fileJsonId);
        gotTranscript = true;
      } catch {
        // Offline or the request failed. Retried next time.
      }
    }
    if (needsThumbnail && thumbnailUrl) {
      try {
        await downloadTo(thumbnailUrl, `media-${mediaId}-thumb.part`, thumbnailFile(mediaId));
        gotThumbnail = true;
      } catch {
        // Offline or the thumbnail URL failed. The remote or cached image is shown instead.
      }
    }

    const current = states.get(mediaId);
    if (current?.status === "downloaded") {
      if (gotTranscript || gotThumbnail) {
        setState(mediaId, {
          status: "downloaded",
          hasThumbnail: current.hasThumbnail || gotThumbnail,
          hasTranscript: current.hasTranscript || gotTranscript,
        });
      }
    } else {
      // The download was removed while these were saving.
      if (gotTranscript) deleteQuietly(transcriptFile(mediaId));
      if (gotThumbnail) deleteQuietly(thumbnailFile(mediaId));
    }
  } finally {
    extrasInFlight.delete(mediaId);
  }
}

export function cancelDownload(mediaId: number) {
  controllers.get(mediaId)?.abort();
}

export function deleteDownload(mediaId: number, fileUrl: string) {
  deleteIfExists(mediaFile(mediaId, fileUrl));
  deleteIfExists(transcriptFile(mediaId));
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

// The saved transcript of a downloaded item, or null if it isn't saved or can't be read.
export function loadLocalTranscript(mediaId: number): Promise<MediaJson | null> {
  return readTranscript(transcriptFile(mediaId));
}

// What a player should use: the saved transcript when there is one, otherwise fetch it.
export async function getTranscript(mediaId: number, fileJsonId: number): Promise<MediaJson> {
  return (await loadLocalTranscript(mediaId)) ?? fetchMediaJson(fileJsonId);
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
