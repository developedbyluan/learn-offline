# Downloading media to the phone

The download button on each favorite card now downloads the media from `MediaItem.fileUrl` and saves it on the phone. This is the first step toward playing media offline. Nothing plays the downloaded files yet.

## What the button does

| State | Button shows | Tapping it |
| --- | --- | --- |
| Not downloaded | Circle with a down arrow | Starts the download |
| Downloading | Progress, like `42%`. A spinner if the server doesn't send the file size | Cancels the download |
| Downloaded | Filled blue circle with a white checkmark | Asks "Remove download?". **Remove** deletes the file |

Until a card's media is downloaded, its thumbnail, title and author are dimmed to 40% opacity. The download button stays at full opacity. A card becomes fully visible once its download finishes, and dims again if the download is removed. This way users can tell which media is on the phone at a glance. Cards with no `mediaId` or `fileUrl` can't be downloaded, so they aren't dimmed.

If a download fails (for example, with no internet), the app shows a "Download failed" alert with the error, and the button goes back to the down arrow.

Screen readers announce the button as "Download <title>", "Cancel download of <title>" or "Remove download of <title>", depending on the state.

## Where files are stored

```
<app documents>/media/media-<mediaId><ext>     the media file
<app documents>/media/media-<mediaId>-thumb    its thumbnail
```

- **Thumbnails** are saved right after the media file, from `fileThumbnailUrl`, so a downloaded item shows its real thumbnail offline. The thumbnail file has no extension. Android's and iOS's image decoders read the format from the file's contents.
  - Saving the thumbnail is best effort. If it fails, the media still counts as downloaded, and the app tries again the next time the card is shown while online.
  - Items downloaded before thumbnails were saved get theirs the same way.

- **`<ext>`** is the extension at the end of `fileUrl`'s path, ignoring any `?query` or `#hash`. For example, `.mp3` or `.mp4`. If the URL has no extension, the file has none.
- **One copy per media.** Files are named by `mediaId`, not by user, so every account on the phone shares them. Media files are served from public URLs, so they aren't private to a user. This is unlike the saved favorites list, which is stored per user.
- **Safe partial downloads.** A download first goes to `<app cache>/media-<mediaId>.part`. It's moved into `media/` only after it finishes. A half-finished file is therefore never shown as downloaded.

```mermaid
flowchart LR
  Button["DownloadButton"] -->|tap| Start["startDownload"]
  Start --> Temp["cache/media-id.part"]
  Temp -->|finished| Final["documents/media/media-id.ext"]
  Start -->|progress| Store["download state"]
  Store --> Button
```

## Files changed

### `src/data/mediaDownloads.ts` (new)

Keeps the download state and does the file work, using `File`, `Directory` and `Paths` from `expo-file-system`.

```ts
export type DownloadState =
  | { status: "none" }
  | { status: "downloading"; progress: number | null } // 0–100; null when the size is unknown
  | { status: "downloaded"; hasThumbnail: boolean };
```

The state is kept at module level, not inside a component. This has two effects:

- **Downloads keep going.** A download continues when its card or screen unmounts, for example after switching tabs.
- **Duplicate cards stay in sync.** Two cards with the same `mediaId` show the same state, and they can't start two downloads of one file.

