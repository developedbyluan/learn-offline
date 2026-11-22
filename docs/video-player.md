# Video player

Tapping a **downloaded video** card on the home tab opens the same player screen as audio lessons. The video sits where the artwork is. It plays the downloaded file and shows the saved transcript, so it works with no internet connection.

**This change needs a new development build**, because `expo-video` contains native code. See [Running it on a phone](#running-it-on-a-phone).

## What the user sees

The layout matches the [audio player](audio-player.md), with the video in place of the artwork:

| Part | Details |
| --- | --- |
| Title | The card's name, centered and bold |
| Video | Full width, 16:9, black background, no built-in controls. A round **fullscreen** button sits in the bottom-right corner |
| Chevron (⌃) | Hides the video to give the transcript more room. The sound keeps playing |
| Transcript | The same as audio: highlight, auto-scroll and tap to seek |
| Seek bar and controls | The same as audio: seek bar, back 5 s, Play/Pause, forward 5 s |

**Other behaviors:**
- **Fullscreen:** the button opens the platform's own fullscreen player, which has its own controls. The transcript isn't shown there. Back, or the exit button, returns to the player at the same position. On Android, JavaScript is paused while fullscreen, which is fine because nothing on the player screen is visible then.
- **Background playback:** while the player is open, the sound keeps playing when you press Home, switch apps or lock the screen. A media notification and the lock screen show the title, author and artwork, with playback controls.
- **Other apps' audio pauses** when a video plays (`audioMixingMode: "doNotMix"`).
- **Play at the end** starts again from the beginning, the same as audio.
- **Closing the player stops the video** and removes the notification. There's no mini-player and no picture-in-picture.
- If the file can't be played, the video area shows "Couldn't play this video."

## Which cards open it

A card opens the player when:
- it's **downloaded**;
- it has a `mediaId` and a `fileJsonId`;
- its `fileUrl` is audio (`.mp3`, `.m4a`, `.aac`, `.wav`) or video (`.mp4`, `.m4v`, `.mov`, `.webm`), ignoring upper/lower case.

The file type comes from `mediaKind(fileUrl)` in `src/data/media.ts`, which returns `"audio"`, `"video"` or `null`.

## Files

| File | What it does |
| --- | --- |
| `src/app/player.tsx` | Now a small route. It reads the params and checks the file is downloaded (`useLocalMediaUri`). It loads the transcript (`useTranscript`) and shows `AudioPlayerScreen` or `VideoPlayerScreen` based on `mediaKind`. Only one of them is mounted, so only one native player is created. |
| `src/components/player/PlayerLayout.tsx` (new) | The shared screen UI, moved from `player.tsx`: title, media slot, chevron, transcript, seek bar and controls. Play/pause, ±5 s and "restart at the end" are handled here, so both players behave the same. Also exports `PlayerMessage` and `playerStyles.media` (the 16:9 slot). |
| `src/components/player/AudioPlayerScreen.tsx` (new) | The audio logic moved from `player.tsx`, unchanged: `expo-audio`, background mode and lock-screen controls. Passes the artwork as the media slot. |
| `src/components/player/VideoPlayerScreen.tsx` (new) | The video player, described below. |
| `src/hooks/useTranscript.ts` (new) | The transcript loading moved from `player.tsx`. Returns `null` while loading, otherwise the lines or an error. |
| `src/data/media.ts` | Adds `isVideoUrl` and `mediaKind`. |
| `src/components/MediaCard.tsx` | `canOpenPlayer` uses `mediaKind(fileUrl) !== null` instead of `isAudioUrl`. |
| `src/components/Icon.tsx` | Adds a `fullscreen` icon: `arrow.up.left.and.arrow.down.right` on iOS, Material `fullscreen` (`0xe5d0`) elsewhere. |
| `app.json` | Adds `["expo-video", { "supportsBackgroundPlayback": true, "supportsPictureInPicture": false }]`. On Android this adds the `ExpoVideoPlaybackService` foreground service. It needs no new permissions, because `expo-audio` already adds `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. On iOS it adds the `audio` background mode, which is already there. |
| `package.json` | Adds `expo-video` (`~57.0.5`), installed with `npx expo install`. |

### `VideoPlayerScreen`

- **Creating the player:** `useVideoPlayer({ uri: localUri, metadata: { title, artist, artwork } }, setup)`. Inside `setup`:
  - `timeUpdateEventInterval = 0.25`, so a `timeUpdate` event fires every 250 ms. The default is 0, which means no events.
  - `staysActiveInBackground = true` and `showNowPlayingNotification = true`, for background playback and the notification.
  - `audioMixingMode = "doNotMix"`.

  The player is released automatically when the screen closes.
- **State** comes from `useEvent(player, …)`, imported from `"expo"`:
  - `playingChange` gives `isPlaying`.
  - `statusChange` gives `status`. The video counts as loaded when the status is `"readyToPlay"`.
  - `timeUpdate` gives `currentTime`.
  - `sourceLoad` gives `duration`. If that event came before the listener was attached, `player.duration` is read once the status is `readyToPlay`.
- **Seeking:** sets `player.currentTime`, which seeks to the exact frame. `seekBy` can land elsewhere. The assignment sits in a small `seekVideo` helper outside the component, because the React Compiler lint doesn't allow assigning to a value returned by a hook.
- **Fullscreen:** a ref to the `VideoView` calls `enterFullscreen()`.

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- `npx expo config --type introspect` shows `ExpoVideoPlaybackService` next to `expo-audio`'s `AudioControlsService`, with `supportsPictureInPicture: false`. There are no new permissions and no `RECORD_AUDIO`.
- **Not yet tested on a device.** The expo-video docs don't say whether these work with local files:
  - a `file://` video URI;
  - a `file://` artwork URI in the notification.

  Both are normally supported by the platforms' players, but check them on a phone.

## Running it on a phone

1. **Build a new development APK**, because `expo-video` is native: `eas build -p android --profile development`. Install it on the phone.
2. Run `npx expo start` and open the new development app.
3. Download a video lesson (`.mp4`), then tap the card.

Check that:
1. The player opens with the video in the artwork slot.
2. Play, Pause, ±5 s, the seek bar and tapping a transcript line all work. The highlight follows the video.
3. The fullscreen button opens fullscreen with native controls. Going back returns to the player at the same position.
4. The chevron hides the video. The sound keeps playing.
5. Press Home or lock the screen. The sound continues, and the notification shows the title, author and artwork.
6. Close the player. The video stops and the notification disappears.
7. In airplane mode, a downloaded video still plays.
8. Audio lessons still work as before, including background playback.
9. A video that isn't downloaded still doesn't open.

## Known limitations

- **No picture-in-picture.** `supportsPictureInPicture` is off.
- **Fullscreen has no transcript** and uses the platform's controls, not the app's.
- **No mini-player.** Closing the player stops playback.
- **The file type is judged by extension.** A video URL without one of the listed extensions won't open.
- **Light mode only**, like the rest of the app.
