# Audio player

Tapping a **downloaded audio** card on the home tab opens a player sheet. It plays the downloaded file and shows the saved transcript, so it works with no internet connection.

**This change needs a new development build**, because `expo-audio` contains native code. See [Running it on a phone](#running-it-on-a-phone).

## What the user sees

From top to bottom:

| Part | Details |
| --- | --- |
| Title | The card's name, centered and bold |
| Artwork | The saved thumbnail. Falls back to the remote URL, then the bundled fallback image. Full width, 16:9 |
| Chevron (⌃) | On the right, above the transcript. Hides the artwork to give the transcript more room, and flips to ⌄. Tapping again brings the artwork back |
| Transcript | Every line's English sentence (`target`, trimmed). Speaker labels ending in a colon, like `Narrator:`, are shown above their line in gray. `question`, `answer` and `""` aren't shown |
| Seek bar | Gray track with a white thumb. Current time on the left, total length on the right |
| Controls | Back 5 s, Play/Pause (in a gray circle), Forward 5 s |
| Menu | A small gray row under the controls: a **star** (back to favorites) and **Aa** (transcript text size) |

**How the transcript behaves:**
- **Highlight:** the line being spoken turns black, and the others stay gray. "Being spoken" means the last line whose `start` has passed, so the highlight stays on the previous line during gaps between lines.
- **Auto-scroll:** the list scrolls to keep the current line near the top. After you scroll by hand, it waits 4 seconds before following the audio again.
- **Tap to seek:** tapping a line jumps the audio to that line's `start`.

**Other behaviors:**
- **Star:** closes the player and shows the favorites list, the same as the back button. Playback stops, and the position is saved.
- **Aa:** each tap steps the transcript text through Small (18), Medium (22, the default), Large (26) and Extra large (30), then back to Small. The size is saved on the phone (`transcript-text-size.json`) and used for every lesson. The highlight and auto-scroll keep working at every size.
- **Resume:** reopening a lesson jumps to where you left off, paused. See [playback-position.md](playback-position.md).
- **Play at the end:** if playback has reached the end, Play starts again from the beginning.
- **Seek bar:** drag the thumb, or tap anywhere on the track. The time label follows your finger, and the audio seeks when you lift it. With TalkBack or VoiceOver, swiping up or down moves 5 seconds.
- **Silent switch:** on iPhone, audio plays even with the silent switch on.
- **Background playback:** while the player is open, the audio keeps playing when you press Home, switch apps or lock the screen.
- **Lock-screen and notification controls:** a media notification and the lock screen show:
  - the title, the author and the artwork (the saved thumbnail, so it works offline);
  - Play/Pause, and back and forward buttons. These jump **10 s**, a fixed value in expo-audio, while the in-app buttons jump 5 s.
  
  Changes made there show up in the app: the Play button and the transcript highlight follow.
- **Other apps' audio pauses** when a lesson plays. That's `interruptionMode: "doNotMix"`, which the lock-screen controls require.
- **Closing the player stops the audio** and removes the notification. Use the Android back button, or swipe the sheet down on iOS. There's no mini-player.

## Which cards open it

A card opens the player only when all of these are true:
- Its media is **downloaded** (blue checkmark).
- Its `fileUrl` ends in `.mp3`, `.m4a`, `.aac` or `.wav`, ignoring upper/lower case. That's `isAudioUrl` in `src/data/media.ts`.
- It has a `mediaId` and a `fileJsonId`.

Downloaded **videos** now open the same screen, with the video in place of the artwork. See [video-player.md](video-player.md). Cards that aren't downloaded don't respond to taps. The download button inside a card still works as before. A tap on the button doesn't open the player.

## Files

| File | What it does |
| --- | --- |
| `src/app/player.tsx` (new) | *Update: this logic now lives in `src/components/player/AudioPlayerScreen.tsx` and `PlayerLayout.tsx`. `player.tsx` only picks the audio or video player (see [video-player.md](video-player.md)).* The player screen. Reads `mediaId`, `fileUrl`, `fileJsonId`, `title`, `author` and `thumbnail` from the route params. Plays `useLocalMediaUri(...)` with `useAudioPlayer(uri, { updateInterval: 250 })`, and loads the lines with `getTranscript(...)`. If the download was removed, it shows "This lesson isn't downloaded" instead. It calls `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" })`. It also calls `player.setActiveForLockScreen(true, { title, artist, artworkUrl }, { showSeekBackward: true, showSeekForward: true })`, and `clearLockScreenControls()` when it closes. On Android, the lock-screen controls are also what keep background playback going: without them, the OS stops it after about 3 minutes. |
| `src/app/_layout.tsx` | The root now uses a `Stack` instead of a `Slot`, with headers hidden, so `player` can open with `presentation: "modal"`. On Android, a modal is a full-screen page that slides up from the bottom. |
| `src/components/Transcript.tsx` (new) | The transcript list: highlight, auto-scroll and tap to seek. Each line is memoized, so only lines whose highlight changes re-render as the audio plays. |
| `src/components/SeekBar.tsx` (new) | The seek bar, built with React Native's touch responder props. No native slider library is needed. Also exports `formatTime` (`75` → `01:15`, `3725` → `1:02:05`). |
| `src/data/transcriptTextSize.ts` (new) | The four text sizes, and `useTranscriptTextSize()`, which returns the current size and a `cycle` function. The choice is saved in `Paths.document/transcript-text-size.json` as `{ "index": 1 }`, read once with `textSync`. A missing or broken value means Medium. |
| `src/components/Icon.tsx` (new) | Icons for chevron up/down, play, pause, back 5, forward 5, fullscreen, star and text size (`textformat.size` / Material `format_size`). Uses SF Symbols on iOS. On Android and web it draws Material Symbols font characters the same way as `DownloadIcon`, to avoid the clipping bug. Play and pause use the filled Material font. |
| `src/components/MediaCard.tsx` | The card is now a `Pressable`. It's enabled for downloaded audio and video (`mediaKind`) and opens `/player` with `router.push`. |
| `src/data/media.ts` | Adds `fileExtension(url)`, moved from `mediaDownloads.ts`, and `isAudioUrl(fileUrl)`. |
| `app.json` | Adds the `expo-audio` config plugin with `microphonePermission: false`, `recordAudioAndroid: false` and `enableBackgroundPlayback: true`. On Android it adds:<br>• the `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions;<br>• the `AudioControlsService` foreground service (type `mediaPlayback`).<br>On iOS it adds the `audio` background mode. There's no `POST_NOTIFICATIONS` prompt, because Android doesn't require it for media notifications. |
| `package.json` | Adds `expo-audio` (`~57.0.5`), installed with `npx expo install`. |

The player gets the item's details through route params, which are strings. It doesn't need the favorites list in memory, so it also works offline.

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- `npx expo config --type introspect` shows these from `expo-audio`:
  - the permissions `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`;
  - the `AudioControlsService` service.
  
  There's no `RECORD_AUDIO` and no microphone text.
- **Not yet tested on a device.**

## Running it on a phone

1. **Build a new development APK**, because `expo-audio` is native: `eas build -p android --profile development`. Install it on the phone. The old development build doesn't include `expo-audio`, so the app crashes or shows an error when the player opens.
2. Run `npx expo start` and open the new development app.
3. Download an audio item (`.mp3`), then tap the card.

Check that:
1. The sheet opens with the title, artwork, transcript, seek bar and controls.
2. Play starts the audio, the button turns into Pause, and the current line turns black and stays in view.
3. Tapping a line jumps to it. Back 5 s and Forward 5 s move by 5 seconds.
4. Dragging or tapping the seek bar moves the audio, and the time label follows.
5. The chevron hides and shows the artwork.
6. Turn on airplane mode, close the player, and open it again. It still plays, with the transcript.
7. Tapping an audio card that isn't downloaded does nothing.
8. Closing the player stops the audio, and the notification disappears.
9. Play, then press Home. The audio keeps playing, and a media notification shows the title, author and artwork, offline too.
10. Lock the screen. The audio keeps going, and the lock-screen Play/Pause and ±10 s buttons work.
11. Leave it in the background for more than 5 minutes. It's still playing, so the Android 3-minute limit isn't hit.
12. Pause from the notification, then reopen the app. The button shows Play, and the highlight matches the position.
13. Start music in another app, then play a lesson. The other app pauses.

## Known limitations

- **Only downloaded items open.** Items that aren't downloaded have no player. Videos are covered in [video-player.md](video-player.md).
- **No mini-player.** Background playback only lasts while the player screen is open. Closing it stops the audio.
- **The lock-screen skip interval is fixed at 10 s** by expo-audio. The in-app buttons use 5 s.
- **No camera button.** The screenshot's camera icon was left out until its feature exists.
- **Audio is detected by file extension.** A `fileUrl` without an audio extension won't open the player, even if it's audio.
- **The transcript only shows `target`.** The IPA (`ipa`) and Vietnamese translation (`mine`) are saved but not shown.
- **Light mode only**, like the rest of the app.
