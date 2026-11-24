import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

// Listening sessions, stored on the phone in SQLite. See docs/play-time-tracking.md.

export type PlaySession = {
  id: string; // UUID v4
  mediaId: number;
  seconds: number; // whole seconds of playing
  startedAt: string; // ISO 8601, UTC
  endedAt: string; // ISO 8601, UTC; the last checkpoint while the session is open
  startedDate: string; // local YYYY-MM-DD when the session started
  userId: string | null; // Clerk user ID
  source: "mobile";
};

export type LessonTotal = {
  mediaId: number;
  totalSeconds: number;
  sessionCount: number;
};

type SessionRow = {
  id: string;
  media_id: number;
  seconds: number;
  started_at: string;
  ended_at: string;
  started_date: string;
  user_id: string | null;
  source: string;
};

const DATABASE_VERSION = 1;

let db: SQLiteDatabase | null = null;

// Opens the database once, migrates it, and finishes sessions left open by a crash or
// force-quit. Recovery happens here, before anything else touches the table, so it can
// never close the session of a player that is opening right now.
function getDb(): SQLiteDatabase {
  if (db) return db;
  const opened = openDatabaseSync("play-time.db");
  migrate(opened);
  recoverOpenSessions(opened);
  db = opened;
  return opened;
}

function migrate(database: SQLiteDatabase) {
  const row = database.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;
  if (version === 0) {
    database.execSync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS play_sessions (
        id            TEXT PRIMARY KEY NOT NULL,
        media_id      INTEGER NOT NULL,
        seconds       INTEGER NOT NULL DEFAULT 0,
        started_at    TEXT NOT NULL,
        ended_at      TEXT NOT NULL,
        started_date  TEXT NOT NULL,
        user_id       TEXT,
        source        TEXT NOT NULL DEFAULT 'mobile',
        status        TEXT NOT NULL DEFAULT 'open',
        uploaded_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS play_sessions_by_date ON play_sessions (user_id, started_date);
      CREATE INDEX IF NOT EXISTS play_sessions_by_media ON play_sessions (user_id, media_id);
    `);
  }
  database.execSync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

// A session still 'open' at startup never ended normally. Keep it with its last
// checkpoint, or drop it if it was under a second.
function recoverOpenSessions(database: SQLiteDatabase) {
  database.runSync("DELETE FROM play_sessions WHERE status = 'open' AND seconds < 1");
  database.runSync("UPDATE play_sessions SET status = 'done' WHERE status = 'open'");
}

// Writes never throw into playback: a failure is logged and the session keeps going.
function safeWrite(label: string, write: (database: SQLiteDatabase) => void) {
  try {
    write(getDb());
  } catch (err) {
    console.warn(`Play time: couldn't ${label}`, err);
  }
}

export function insertOpenSession(session: PlaySession) {
  safeWrite("start a session", (database) =>
    database.runSync(
      `INSERT INTO play_sessions
         (id, media_id, seconds, started_at, ended_at, started_date, user_id, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      session.id,
      session.mediaId,
      session.seconds,
      session.startedAt,
      session.endedAt,
      session.startedDate,
      session.userId,
      session.source,
    ),
  );
}

export function checkpointSession(id: string, seconds: number, endedAt: string) {
  safeWrite("save a checkpoint", (database) =>
    database.runSync(
      "UPDATE play_sessions SET seconds = ?, ended_at = ? WHERE id = ? AND status = 'open'",
      seconds,
      endedAt,
      id,
    ),
  );
}

// Ends a session. Under one second of playing, it's thrown away.
export function finishSession(id: string, seconds: number, endedAt: string) {
  safeWrite("finish a session", (database) => {
    if (seconds < 1) {
      database.runSync("DELETE FROM play_sessions WHERE id = ?", id);
    } else {
      database.runSync(
        "UPDATE play_sessions SET seconds = ?, ended_at = ?, status = 'done' WHERE id = ?",
        seconds,
        endedAt,
        id,
      );
    }
  });
}

export async function deleteSession(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM play_sessions WHERE id = ?", id);
}

// Finished sessions of this user that haven't been uploaded yet, oldest first.
export async function getUnuploadedSessions(userId: string): Promise<PlaySession[]> {
  const rows = await getDb().getAllAsync<SessionRow>(
    `SELECT id, media_id, seconds, started_at, ended_at, started_date, user_id, source
       FROM play_sessions
      WHERE user_id = ? AND status = 'done' AND uploaded_at IS NULL
      ORDER BY started_at ASC`,
    userId,
  );
  return rows.map(toSession);
}

// The server confirmed this session; it's never sent again, even if deleting it fails.
export async function markUploaded(id: string): Promise<void> {
  await getDb().runAsync(
    "UPDATE play_sessions SET uploaded_at = ? WHERE id = ?",
    new Date().toISOString(),
    id,
  );
}

function toSession(row: SessionRow): PlaySession {
  return {
    id: row.id,
    mediaId: row.media_id,
    seconds: row.seconds,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startedDate: row.started_date,
    userId: row.user_id,
    source: "mobile",
  };
}

// One entry per lesson, most listening time first.
export async function getLessonTotals(userId: string): Promise<LessonTotal[]> {
  const rows = await getDb().getAllAsync<{ media_id: number; total: number; count: number }>(
    `SELECT media_id, SUM(seconds) AS total, COUNT(*) AS count, MAX(started_at) AS last
       FROM play_sessions
      WHERE user_id = ? AND status = 'done'
      GROUP BY media_id
      ORDER BY total DESC, last DESC`,
    userId,
  );
  return rows.map((row) => ({
    mediaId: row.media_id,
    totalSeconds: row.total,
    sessionCount: row.count,
  }));
}

// A lesson's finished sessions, newest first.
export async function getLessonSessions(userId: string, mediaId: number): Promise<PlaySession[]> {
  const rows = await getDb().getAllAsync<SessionRow>(
    `SELECT id, media_id, seconds, started_at, ended_at, started_date, user_id, source
       FROM play_sessions
      WHERE user_id = ? AND media_id = ? AND status = 'done'
      ORDER BY started_at DESC`,
    userId,
    mediaId,
  );
  return rows.map(toSession);
}