| Function | What it does |
| --- | --- |
| `getDownloadState(mediaId, fileUrl)` | Returns the state. The first call for a `mediaId` checks whether the file exists, and the answer is cached. The same object comes back until the state changes, which `useSyncExternalStore` requires. |
| `startDownload(mediaId, fileUrl)` | Downloads with `File.downloadFileAsync(url, tempFile, { idempotent, signal, onProgress })`, then moves the file into `media/`. It does nothing if the media is already downloading or downloaded. It rejects on failure, but not when cancelled. |
| `cancelDownload(mediaId)` | Cancels the download through its `AbortController`. |
| `deleteDownload(mediaId, fileUrl)` | Deletes the file. |
| `subscribeDownloads(listener)` | Calls `listener` whenever any state changes. |
| `useMediaDownload(mediaId, fileUrl)` | A React hook that returns the state and re-renders when it changes. |
| `getLocalMediaUri(mediaId, fileUrl)` | Returns the downloaded file's `file://` URI, or `null` if it isn't on the phone. It checks the disk. If the file was removed outside the app, it also resets the cached state to `none`, so the card updates. |
| `getPlaybackUri(mediaId, fileUrl)` | Returns the local URI when the file is downloaded, otherwise `fileUrl`. |
| `useLocalMediaUri(mediaId, fileUrl)` | A React hook that returns the local URI or `null`, and re-renders when a download finishes or is removed. It reads the cached state, so it doesn't check the disk on every render. |
| `ensureThumbnail(mediaId, thumbnailUrl)` | Saves the thumbnail of a downloaded item that doesn't have one, then sets `hasThumbnail: true`. It does nothing if the item isn't downloaded, already has a thumbnail, or is already saving one. It never rejects. Failures are retried on the next call. |
| `getLocalThumbnailUri(mediaId)` | Returns the saved thumbnail's `file://` URI, or `null`. It reads the cached state, so it's cheap to call while rendering. |

`startDownload(mediaId, fileUrl, thumbnailUrl?)` sets the state to `downloaded` as soon as the media file is saved, then calls `ensureThumbnail` in the background. `deleteDownload` deletes the thumbnail too. Both files go through the same steps in the helper `downloadTo()`: download to a `.part` file in the cache, then move it into `media/`.

Progress only updates the state when the whole percentage changes, so a download triggers at most about 100 re-renders.

#### Using it from a player

```ts
import { getPlaybackUri } from "@/data/mediaDownloads";

const uri = getPlaybackUri(item.mediaId, item.fileUrl);
// "file:///…/media/media-42.mp3" when downloaded, otherwise "https://media.speakfc.com/…"
```

Pass `uri` to `expo-audio` or `expo-video`. In a player screen that should switch to the local file as soon as a download finishes, use `useLocalMediaUri(...) ?? item.fileUrl` instead.

Never save the URI, for example in AsyncStorage or with the favorites list. Work it out each time with these functions. On iOS the app's documents folder path can change after an app update, so a saved absolute path could point to a folder that no longer exists.

These real media URLs were checked: `.mp4` and `.MP3` files on `media.speakfc.com`. Each returns `200` with `video/mp4` or `audio/mpeg` and a `content-length`. They're saved as `.mp4` and `.mp3`, extensions the iOS and Android players recognize.

### `src/components/DownloadButton.tsx` (new)

This is the 44×44 button. It reads `useMediaDownload` and does what the table above describes. The confirm dialog and the error alerts use `Alert.alert`.

### `src/components/DownloadIcon.tsx`

The new `downloaded` prop switches between two icons:

```ts
const ICONS = {
  download: { ios: "arrow.down.circle", material: 0xf181 },        // arrow_circle_down
  downloaded: { ios: "checkmark.circle.fill", material: 0xe86c },  // check_circle, filled
} as const;
```

Android and web still draw the Material Symbols character themselves. [download-button.md](download-button.md) explains why.

The downloaded icon is a filled blue circle (`colors.accent`, `#007AFF`, added to `src/styles/global.ts`) with a white checkmark. It ignores the `color` prop.

- **iOS:** `SymbolView` with `type="palette"` and `colors={["#FFFFFF", colors.accent]}`. The first color goes to the checkmark and the second to the circle.
- **Android and web:** the filled check_circle character from the `MaterialSymbols_400Regular_Filled` font, which ships in the same `@expo-google-fonts/material-symbols` package. In that font the checkmark is a see-through cutout. A white disc, 60% of the icon size, is drawn behind it, so the checkmark is white on any background.

### `src/components/MediaCard.tsx`

