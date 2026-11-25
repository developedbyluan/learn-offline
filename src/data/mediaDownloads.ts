import { useSyncExternalStore } from "react";
import { Directory, File, Paths, type DownloadOptions } from "expo-file-system";
import {
  fetchMediaJson,
  fileExtension,
  isMediaJson,
  mediaJsonUrl,
  type MediaItem,
  type MediaJson,
} from "@/data/media";

// Downloaded media lives in <documents>/media, one set of files per mediaId, shared by all accounts:
//   media-<mediaId><ext>     the media file
//   media-<mediaId>.json     its transcript (required: a download only finishes when it's saved)
//   media-<mediaId>-thumb    its thumbnail (best effort; no extension, decoders read the format from the bytes)
//   media-<mediaId>.meta.json  which version is on the phone (see DownloadRecord)
// State is kept at module level so a download keeps running when its card or screen unmounts,
// and cards that show the same mediaId stay in sync.

export type DownloadState =
  | { status: "none" }
  | { status: "downloading"; progress: number | null } // 0–100; null when the size is unknown
  | {
      status: "downloaded";
      hasThumbnail: boolean;
      hasTranscript: boolean;
      // True while a newer version downloads in the background. The old copy stays playable.
      updating: boolean;
      // The saved copy's updatedAtOfMedia (0 if unknown). Changes when the files are replaced.
      version: number;
    };

// What's needed to download an item.
export type DownloadSource = {
  mediaId: number;
  fileUrl: string;
  fileJsonId: number;
  thumbnailUrl?: string;
  updatedAtOfMedia?: number; // ms since epoch
  // Shown when the lesson is no longer in the favorites list.
  fileName?: string;
  fileAuthor?: string;
  fileSlug?: string;
};

// Which version of an item is on the phone, saved next to its files.
type DownloadRecord = {
  fileUrl: string;
  fileJsonId: number;
  thumbnailUrl: string | null;
  updatedAtOfMedia: number; // ms since epoch; 0 if the server didn't send it
  downloadedAt: number; // ms since epoch
  // The lesson's details, so it can still be shown after it leaves the favorites list.
  // Missing in records saved by older app versions until the next favorites refresh.
  fileName?: string;
  fileAuthor?: string;
  fileSlug?: string;
};

// A lesson that's on the phone, read from its record. Favorite or not.
export type DownloadedItem = {
  mediaId: number;
  fileUrl: string;
  fileJsonId: number;
  thumbnailUrl: string | null;
  updatedAtOfMedia: number;
  downloadedAt: number;
  fileName?: string;
  fileAuthor?: string;
  fileSlug?: string;
};

const NONE: DownloadState = { status: "none" };

const states = new Map<number, DownloadState>();
const controllers = new Map<number, AbortController>();
const extrasInFlight = new Set<number>();
const listeners = new Set<() => void>();
// Records read from disk. null means "checked, there's none".
const records = new Map<number, DownloadRecord | null>();
// How many open players use each item. Its files aren't replaced while it's in use.
const inUse = new Map<number, number>();
// Items waiting for an update, run one at a time.
const updateQueue = new Map<number, DownloadSource>();
let updateQueueRunning = false;
// Everything on the phone, read from the records. null until read, and after a change.
let downloadedItems: DownloadedItem[] | null = null;

function mediaDirectory() {
  return new Directory(Paths.document, "media");
}

function mediaFile(mediaId: number, fileUrl: string) {
  return new File(mediaDirectory(), `media-${mediaId}${fileExtension(fileUrl)}`);
}

function transcriptFile(mediaId: number) {
  return new File(mediaDirectory(), `media-${mediaId}.json`);
}

function thumbnailFile(mediaId: number) {
  return new File(mediaDirectory(), `media-${mediaId}-thumb`);
}

function recordFile(mediaId: number) {
  return new File(mediaDirectory(), `media-${mediaId}.meta.json`);
}

