# Download updates

Downloaded lessons now **update themselves** when the server has a newer version. Before this change, the phone kept the first copy forever.

This is a JavaScript-only change, so **no new native build is needed**.

## How a change is detected

Each favorite from `GET /favorites/by-user-id/{userId}` has `updatedAtOfMedia`, in **milliseconds** since 1970. For example, `1794320664000` is 2026-11-10 14:24 UTC. In `MediaItem` it's optional, because lists saved by an older app version don't have it.

When an item is downloaded, the app writes a **download record** next to its files:

```
media/media-<mediaId>.meta.json
{ "fileUrl": "...", "fileJsonId": 183, "thumbnailUrl": "...", "updatedAtOfMedia": 1794320664000, "downloadedAt": 1795500000000 }
```

After every successful favorites fetch, `syncDownloads(items)` compares each downloaded item with its record. An item is **outdated** when any of these is true:
- `updatedAtOfMedia` is newer than the record's;
- `fileUrl` changed;
- `fileJsonId` changed;
- `fileThumbnailUrl` changed.

**Items downloaded before this change** have no record. On the first sync, the app writes one from the current values without downloading anything. So updating the app doesn't re-download every lesson, but it also assumes those copies are current.

**This relies on the server.** `updatedAtOfMedia` must change whenever the media file, thumbnail or transcript changes, **including a file re-uploaded to the same URL**. Without that, the app can only catch changed URLs and IDs.

## How an item is updated

Outdated items are queued and updated **one at a time**, in the background. The old copy stays playable the whole time.

1. The card's checkmark turns into a small blue spinner. That's `updating: true` in the download state. Tapping it cancels the update and keeps the old copy.
2. The new transcript is downloaded to the cache (`media-<id>.json.next`) and checked, the same as for a new download.
3. The new media is downloaded next to the old one (`media/media-<id>.next<ext>`).
4. **Swap:**
   - delete the old media, found from the record, so an old extension is deleted correctly;
   - move the new media and transcript into place;
   - download the new thumbnail (best effort);
   - write the new record.
5. The checkmark comes back.

**If anything fails**, for example offline, a bad URL or a bad transcript, the staged files are deleted and the old copy and record stay. The next sync tries again.

**A lesson open in the player is never replaced.** While it's open, the player holds `markInUse(mediaId)`. The queue skips that lesson, and the swap is skipped if the player opened during the download. The next sync updates it once the player is closed.

## When the list refreshes

The home tab fetches favorites:
- when it first loads (shows the saved list, then fetches);
- on **pull-to-refresh**;
- when the **app comes back to the foreground**, at most once every 30 s.

Every successful fetch saves the list for offline use, then calls `syncDownloads`.

## Two bugs this also fixes

Downloaded files are named `media-<mediaId><ext>`. The app now finds the saved file from the **record's** URL, not the latest one:
- **Same extension, new URL:** this used to count as downloaded and play the old file forever. Now it's detected as outdated and updated.
- **New extension** (for example `.mp3` → `.mp4`): this used to show as not downloaded and leave the old file behind. Now the old file keeps playing until the update replaces and deletes it.

## Thumbnails on screen

An update replaces `media-<id>-thumb` at the same path, and expo-image caches images by URI. So the card passes `cacheKey: "<uri>#<version>"`, where `version` is the record's `updatedAtOfMedia`. The new thumbnail then shows without restarting the app.

## Files

| File | What changed |
| --- | --- |
| `src/data/media.ts` | `MediaItem` gains `updatedAtOfMedia?: number`. |
| `src/data/mediaDownloads.ts` | Download records (`readRecord`, `writeRecord`, `savedMediaFile`, `isOutdated`). The `downloaded` state gains `updating` and `version`. New exports: `syncDownloads(items)` and `markInUse(mediaId)`, which returns a release function. There's also an update queue and `updateDownload`. `startDownload` writes the record, and `deleteDownload` stops a running update and deletes the record. `DownloadSource` gains `updatedAtOfMedia`. |
| `src/app/(tabs)/index.tsx` | A `fetchFresh` function, pull-to-refresh (`RefreshControl`), an `AppState` refresh, and `syncDownloads` after each fetch. Passes `updatedAtOfMedia` to the cards. |
| `src/components/MediaCard.tsx` | Passes `updatedAtOfMedia` through. Gives the local thumbnail its versioned `cacheKey`. |
| `src/components/DownloadButton.tsx` | Shows a blue spinner while updating. Tapping cancels the update. |
| `src/app/player.tsx` | Calls `markInUse(mediaId)` while open. |

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- **Not yet tested on a device.**

## Testing on a phone

Use the current development build with `npx expo start`.

1. **Existing downloads aren't re-downloaded** after the app update. Each one gets a `.meta.json`.
2. **Simulate a server update.** In `index.tsx`, temporarily pass `updatedAtOfMedia={item.updatedAtOfMedia ? item.updatedAtOfMedia + 1 : 1}` for one item, then pull to refresh. Its card shows the spinner, then the checkmark. Remove the edit afterwards.
3. **Old copy stays playable:** open that lesson during the update. The old copy plays, and the new one is swapped in at the next refresh after closing.
4. **Failed update:** turn on airplane mode mid-update. The old copy still plays, and the next refresh retries.
5. **Thumbnail change:** after an update with a new `fileThumbnailUrl`, the new image shows right away.
6. **Refresh triggers:** pull-to-refresh works. Leaving the app for 30 s or more and coming back refreshes it.
7. **Real case:** once the fixed Macy's MP4 is uploaded and its `updatedAtOfMedia` changes, the phone updates it by itself, and the seek bar shows its length.

## Known limitations

- **It only works as well as `updatedAtOfMedia`.** A file replaced in storage without updating the database won't be noticed.
- **Downloads from before this change are assumed current.** Remove and re-download one to force a fresh copy.
- **No update while offline.** The next refresh while online catches up.
- **Updates use mobile data too.** There's no Wi-Fi-only setting yet.
- **Saved playback positions stay** after an update. If the new file is shorter, playback starts from the end-of-file rule (finished lessons start over).
