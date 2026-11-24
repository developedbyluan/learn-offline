# Playback position

Both players, [audio](audio-player.md) and [video](video-player.md), remember where you left off in each lesson. Reopening a lesson picks up from that second.

This is a JavaScript-only change, so **no new native build is needed**.

## What the user sees

- **Reopening a lesson** jumps to the saved second and **stays paused**. The seek bar, the time label and the transcript highlight show that spot. Tap Play to continue.
- **Finished lessons start over.** If the saved spot is within the **last 5 seconds**, the next open starts from 0:00.
- **Each lesson has its own position.**
- **Removing a download keeps the position.** Download the lesson again and it resumes where you left off.

## Where it's stored

A single file: `<documents>/playback-positions.json`.

```json
{
  "168": { "seconds": 92.4, "duration": 315.2, "updatedAt": 1795000000000 }
}
```

- The keys are `mediaId`s.
- `seconds` is the saved spot.
- `duration` is the lesson's length, used by the 5-second rule.
- `updatedAt` is when it was saved, in milliseconds since 1970.

The file sits outside `media/`, so `deleteDownload` doesn't touch it. If it's missing or broken, every lesson starts from 0. Errors are logged and never stop playback.

## When it's saved

The position is saved:
- every **5 seconds** of playback;
- when playback **pauses**, including at the end and when you pause from the notification or the lock screen;
- when the app **leaves the screen** (Home, app switch, screen lock). Background playback continues, and the 5-second saves keep going;
- when the **player closes**.

The file is rewritten only when the position has moved by at least 1 second.

**Saving waits until the jump to the saved second has finished.** Until then, the player still reports 0:00, and saving would overwrite the real position. Saving starts once the player is within 1.5 s of the target, or once playback starts.

## Files

| File | What it does |
| --- | --- |
| `src/data/playbackPositions.ts` (new) | Reads and writes the file. The data is read once into memory with `File.textSync()`. `getResumePosition(mediaId)` returns the saved seconds, or 0 if there's none or the lesson is finished (`RESUME_END_MARGIN_SECONDS = 5`). `savePosition(mediaId, seconds, duration)` writes the file. |
| `src/hooks/usePlaybackPosition.ts` (new) | Restores the position once, when the file has loaded and its length is known. Then it saves at the moments listed above. It works only with the shared values (`currentTime`, `duration`, `isLoaded`, `playing`, `onSeek`), so it doesn't care whether audio or video is playing. |
| `src/components/player/PlayerLayout.tsx` | Takes a new `mediaId` prop and calls `usePlaybackPosition`. |
| `src/components/player/AudioPlayerScreen.tsx`, `VideoPlayerScreen.tsx`, `src/app/player.tsx` | Pass `mediaId` through. |
| `src/components/player/VideoPlayerScreen.tsx` | `currentTime` is now kept in state. It's updated by `timeUpdate` events and also set right away on every seek. A paused video may not send `timeUpdate` events, and without this the restored position would show as 0:00. |

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- **Not yet tested on a device.**

## Testing on a phone

Use the current development build with `npx expo start`.

1. Play an audio lesson to about 1:30, then close the player. Reopen it: it's paused at about 1:30, and the matching transcript line is highlighted. Tap Play and it continues from there.
2. Do the same with a video lesson. The video frame, the seek bar and the highlight all show the saved spot.
3. Seek to the last 3 seconds and let it finish, or close it there. Reopening starts from 0:00.
4. Play, press Home, wait, then swipe the app away. Reopening resumes within about 5 s of where it was.
5. Remove the download, download it again and open it. It resumes at the saved spot.
6. Two different lessons each keep their own position.

## Known limitations

- **Up to about 5 seconds can be lost** if the app is killed during playback. The last save happened at most 5 seconds earlier, or when the app left the screen.
- **Positions are stored on this phone only.** They aren't synced to the account, and they're shared by everyone who signs in on the phone.
- **There's no "resume" indicator on the cards** yet. The position only shows once the player is open.