function isDownloadRecord(value: unknown): value is DownloadRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.fileUrl === "string" &&
    typeof v.fileJsonId === "number" &&
    typeof v.updatedAtOfMedia === "number"
  );
}

function readRecord(mediaId: number): DownloadRecord | null {
  if (records.has(mediaId)) return records.get(mediaId) ?? null;
  let record: DownloadRecord | null = null;
  try {
    const file = recordFile(mediaId);
    if (fileExists(file)) {
      const data: unknown = JSON.parse(file.textSync());
      if (isDownloadRecord(data)) record = data;
    }
  } catch {
    // Missing or broken: treated as an item downloaded before records existed.
  }
  records.set(mediaId, record);
  return record;
}

function recordFor(source: DownloadSource): DownloadRecord {
  return {
    fileUrl: source.fileUrl,
    fileJsonId: source.fileJsonId,
    thumbnailUrl: source.thumbnailUrl || null,
    updatedAtOfMedia: source.updatedAtOfMedia ?? 0,
    downloadedAt: Date.now(),
    ...detailsOf(source),
  };
}

// The display details of a source, leaving out the ones it doesn't have.
function detailsOf(source: DownloadSource): Pick<DownloadRecord, "fileName" | "fileAuthor" | "fileSlug"> {
  return {
    ...(source.fileName ? { fileName: source.fileName } : {}),
    ...(source.fileAuthor ? { fileAuthor: source.fileAuthor } : {}),
    ...(source.fileSlug ? { fileSlug: source.fileSlug } : {}),
  };
}

function writeRecord(mediaId: number, record: DownloadRecord) {
  records.set(mediaId, record);
  downloadedItems = null;
  try {
    mediaDirectory().create({ idempotent: true });
    const file = recordFile(mediaId);
    if (!fileExists(file)) file.create();
    file.write(JSON.stringify(record));
  } catch (err) {
    console.warn("Could not save the download record", err);
  }
}

// The media file that's actually on the phone. Uses the saved record's URL, so a changed
// extension on the server still finds (and later replaces) the old file.
function savedMediaFile(mediaId: number, fileUrl: string) {
  return mediaFile(mediaId, readRecord(mediaId)?.fileUrl ?? fileUrl);
}

// Whether the server has a newer version than the saved copy.
function isOutdated(record: DownloadRecord, source: DownloadSource) {
  return (
    (source.updatedAtOfMedia ?? 0) > record.updatedAtOfMedia ||
    record.fileUrl !== source.fileUrl ||
    record.fileJsonId !== source.fileJsonId ||
    record.thumbnailUrl !== (source.thumbnailUrl || null)
  );
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
  // A download appeared or went away: list the files again next time.
  if (states.get(mediaId)?.status !== state.status) downloadedItems = null;
  states.set(mediaId, state);
  listeners.forEach((listener) => listener());
}

