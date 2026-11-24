# Play time tracking and the Sessions tab

> **Status: built, not yet tested on a device.** It needs a **new development or preview build**, because `expo-sqlite` and `expo-crypto` are native modules.

The app records how long a learner **actually listens** to each lesson. Paused time doesn't count. Each visit to a lesson's player is one **session**, saved on the phone in SQLite. The **Sessions** tab shows this history. Uploading sessions to the API comes later; see [Later: uploading](#later-uploading).

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
| `src/data/playTimeDb.ts` | Opens, migrates and recovers the database. Holds the queries: `insertOpenSession`, `checkpointSession`, `finishSession`, `deleteSession`, `getLessonTotals`, `getLessonSessions` |
| `src/hooks/usePlayTimeTracking.ts` | The session lifecycle and the timer logic |
| `src/components/player/PlayerLayout.tsx` | Calls `usePlayTimeTracking` with `mediaId`, the Clerk `userId`, `playing` and `currentTime` |
| `src/utils/formatDuration.ts` | "45s" / "3m 20s" / "1h 5m 10s" |
| `src/app/(tabs)/_layout.tsx` | Adds the Sessions tab |
| `src/app/(tabs)/sessions.tsx` | The per-lesson list |
| `src/app/sessions/[mediaId].tsx` | One lesson's sessions, with swipe to delete |
| `src/app/_layout.tsx` | `GestureHandlerRootView`, and the detail screen's header |
| `src/components/Icon.tsx` | Adds `chevronRight`, `history` and `delete` |
| `package.json`, `app.json` | Add `expo-sqlite` (with its config plugin) and `expo-crypto` |

## Later: uploading

This isn't built yet. The session format above is meant to upload as is. For example, `POST /play-sessions` would send an array of `'done'` sessions where `uploaded_at IS NULL`, and the server would ignore `id`s it already has. After a successful upload, the app sets `uploaded_at` on those rows.

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
