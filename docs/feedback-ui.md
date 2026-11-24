# In-app messages: toast and confirm dialog

The app doesn't use the system alert (`Alert.alert`). It looked out of place, and it showed raw system errors. Instead there are two small in-app components, both drawn from plain React Native, so **no native build is needed**.

| | Use for | Looks like |
| --- | --- | --- |
| **Toast**: `showToast(message)` | Errors and short notices that need no answer | A dark rounded bar (`#1C1C1E`) near the bottom, above the tab bar, with an info icon and white text. It fades and slides in, hides itself after 4 s, and a tap hides it right away. |
| **Confirm dialog**: `await confirm({...})` | Questions with a yes/no answer, e.g. "Remove download?" | A white rounded card (radius 16, max width 340) over a dim backdrop, with a title, an optional gray message, and two equal buttons: gray **Cancel**, and a red (`destructive`) or blue confirm button. |

## Using them

```ts
import { showToast } from "@/components/feedback/Toast";
import { confirm } from "@/components/feedback/ConfirmDialog";

showToast("Couldn't remove this download. Please try again.");

const ok = await confirm({
  title: "Remove download?",
  message: name,
  confirmText: "Remove",
  destructive: true, // red button
});
if (ok) deleteDownload(mediaId, fileUrl);
```

- Both work from anywhere, even outside React components. They're small module stores, like the ones in `mediaDownloads.ts`.
- `<ToastHost />` and `<DialogHost />` are mounted once in [src/app/_layout.tsx](../src/app/_layout.tsx).
- **Toast:**
  - A new toast replaces the one on screen.
  - It never blocks taps on the screen behind it.
  - Screen readers announce it.
- **Confirm dialog:**
  - `confirm()` resolves `true` on confirm and `false` on cancel.
  - Cancel, a tap on the backdrop and Android back all count as cancel.
  - Opening a new dialog cancels one that's still open.
  - The card is marked modal for screen readers.

## Download error messages

`DownloadButton` turns a failed download into one of two friendly messages:

- **"You're offline. Connect to the internet to download this lesson."** This shows when the error text looks like a network failure. It must match `unable to resolve host`, `network`, `offline`, `internet`, `timeout`/`timed out`, `failed to connect` or `connection`.
- **"Couldn't download this lesson. Please try again."** This shows for any other failure, for example a broken URL or a bad transcript.

The raw error goes to `console.warn`, for debugging. The app has no network-status module (`expo-network` would need a native build), so the error text is the only signal. The check is `isOfflineError` in `src/data/networkErrors.ts`, which the favorites screen also uses for its offline banner (see [remote-favorites.md](remote-favorites.md)). If an offline error ever shows the generic message, add its wording to `OFFLINE_PATTERN` there.

## Files

| File | What it does |
| --- | --- |
| `src/components/feedback/Toast.tsx` (new) | `showToast` and `ToastHost` |
| `src/components/feedback/ConfirmDialog.tsx` (new) | `confirm` and `DialogHost` (RN `Modal`, fade) |
| `src/app/_layout.tsx` | Mounts both hosts |
| `src/components/DownloadButton.tsx` | Uses them instead of `Alert.alert`. Adds `downloadErrorMessage` |
| `src/components/Icon.tsx` | Adds `info` (`info.circle` / Material `info`) |

## Testing on a phone

1. **Airplane mode,** then tap download: the toast says "You're offline…". It hides after about 4 s, or when tapped, and the button goes back to the down arrow.
2. **Tap a downloaded item's checkmark:** the custom dialog appears. Cancel, a backdrop tap and Android back keep the download, and Remove deletes it.
3. **While a toast shows,** the list still scrolls and taps work. The toast sits above the tab bar and the Android navigation bar.
4. **TalkBack** reads the toast, and keeps focus inside the dialog.