// A "downloaded" state read from the disk and the record.
function downloadedState(mediaId: number, updating = false): DownloadState {
  return {
    status: "downloaded",
    hasThumbnail: fileExists(thumbnailFile(mediaId)),
    hasTranscript: fileExists(transcriptFile(mediaId)),
    updating,
    version: readRecord(mediaId)?.updatedAtOfMedia ?? 0,
  };
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
async function downloadTranscript(
  mediaId: number,
  fileJsonId: number,
  signal?: AbortSignal,
  destination = transcriptFile(mediaId),
) {
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
    state = fileExists(savedMediaFile(mediaId, fileUrl)) ? downloadedState(mediaId) : NONE;
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

  writeRecord(mediaId, recordFor(source));
  setState(mediaId, downloadedState(mediaId));
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
          ...current,
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
  // Stop a background update first, so it doesn't put files back.
  updateQueue.delete(mediaId);
  controllers.get(mediaId)?.abort();
  deleteIfExists(savedMediaFile(mediaId, fileUrl));
  deleteIfExists(mediaFile(mediaId, fileUrl));
  deleteIfExists(transcriptFile(mediaId));
  deleteIfExists(thumbnailFile(mediaId));
  deleteIfExists(recordFile(mediaId));
  records.set(mediaId, null);
  setState(mediaId, NONE);
}

// The player calls these while it's open, so an update never replaces a file being played.
// Returns a function that releases it.
export function markInUse(mediaId: number): () => void {
  inUse.set(mediaId, (inUse.get(mediaId) ?? 0) + 1);
  return () => {
    const count = (inUse.get(mediaId) ?? 1) - 1;
    if (count > 0) inUse.set(mediaId, count);
    else inUse.delete(mediaId);
  };
}

// Compares downloaded items with the latest favorites and updates the outdated ones in the
// background. Called after every successful favorites fetch.
export function syncDownloads(items: MediaItem[]): void {
  for (const item of items) {
    if (!item.fileUrl) continue;
    const source: DownloadSource = {
      mediaId: item.mediaId,
      fileUrl: item.fileUrl,
      fileJsonId: item.fileJsonId,
      thumbnailUrl: item.fileThumbnailUrl || undefined,
      updatedAtOfMedia: item.updatedAtOfMedia,
      fileName: item.fileName,
      fileAuthor: item.fileAuthor,
      fileSlug: item.fileSlug,
    };
    let state: DownloadState;
    try {
      state = getDownloadState(source.mediaId, source.fileUrl);
    } catch {
      continue;
    }
    if (state.status !== "downloaded" || state.updating) continue;

    const record = readRecord(source.mediaId);
    if (!record) {
      // Downloaded before records existed: assume it's current, instead of downloading
      // everything again after the app update.
      writeRecord(source.mediaId, recordFor(source));
      setState(source.mediaId, { ...state, version: source.updatedAtOfMedia ?? 0 });
      continue;
    }
    // Keep the name, author and slug current, so the lesson can still be shown if it
    // leaves the favorites list. Only the record changes, never the files.
    const details = detailsOf(source);
    if (
      record.fileName !== details.fileName ||
      record.fileAuthor !== details.fileAuthor ||
      record.fileSlug !== details.fileSlug
    ) {
      writeRecord(source.mediaId, {
        ...record,
        fileName: details.fileName,
        fileAuthor: details.fileAuthor,
        fileSlug: details.fileSlug,
      });
      listeners.forEach((listener) => listener());
    }
    if (isOutdated(record, source)) updateQueue.set(source.mediaId, source);
  }
  void runUpdateQueue();
}

async function runUpdateQueue() {
  if (updateQueueRunning) return;
  updateQueueRunning = true;
  try {
    for (;;) {
      const next = updateQueue.entries().next();
      if (next.done) break;
      const [mediaId, source] = next.value;
      updateQueue.delete(mediaId);
      // An open player keeps the old copy; the next sync tries again.
      if (inUse.has(mediaId)) continue;
      await updateDownload(source);
    }
  } finally {
    updateQueueRunning = false;
  }
}

// Downloads the new version next to the old one, then swaps it in. On any failure the old
// copy and record stay, and the next sync tries again. Never rejects.
async function updateDownload(source: DownloadSource): Promise<void> {
  const { mediaId, fileUrl, fileJsonId, thumbnailUrl } = source;
  const state = states.get(mediaId);
  const record = readRecord(mediaId);
  if (state?.status !== "downloaded" || state.updating || !record) return;

  const controller = new AbortController();
  controllers.set(mediaId, controller);
  setState(mediaId, { ...state, updating: true });

  const stagedTranscript = new File(Paths.cache, `media-${mediaId}.json.next`);
  const stagedMedia = new File(mediaDirectory(), `media-${mediaId}.next${fileExtension(fileUrl)}`);
  try {
    await downloadTranscript(mediaId, fileJsonId, controller.signal, stagedTranscript);
    await downloadTo(fileUrl, `media-${mediaId}.part`, stagedMedia, { signal: controller.signal });
    if (controller.signal.aborted) throw new Error("Update cancelled");
    // Removed, or opened in the player, while downloading: keep things as they are.
    if (states.get(mediaId)?.status !== "downloaded" || inUse.has(mediaId)) {
      throw new Error("Update skipped");
    }

    // Swap: the new media and transcript replace the old ones.
    const oldMedia = mediaFile(mediaId, record.fileUrl);
    const newMedia = mediaFile(mediaId, fileUrl);
    deleteIfExists(oldMedia);
    deleteIfExists(newMedia);
    await stagedMedia.move(newMedia);
    deleteIfExists(transcriptFile(mediaId));
    await stagedTranscript.move(transcriptFile(mediaId));

    // The thumbnail is best effort, as for new downloads.
    deleteQuietly(thumbnailFile(mediaId));
    if (thumbnailUrl) {
      try {
        await downloadTo(thumbnailUrl, `media-${mediaId}-thumb.part`, thumbnailFile(mediaId));
      } catch {
        // ensureExtras tries again later.
      }
    }

    writeRecord(mediaId, recordFor(source));
    setState(mediaId, downloadedState(mediaId));
  } catch {
    deleteQuietly(stagedTranscript);
    deleteQuietly(stagedMedia);
    const current = states.get(mediaId);
    if (current?.status === "downloaded") setState(mediaId, { ...current, updating: false });
  } finally {
    controllers.delete(mediaId);
  }
}

// The local file:// URI of a downloaded media file, or null if it isn't on the phone.
// Always work the path out with this function instead of saving it: on iOS the app's
// documents folder path can change after an app update.
export function getLocalMediaUri(mediaId: number, fileUrl: string): string | null {
  let file: File;
  try {
    file = savedMediaFile(mediaId, fileUrl);
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
  return state.status === "downloaded" ? savedMediaFile(mediaId, fileUrl).uri : null;
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

const RECORD_NAME = /^media-(\d+)\.meta\.json$/;

// Every lesson on the phone that has a record, newest download first. Favorites and lessons
// that left the list alike; downloads are never deleted automatically. Returns the same array
// until a download is added, updated or removed, as useSyncExternalStore requires.
export function getDownloadedItems(): DownloadedItem[] {
  if (downloadedItems) return downloadedItems;
  const items: DownloadedItem[] = [];
  try {
    const directory = mediaDirectory();
    if (directory.exists) {
      for (const entry of directory.list()) {
        const match = RECORD_NAME.exec(entry.name);
        if (!match) continue;
        const mediaId = Number(match[1]);
        const record = readRecord(mediaId);
        if (!record || !fileExists(savedMediaFile(mediaId, record.fileUrl))) continue;
        items.push({
          mediaId,
          fileUrl: record.fileUrl,
          fileJsonId: record.fileJsonId,
          thumbnailUrl: record.thumbnailUrl,
          updatedAtOfMedia: record.updatedAtOfMedia,
          downloadedAt: record.downloadedAt ?? 0,
          fileName: record.fileName,
          fileAuthor: record.fileAuthor,
          fileSlug: record.fileSlug,
        });
      }
    }
  } catch (err) {
    console.warn("Couldn't list downloads", err);
  }
  items.sort((a, b) => b.downloadedAt - a.downloadedAt);
  downloadedItems = items;
  return items;
}

// Like getDownloadedItems, but re-renders when downloads change.
export function useDownloadedItems(): DownloadedItem[] {
  return useSyncExternalStore(subscribeDownloads, getDownloadedItems);
}

// A downloaded lesson's saved name, slug and thumbnail URL, or null if it isn't on the phone
// or has no record. Used where the favorites list no longer has the lesson.
export function getDownloadDetails(
  mediaId: number,
): Pick<DownloadedItem, "fileName" | "fileSlug" | "thumbnailUrl"> | null {
  const record = readRecord(mediaId);
  if (!record) return null;
  return { fileName: record.fileName, fileSlug: record.fileSlug, thumbnailUrl: record.thumbnailUrl };
}
