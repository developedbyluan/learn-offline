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

**How the transcript behaves:**
- **Highlight:** the line being spoken turns black, and the others stay gray. "Being spoken" means the last line whose `start` has passed, so the highlight stays on the previous line during gaps between lines.
- **Auto-scroll:** the list scrolls to keep the current line near the top. After you scroll by hand, it waits 4 seconds before following the audio again.
- **Tap to seek:** tapping a line jumps the audio to that line's `start`.

**Other behaviors:**
- **Play at the end:** if playback has reached the end, Play starts again from the beginning.
- **Seek bar:** drag the thumb, or tap anywhere on the track. The time label follows your finger, and the audio seeks when you lift it. With TalkBack or VoiceOver, swiping up or down moves 5 seconds.
- **Silent switch:** on iPhone, audio plays even with the silent switch on.
- **Leaving the player stops the audio.** Use the Android back button, or swipe the sheet down on iOS. Background playback is turned off.

## Which cards open it

A card opens the player only when all of these are true:
- Its media is **downloaded** (blue checkmark).
- Its `fileUrl` ends in `.mp3`, `.m4a`, `.aac` or `.wav`, ignoring upper/lower case. That's `isAudioUrl` in `src/data/media.ts`.
- It has a `mediaId` and a `fileJsonId`.

Other cards, such as videos or items that aren't downloaded, don't respond to taps yet. The download button inside a card still works as before. A tap on the button doesn't open the player.

## Files

| File | What it does |
| --- | --- |
| `src/app/player.tsx` (new) | The player screen. Reads `mediaId`, `fileUrl`, `fileJsonId`, `title` and `thumbnail` from the route params. Plays `useLocalMediaUri(...)` with `useAudioPlayer(uri, { updateInterval: 250 })`, and loads the lines with `getTranscript(...)`. If the download was removed, it shows "This lesson isn't downloaded" instead. |
| `src/app/_layout.tsx` | The root now uses a `Stack` instead of a `Slot`, with headers hidden, so `player` can open with `presentation: "modal"`. On Android, a modal is a full-screen page that slides up from the bottom. |
| `src/components/Transcript.tsx` (new) | The transcript list: highlight, auto-scroll and tap to seek. Each line is memoized, so only lines whose highlight changes re-render as the audio plays. |
| `src/components/SeekBar.tsx` (new) | The seek bar, built with React Native's touch responder props. No native slider library is needed. Also exports `formatTime` (`75` → `01:15`, `3725` → `1:02:05`). |
| `src/components/Icon.tsx` (new) | Icons for chevron up/down, play, pause, back 5 and forward 5. Uses SF Symbols on iOS. On Android and web it draws Material Symbols font characters the same way as `DownloadIcon`, to avoid the clipping bug. Play and pause use the filled Material font. |
| `src/components/MediaCard.tsx` | The card is now a `Pressable`. It's enabled only for downloaded audio and opens `/player` with `router.push`. |
| `src/data/media.ts` | Adds `fileExtension(url)`, moved from `mediaDownloads.ts`, and `isAudioUrl(fileUrl)`. |
| `app.json` | Adds the `expo-audio` config plugin with options that turn off what the player doesn't need: `microphonePermission: false`, `recordAudioAndroid: false`, `enableBackgroundPlayback: false`. The only Android permission it adds is `MODIFY_AUDIO_SETTINGS`. |
| `package.json` | Adds `expo-audio` (`~57.0.5`), installed with `npx expo install`. |

The player gets the item's details through route params, which are strings. It doesn't need the favorites list in memory, so it also works offline.

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- `npx expo config --type introspect` shows `MODIFY_AUDIO_SETTINGS` as the only permission from `expo-audio`. There's no `RECORD_AUDIO`, no microphone text and no background-audio mode.
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
7. Tapping a video card, or an audio card that isn't downloaded, does nothing.
8. Closing the player stops the audio.

## Known limitations

- **Only downloaded audio opens.** Videos and items that aren't downloaded have no player yet.
- **No background playback or lock-screen controls.** The audio stops when the player closes. Turning these on needs `enableBackgroundPlayback`, extra Android permissions and a new build.
- **No camera button.** The screenshot's camera icon was left out until its feature exists.
- **Audio is detected by file extension.** A `fileUrl` without an audio extension won't open the player, even if it's audio.
- **The transcript only shows `target`.** The IPA (`ipa`) and Vietnamese translation (`mine`) are saved but not shown.
- **Light mode only**, like the rest of the app.
