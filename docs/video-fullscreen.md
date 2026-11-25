# Fullscreen video with subtitles

The ⤢ button on a video lesson opens a fullscreen view that shows the **current subtitle line with its speaker** over the video.

## Why not native fullscreen

expo-video's `enterFullscreen()` can't be used for this. In SDK 57:
- **On Android, JavaScript is paused** while it's open.
- **Nothing from React Native can be drawn on top** of it.
- **Its own controls are always shown.**
- **External subtitle files can't be loaded:** `VideoSource` only knows tracks embedded in the video.

So the app draws its own fullscreen, using the **same video player** in a second `VideoView`.

## What the user sees

**Entering.** Tap ⤢:
- The screen rotates to **landscape**. Either side works.
- The **status bar and navigation bar hide**, and the video fills the screen.
- A video that's taller than wide stays portrait.

**Subtitles** are at the bottom center, in a dark rounded box with white 20 pt text:

| Speaker | Shown as |
| --- | --- |
| `question` | a blue **Q** badge before the line |
| `answer` | a green **A** badge before the line. The text is **blurred until it's spoken**, as in the transcript. |
| A label such as `Narrator:` | the label, in gray, above the line |
| `""` | just the line |

A line shows only while it's spoken (from `start` until `lineEnd()`), so gaps and the intro show nothing. A lesson without subtitles plays without them. The size is fixed and doesn't follow **Aa**.

**Controls.** Tap the video to show or hide them:
- **Top right:** subtitles on/off (CC), and exit fullscreen.
- **Center:** back 5 s, Play/Pause, forward 5 s.
- **Bottom:** the seek bar, in white.

**Subtitles on/off.** The CC button, next to exit, shows or hides the subtitles. A short "Subtitles on" or "Subtitles off" message confirms it. The choice is saved on the phone (`fullscreen-subtitles.json`, in `src/data/fullscreenSubtitles.ts`) for every lesson, and starts on. The button is missing when a lesson has no subtitles. The normal player's transcript isn't affected.

While playing, the controls fade after 3 s without a touch; while paused, they stay. With TalkBack on, they never hide. While they're shown, the subtitle moves up above the seek bar.

**Leaving.** The exit button or **Android Back** returns to portrait with the bars back. Playback continues at the same position.

**What keeps running.** Playback, the saved position, listening-time tracking and an active [repeat range](play-range.md) all keep working in fullscreen, because `PlayerLayout` stays mounted underneath. A range keeps looping, but changing it is done in the normal player.

## How it's built

| File | What it does |
| --- | --- |
| `src/components/player/VideoFullscreen.tsx` (new) | The fullscreen layer: the `VideoView`, subtitle, controls, the orientation lock, hidden bars, and Back handling. |
| `src/components/player/SubtitleOverlay.tsx` (new) | The current line, with the Q/A badge or label, and the hidden-answer blur. |
| `src/components/player/VideoPlayerScreen.tsx` | `fullscreen` state. The inline `VideoView` is removed while fullscreen, so the player is attached to one view at a time. |
| `src/components/Transcript.tsx` | `HiddenAnswer` is exported, with an optional `color`. |
| `src/components/SeekBar.tsx` | `tone="light"` for dark backgrounds. |
| `src/components/Icon.tsx` | `fullscreenExit`, `subtitles` and `subtitlesOff` (Material `fullscreen_exit`, `closed_caption`, `closed_caption_disabled`). |
| `src/data/fullscreenSubtitles.ts` | The saved subtitles on/off choice. |
| `package.json` | `expo-screen-orientation` and `expo-navigation-bar`, both native, so a **new development build** is needed. |

**Why a layer, not a `Modal`.** It's an absolutely positioned layer over the player screen. An RN `Modal` on Android is a separate dialog window, and hiding the navigation bar only affects the app's main window.

**Orientation.**
- Entering calls `ScreenOrientation.lockAsync(OrientationLock.LANDSCAPE)`, or `PORTRAIT_UP` for a portrait video.
- Leaving, or the player closing, calls `lockAsync(OrientationLock.PORTRAIT_UP)`, matching `"orientation": "portrait"` in app.json.

**Bars.** `NavigationBar.setHidden(true / false)` from expo-navigation-bar, and `<StatusBar hidden />` from expo-status-bar.

## Known limitations

- **Possible black frame:** moving the player between the two `VideoView`s may show a brief black frame. Check on the phone.
- **No picture-in-picture,** and the system's fullscreen gestures don't apply.
- **Fixed size:** subtitles are always 20 pt.