- The `onDownload` prop was removed, and `fileUrl?: string` was added.
- The card renders `<DownloadButton mediaId={mediaId} fileUrl={fileUrl} name={name} />` only when both `mediaId` and `fileUrl` are set.
- The card reads `useMediaDownload(mediaId, fileUrl)` itself and applies `opacity: 0.4` (`NOT_DOWNLOADED_OPACITY`) to the thumbnail and the text block when the status isn't `downloaded`. The opacity is set on those two views, not on the whole card, so the button isn't dimmed. `useMediaDownload` accepts an undefined `mediaId` or `fileUrl` and returns `null` in that case.
- **Thumbnails** are drawn with `Image` from `expo-image`, replacing React Native's `Image`. `expo-image` has been a dependency since the project started, so the development build already includes it. The card tries these sources in order:
  1. The saved thumbnail (`getLocalThumbnailUri`), for downloaded items. It's shown with `cachePolicy="memory"`, because a local file doesn't need the disk cache.
  2. The remote `thumbnail` URL, with `cachePolicy="disk"`. `expo-image` keeps a copy on disk regardless of the server's cache headers, so items that aren't downloaded usually also show offline once they've been seen online.
  3. The bundled fallback image.

  If a source fails to load, the card adds it to a list of failed URIs and moves on to the next one, so it can't loop between two broken images.
- A `useEffect` calls `ensureThumbnail` when the item is downloaded but has no saved thumbnail. The effect doesn't set React state itself, so it's fine with the `react-hooks/set-state-in-effect` lint rule.
- It passes `thumbnailUrl={thumbnail}` to `DownloadButton`, which passes it to `startDownload`.

### `src/app/(tabs)/index.tsx`

Passes `mediaId={item.mediaId}` and `fileUrl={item.fileUrl}` to each card.

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- **Not yet tested on a device.**

## Testing on a phone

This change is JavaScript only. `expo-file-system` is already part of the development build, so it doesn't need to be rebuilt. To start the app, follow the steps in [remote-favorites.md](remote-favorites.md#running-it-on-an-android-phone).

1. Tap the download button. The percentage counts up, then the checkmark appears.
2. Start a download, switch to Settings, and come back. The download is still going or finished.
3. Start a download and tap the button again. It cancels, and the down arrow comes back.
4. Turn on airplane mode and tap download. A "Download failed" alert appears.
5. Reload the app. Cards you downloaded still show the checkmark.
6. Tap a checkmark, then **Remove**. The down arrow comes back.
7. If two cards have the same `mediaId`, they change together.
8. **Offline thumbnails:** download an item while online. In Android Settings, open the app's storage and tap **Clear cache**, not "Clear data". Then reopen the app in airplane mode. The downloaded item still shows its real thumbnail. Items that aren't downloaded show the fallback image, because clearing the cache removed their cached copy.
9. **Older downloads:** an item downloaded before thumbnails were saved gets its thumbnail the first time the home tab is opened online. After that, step 8 works for it too.

## Known limitations

- **No offline playback yet.** `getPlaybackUri` gives a player the local file, but there's no player yet. Building one needs `expo-audio` and/or `expo-video`, which contain native code, so a new development build is required.
- **Downloads outlive accounts and favorites.** Signing out doesn't delete them, and neither does removing a favorite. The only way to free the space is the **Remove** button on each card.
- **Killing the app loses the download.** Its leftover `.part` file in the cache is overwritten by the next attempt, or cleaned up by the system.
- **No background downloads.** Downloads run only while the app is running. They aren't resumed after a restart.
- **No storage view.** There's no screen showing how much space downloads use, and no "remove all".
- **Saved thumbnails aren't refreshed.** If the server changes an item's thumbnail, the saved copy stays until the download is removed and downloaded again.
- **Thumbnails of items that aren't downloaded can still disappear offline.** They come from `expo-image`'s disk cache, which the system or the user can clear.
- **Plain files only.** `fileUrl` must point to an actual file. A streaming playlist URL (such as HLS `.m3u8`) would save only the playlist, not the media.
