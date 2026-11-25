import { API_BASE_URL, basicAuthHeader } from "@/data/api";
import { loadCachedFavorites } from "@/data/favoritesCache";
import { getDownloadDetails } from "@/data/mediaDownloads";
import { isOfflineError } from "@/data/networkErrors";
import {
  deleteSession,
  getUnuploadedSessions,
  markUploaded,
  type PlaySession,
} from "@/data/playTimeDb";

// Sends listening sessions to POST /sessions. See docs/play-time-tracking.md.

// The request body. The server inserts it as is, so only these keys; never `id`.
type SessionBody = {
  mediaId: number;
  mediaSlug?: string;
  timeSpent: number; // whole seconds
  date: string; // local YYYY-MM-DD
  timestamp: string; // ISO 8601
  userId: string;
  deviceSource: "mobile";
};

export type ServerSession = SessionBody & { id: number };

export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
  ) {
    super(`Upload failed (${status}): ${responseText}`);
  }
}

export type UploadSummary = {
  total: number; // sessions waiting to be uploaded
  sent: number;
  failed: number; // rejected by the server (kept on the phone)
  stoppedBy: "offline" | "auth" | null; // why the rest weren't tried
};

export async function postSession(body: SessionBody): Promise<ServerSession> {
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new UploadError(response.status, text);
  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new UploadError(response.status, `Unexpected response: ${text}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new UploadError(response.status, `No row in response: ${text}`);
  }
  return rows[0] as ServerSession;
}

function toBody(session: PlaySession, userId: string, slug: string | undefined): SessionBody {
  return {
    mediaId: session.mediaId,
    ...(slug ? { mediaSlug: slug } : {}),
    timeSpent: Math.round(session.seconds),
    date: session.startedDate,
    timestamp: session.startedAt,
    userId,
    deviceSource: "mobile",
  };
}

// Uploads this user's finished, not-yet-uploaded sessions one at a time. Each session the
// server confirms is marked uploaded and then deleted from the phone right away, so a
// failure halfway never re-sends the ones that worked. Offline or a login error (401)
// stops the upload; any other rejection skips that session and continues.
export async function uploadSessions(userId: string): Promise<UploadSummary> {
  const sessions = await getUnuploadedSessions(userId);
  const summary: UploadSummary = { total: sessions.length, sent: 0, failed: 0, stoppedBy: null };
  if (sessions.length === 0) return summary;

  const favorites = await loadCachedFavorites(userId);
  const slugs = new Map((favorites ?? []).map((item) => [item.mediaId, item.fileSlug]));

  for (const session of sessions) {
    try {
      // A lesson that left the favorites list still has its slug in its download record.
      const slug = slugs.get(session.mediaId) ?? getDownloadDetails(session.mediaId)?.fileSlug;
      await postSession(toBody(session, userId, slug));
    } catch (err) {
      console.warn("Session upload failed", session.id, err);
      if (err instanceof UploadError && err.status === 401) {
        summary.stoppedBy = "auth";
        break;
      }
      if (!(err instanceof UploadError) && isOfflineError(err)) {
        summary.stoppedBy = "offline";
        break;
      }
      summary.failed += 1;
      continue;
    }

    summary.sent += 1;
    try {
      await markUploaded(session.id);
      await deleteSession(session.id);
    } catch (err) {
      // The server has it. If marking worked, it won't be sent again.
      console.warn("Couldn't clear an uploaded session", session.id, err);
    }
  }
  return summary;
}

// The message shown after an upload.
export function uploadMessage(summary: UploadSummary): string {
  const { total, sent, stoppedBy } = summary;
  const plural = (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`;
  if (total === 0) return "Everything is already uploaded.";
  if (sent === total) return `Uploaded ${plural(sent)}.`;
  if (sent === 0) {
    if (stoppedBy === "offline") return "You're offline. Connect to the internet to upload.";
    if (stoppedBy === "auth") return "Upload failed: the server didn't accept the app's login.";
    return "Upload failed. Please try again.";
  }
  const notSent = total - sent;
  return `Uploaded ${sent} of ${plural(total)}. ${notSent} couldn't be sent. Try again later.`;
}
