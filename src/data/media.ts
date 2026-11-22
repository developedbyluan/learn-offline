export type MediaItem = {
  id: number;
  mediaId: number;
  createdAt: number;
  fileName: string;
  fileSlug: string;
  fileStatus: string;
  fileAuthor: string;
  fileAuthorUrl: string;
  fileType: string;
  fileThumbnailUrl: string;
  fileProjectId: number;
  fileFolderId: number;
  fileOrder: number;
  fileUrl: string;
  fileJsonId: number;
};

const API_BASE_URL = "https://flucom-api-bun.developedbyluan.workers.dev";

// Lowercase extension from the end of a URL's path, e.g. ".mp3". Empty if there isn't one.
export function fileExtension(url: string) {
  const path = url.split(/[?#]/)[0];
  const match = /\.([a-z0-9]{1,5})$/i.exec(path);
  return match ? `.${match[1].toLowerCase()}` : "";
}

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav"];

// Whether a media file is audio, judged by its URL's extension.
export function isAudioUrl(fileUrl: string) {
  return AUDIO_EXTENSIONS.includes(fileExtension(fileUrl));
}

const VIDEO_EXTENSIONS = [".mp4", ".m4v", ".mov", ".webm"];

// Whether a media file is video, judged by its URL's extension.
export function isVideoUrl(fileUrl: string) {
  return VIDEO_EXTENSIONS.includes(fileExtension(fileUrl));
}

export type MediaKind = "audio" | "video";

// Which player can play a file, or null if neither can.
export function mediaKind(fileUrl: string): MediaKind | null {
  if (isAudioUrl(fileUrl)) return "audio";
  if (isVideoUrl(fileUrl)) return "video";
  return null;
}

export async function fetchFavorites(userId: string): Promise<MediaItem[]> {
  const response = await fetch(
    `${API_BASE_URL}/favorites/by-user-id/${encodeURIComponent(userId)}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load favorites (${response.status})`);
  }
  return (await response.json()) as MediaItem[];
}

// A lesson's timed transcript, from GET /json/{fileJsonId}.
// "question" and "answer" mark the Q&A lines; a label ending in a colon (e.g. "Narrator:")
// names who is speaking; "" continues without a new label.
export type Speaker = "question" | "answer" | "" | `${string}:`;

export type TranscriptLine = {
  id: number;
  start: number; // seconds into the media
  end: number; // seconds into the media
  target: string; // English sentence; often starts with "\n"
  ipa: string; // IPA pronunciation of target
  mine: string; // Vietnamese translation
  speaker: Speaker;
};

export type MediaJson = {
  id: number; // the fileJsonId
  json: TranscriptLine[];
  createdAt: string;
  updatedAt: string;
};

export function mediaJsonUrl(fileJsonId: number) {
  return `${API_BASE_URL}/json/${encodeURIComponent(String(fileJsonId))}`;
}

// Light shape check, enough to reject an error page or an unexpected response.
export function isMediaJson(value: unknown): value is MediaJson {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { json?: unknown }).json)
  );
}

export async function fetchMediaJson(fileJsonId: number): Promise<MediaJson> {
  const response = await fetch(mediaJsonUrl(fileJsonId));
  if (!response.ok) {
    throw new Error(`Failed to load transcript (${response.status})`);
  }
  // An unknown fileJsonId returns 200 with an empty body, which fails to parse.
  const data: unknown = await response.json().catch(() => null);
  if (!isMediaJson(data)) {
    throw new Error("Failed to load transcript (unexpected format)");
  }
  return data;
}
