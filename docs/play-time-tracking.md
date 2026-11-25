# Play time tracking and the Sessions tab

> **Status: built, not yet tested on a device.** It needs a **new development or preview build**, because `expo-sqlite` and `expo-crypto` are native modules.

The app records how long a learner **actually listens** to each lesson. Paused time doesn't count. Each visit to a lesson's player is one **session**, saved on the phone in SQLite. The **Sessions** tab shows this history. The **Upload** button sends them to the server and then removes them from the phone; see [Uploading](#uploading).

## Rules

1. **Only playing time counts.** Time spent paused, loading or sitting on the player without playing is not counted.
2. **Counting stops whenever playback stops, for any reason:**
   - the learner presses Pause, in the app, on the lock screen or in the notification;
   - a phone call comes in;
   - headphones are unplugged or Bluetooth disconnects;
   - another app starts playing sound;
   - the lesson reaches its end.
3. **Counting continues in the background:** with the screen locked, with the app in the background, and when playing from the lock-screen or notification controls.
4. **One session = opening a lesson's player and leaving it.** Leaving includes closing the player, going back to Favorites, and the app being closed or killed.
5. **Sessions under 1 second of playing time are thrown away.** This includes opening a lesson and never pressing Play.
6. **Changing the phone's clock doesn't affect the counted time.**
7. **After a crash or force-quit while listening,** at most about **10 seconds** are lost, not the whole session.
8. **A session that runs past midnight** belongs to the **day it started**.

## What a session saves

```json
{
  "id": "3f1c2b9e-8a4d-4f7e-9c1a-2b5e6d7f8a90",
  "mediaId": 191,
  "seconds": 125,
  "startedAt": "2026-11-24T16:58:03.120Z",
  "endedAt": "2026-11-24T17:04:41.870Z",
  "startedDate": "2026-11-24",
  "userId": "user_32kRIJ5bCMhzrG1bI9dnMWPDzR7",
  "source": "mobile"
}
```

| Field | Meaning |
| --- | --- |
| `id` | A unique ID (UUID v4 from `expo-crypto`'s `randomUUID()`), made when the session starts. It stays the same through crash recovery, so an upload later can't count a session twice. |
| `mediaId` | Which lesson, the same `mediaId` the player and downloads use. |
| `seconds` | Playing time, **whole seconds, rounded down**. Always measured with the monotonic clock, never `endedAt − startedAt`. |
| `startedAt` | When the player was opened: wall-clock time, ISO 8601 in UTC. |
| `endedAt` | When the player was left: wall-clock time, ISO 8601 in UTC. After a crash, this is the time of the last checkpoint. |
| `startedDate` | The phone's **local** calendar date when the session started, `YYYY-MM-DD`. A session from 23:50 to 00:20 counts toward the first day. |
| `userId` | The Clerk user ID of the signed-in learner, read when the session starts. `null` if unknown, so the time isn't lost. |
| `source` | Always `"mobile"`. |

`startedAt` and `endedAt` come from the phone's clock, so they're only as right as that clock. `seconds` doesn't depend on them.

## How it works

### Detecting when playing starts and stops
- Both players already report one "is it playing?" value:
  - audio: `useAudioPlayerStatus(player).playing` in `AudioPlayerScreen`;
  - video: the `playingChange` event in `VideoPlayerScreen`.
- Both pass that value to the shared `PlayerLayout` as its `playing` prop, and the tracker (`usePlayTimeTracking`) is called there.
- The native player flips the value on every case in rule 2:
  - our Pause button and the lock-screen or notification controls;
  - audio focus loss, from a call or another app's sound (we use `interruptionMode: "doNotMix"`);
  - the "audio becoming noisy" signal when headphones are unplugged;
  - the end of the media.
- The tracker never needs to know why playback stopped.

### Counting: clock readings, not a ticking timer
- **On `playing` false → true:** `segmentStart = performance.now()`.
- **On `playing` true → false:** add `performance.now() − segmentStart` to the total, then checkpoint.
- `performance.now()` is a **monotonic clock**. It only moves forward and ignores changes to the phone's date or time, which is how rule 6 holds. `Date` is used only for `startedAt`, `endedAt` and `startedDate`.
- A ticking timer (`setInterval`) could skip ticks when Android slows the app down in the background. Subtracting two clock readings can't lose time.
- **Seeking doesn't matter:** time is measured by the clock, not by the media position.

### Storage: SQLite
The database is `play-time.db`, opened with `openDatabaseSync`. It lives in the app's private storage: only this app can read it, it survives updates, and uninstalling or "Clear data" deletes it.

```sql
CREATE TABLE play_sessions (
  id            TEXT PRIMARY KEY NOT NULL,  -- UUID v4
  media_id      INTEGER NOT NULL,
  seconds       INTEGER NOT NULL DEFAULT 0, -- whole seconds of playing
  started_at    TEXT NOT NULL,              -- ISO 8601 UTC
  ended_at      TEXT NOT NULL,              -- ISO 8601 UTC; last checkpoint while open
  started_date  TEXT NOT NULL,              -- local YYYY-MM-DD
  user_id       TEXT,                       -- Clerk user ID, NULL if unknown
  source        TEXT NOT NULL DEFAULT 'mobile',
  status        TEXT NOT NULL DEFAULT 'open', -- 'open' while the player is open, then 'done'
  uploaded_at   TEXT                        -- for later uploading; NULL = not uploaded
);
-- indexes: (user_id, started_date) and (user_id, media_id)
```

- **The database is per phone, not per user.** Each row has its own `user_id`, and the Sessions tab shows only the signed-in user's rows.
- **Schema changes** go through `PRAGMA user_version` migrations (`migrate` in `playTimeDb.ts`). The database is in WAL mode.
- **Writes never interrupt playback.** Each one is wrapped in try/catch and logged.

### Checkpoints and crash recovery
- **When the player opens,** the session is inserted as a row with `status = 'open'` and `seconds = 0`.
- **While it's open,** the row's `seconds` and `ended_at` are updated:
  - **every 10 s or so of playing.** This is driven by the player's own progress updates (`currentTime` changes), which keep arriving in the background, so there's no separate timer;
  - **on every pause**;
  - **when the app leaves the foreground** (`AppState` not active).
- **When the player closes,** the row becomes `status = 'done'` with the final total. If the total is under 1 s, the row is deleted.
- **On the next app start,** any row still `'open'` belongs to a session that never ended normally. It's kept with its last checkpoint, or deleted if under 1 s. This runs inside `getDb()`, before anything else touches the table, so it can't close the session of a player that's opening at that moment.

## Sessions tab

### List: `src/app/(tabs)/sessions.tsx`
- The tab sits between Home and Settings, titled "Sessions".
- **One row per lesson,** most listening time first. Each row shows:
  - a thumbnail;
  - the lesson name;
  - "**3m 20s** · 4 sessions" (singular "1 session");
  - a chevron.
- **The header** shows the total across all lessons.
- **Names and thumbnails** come from the saved favorites list (`loadCachedFavorites`). A lesson that's no longer a favorite shows as "Lesson 191" with a gray placeholder.
- **It reloads whenever the tab is shown** (`useFocusEffect`), so new sessions and deletions appear.
- **Empty state:** a clock icon, "No listening yet", and "Play a lesson and your listening time will show up here."

### Lesson detail: `src/app/sessions/[mediaId].tsx`
- Tapping a lesson opens this screen, with a header and back button, titled with the lesson name.
- **At the top:** the total time and session count.
- **One row per session,** newest first:
  - the date, e.g. "Mon, Nov 24, 2026";
  - the time range, e.g. "23:50 – 00:20";
  - the duration on the right.
- **Swipe a row left** to show a red **Delete** button. Tapping it deletes the session, animates the row away and shows a "Session deleted" toast.
- **Screen readers** get a "Delete session" accessibility action on each row instead of the swipe.
- **When the last session is deleted,** the screen shows "No sessions left for this lesson."
- **The root layout** is wrapped in `GestureHandlerRootView`, which swipeable rows need.

### Duration format: `src/utils/formatDuration.ts`
| Seconds | Shown |
| --- | --- |
| 0 | `0s` |
| 45 | `45s` |
| 200 | `3m 20s` |
| 3600 | `1h 0m 0s` |
| 3910 | `1h 5m 10s` |

Units below the largest are always shown, so lengths line up.

## Edge cases

| Case | Result |
| --- | --- |
| Open a lesson, never press Play | 0 s, discarded |
| Play 3 min, pause 10 min, play 2 min, close | One session, `seconds: 300` |
| Play with the screen locked for 20 min | Counted, if the player keeps reporting `playing` |
| A phone call interrupts, then you resume | The call time isn't counted. It's the same session if the player stayed open |
| The lesson ends with the player left open | Counting stops at the end. Pressing Play starts again from the beginning and counts again |
| The phone's clock moved back 1 hour mid-session | `seconds` is correct. `endedAt` may look earlier than expected |
| Force-quit after 7 min of playing | One session of about 6:50 to 7:00, recovered on the next launch |
| Not signed in, or `userId` unknown | Saved with `user_id` NULL. It isn't shown in the Sessions tab |
| A session from 23:50 to 00:20 | `startedDate` is the first day |

## Files

| File | Role |
| --- | --- |
| `src/data/playTimeDb.ts` | Opens, migrates and recovers the database. Holds the queries: `insertOpenSession`, `checkpointSession`, `finishSession`, `deleteSession`, `getLessonTotals`, `getLessonSessions`, `getUnuploadedSessions`, `markUploaded` |
| `src/hooks/usePlayTimeTracking.ts` | The session lifecycle and the timer logic |
| `src/components/player/PlayerLayout.tsx` | Calls `usePlayTimeTracking` with `mediaId`, the Clerk `userId`, `playing` and `currentTime` |
| `src/utils/formatDuration.ts` | "45s" / "3m 20s" / "1h 5m 10s" |
| `src/app/(tabs)/_layout.tsx` | Adds the Sessions tab |
| `src/app/(tabs)/sessions.tsx` | The per-lesson list |
| `src/app/sessions/[mediaId].tsx` | One lesson's sessions, with swipe to delete |
| `src/app/_layout.tsx` | `GestureHandlerRootView`, and the detail screen's header |
| `src/components/Icon.tsx` | Adds `chevronRight`, `history`, `delete` and `upload` |
| `src/data/api.ts` | `API_BASE_URL` (from `EXPO_PUBLIC_API_BASE_URL`) and `basicAuthHeader()` |
| `src/data/sessionUpload.ts` | `postSession`, `uploadSessions` and `uploadMessage` |
| `src/data/media.ts` | Uses `API_BASE_URL` from `api.ts` |
| `package.json`, `app.json` | Add `expo-sqlite` (with its config plugin) and `expo-crypto` |

## Uploading

The **Upload** button is at the top right of the Sessions tab, next to the title. It's a blue pill with a cloud icon, and it only shows when there are sessions in the list. While the upload runs, it shows a spinner and "Uploading…" and can't be tapped again. Afterwards a toast reports the result and the list reloads. The code is in `src/data/sessionUpload.ts`.

### What's sent
- Only the **signed-in user's finished sessions** that haven't been uploaded yet (`status = 'done' AND uploaded_at IS NULL`), oldest first.
- A session whose player is still open is never sent.
- Sessions saved without a user stay on the phone.

### The request
**One request per session:** `POST ${EXPO_PUBLIC_API_BASE_URL}/sessions`.

| Header | Value |
| --- | --- |
| `Authorization` | `Basic <base64("user:pass")>`, from `EXPO_PUBLIC_API_USER` and `EXPO_PUBLIC_API_PASS` (`basicAuthHeader()` in `src/data/api.ts`) |
| `Content-Type` | `application/json` |

| Body field | From |
| --- | --- |
| `mediaId` | `mediaId` |
| `mediaSlug` | the lesson's `fileSlug` from the saved favorites list. Left out if unknown |
| `timeSpent` | `seconds`, as an integer |
| `date` | `startedDate` (local `YYYY-MM-DD`) |
| `timestamp` | `startedAt` (ISO 8601) |
| `userId` | the signed-in Clerk user ID |
| `deviceSource` | `"mobile"` |

`id` is never sent, because the server assigns its own. A success is `200` with a JSON array holding the inserted row.

### After each session
1. **The server says 200:** the session is **marked uploaded** (`uploaded_at`), then **deleted** from the phone. This happens per session, right away, so if the upload stops halfway, the ones that already worked aren't sent again. If the delete fails, the mark still keeps it from being re-sent.
2. **Offline or 401:** the upload **stops**, because the rest would fail the same way. Nothing that wasn't confirmed is deleted.
3. **Any other error,** e.g. a `500` from a `mediaId` the server doesn't know: that session **stays on the phone**, is counted as failed, and the upload **continues** with the next one. One bad session can't block every future upload.

Raw errors are logged with `console.warn`.

### Messages
| Result | Toast |
| --- | --- |
| All sent | "Uploaded 5 sessions." / "Uploaded 1 session." |
| Some sent | "Uploaded 3 of 5 sessions. 2 couldn't be sent. Try again later." |
| None sent, offline | "You're offline. Connect to the internet to upload." |
| None sent, 401 | "Upload failed: the server didn't accept the app's login." |
| None sent, other | "Upload failed. Please try again." |
| Nothing waiting | "Everything is already uploaded." |

### After uploading
- Uploaded sessions are **deleted from the phone**. The Sessions tab then shows only sessions recorded since the last upload, and the server keeps the full history.
- To check what arrived: `GET ${API_BASE_URL}/sessions/by-user-id/<userId>?limit=20&offset=0` (no auth, newest first).

### Environment
- `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_API_USER` and `EXPO_PUBLIC_API_PASS` are in `.env` for local development. They're also in the EAS **development** and **preview** environments, for cloud builds.
- `API_BASE_URL` (`src/data/api.ts`) falls back to the Workers URL if the variable is missing. `media.ts` uses it too.
- Missing credentials make every upload fail with a logged error.

### Risks
- **The credentials are inside the app.** Every `EXPO_PUBLIC_` variable is embedded in the JavaScript bundle, so anyone with the APK can extract the username and password and post sessions. That's fine for internal testing. Before a public release, have the server verify the learner's **Clerk session token** instead of a shared password.
- **Possible duplicates:** the server doesn't accept our session `id`, so it can't recognize a repeat. If a request reaches the server but the response is lost, for example the connection drops at that exact moment, that session stays on the phone and is sent again next time. Sending one session at a time limits this to at most one duplicate per interrupted upload. A server-side fix would be to accept a client `sessionId` with a unique index.

## Testing on a phone

These steps need a new development build with `expo-sqlite` and `expo-crypto`.

1. With no history, the Sessions tab shows "No listening yet".
2. Play about 30 s, pause 30 s, play about 30 s, then close. The tab shows "1m 0s · 1 session", give or take a second.
3. Open and close a lesson without playing: nothing is added.
4. Play two lessons for different lengths: the longer one is listed first.
5. Tap a lesson to see each session's date, time range and duration.
6. Swipe a session left and tap Delete: it disappears and the toast shows. Back on the list, the totals are updated.
7. Lock the screen while playing for about 2 min: it's counted. A lock-screen pause stops counting.
8. A call, unplugging headphones, starting another app's audio and the lesson ending each stop counting.
9. Force-quit while playing, then reopen: the session appears, with at most about 10 s missing.
10. Change the phone's time mid-session: the duration is still right.
11. A session started before midnight and ended after it has the earlier `startedDate`.
12. **Upload:** record two short sessions, then tap Upload. The toast says "Uploaded 2 sessions." and the list empties. Both sessions appear at `GET /sessions/by-user-id/<userId>`.
13. **Upload in airplane mode:** the offline toast shows, and the sessions stay.
14. **Wrong password** in `.env` (restart the bundler): the 401 toast shows, and nothing is deleted.
15. **Double-tap Upload:** only one upload runs.
