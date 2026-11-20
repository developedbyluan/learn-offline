# Download button on media cards

> **Update:** the button now downloads the media. See [media-downloads.md](media-downloads.md). That change replaced some details on this page:
> - The `onDownload` prop was removed. `MediaCard` takes `mediaId` and `fileUrl` instead, and renders a `DownloadButton`.
> - The `Pressable` moved from `MediaCard` into `DownloadButton`.
> - In `DownloadIcon`, the `IOS_SYMBOL` and `MATERIAL_CODEPOINT` constants became an `ICONS` object with a `download` icon and a `downloaded` icon.

Each favorite on the home tab now has a download button in the bottom-right corner of its card. The button is UI only: tapping it does nothing yet. Downloading the file for offline playback will be added in a later change.

The icon is a circle with a down arrow inside. It's defined in one place so it can be swapped easily.

```
┌──────────────────────────┐
│                          │
│        thumbnail         │
│          16:9            │
│                          │
└──────────────────────────┘
Title of the lesson
Author name            [ ⬇ ]
```

## Files changed

### `src/components/DownloadIcon.tsx` (new)

Draws the icon. Each platform uses its own icon set:

| Platform | Icon set | How it's drawn | Current icon |
| --- | --- | --- | --- |
| iOS | SF Symbols | `SymbolView` from `expo-symbols` | `arrow.down.circle` |
| Android, web | Material Symbols font | A `Text` with the font character | `arrow_circle_down` (code point `0xf181`) |

To change the icon, edit the two constants at the top of the file:

```ts
const IOS_SYMBOL = "arrow.down.circle";
const MATERIAL_CODEPOINT = 0xf181;
```

Browse iOS names in Apple's SF Symbols app. For Android and web, open the icon at fonts.google.com/icons and copy its "Code point".

**Why Android doesn't use `SymbolView`.** At first, Android used `SymbolView` too, and the bottom of the icon was cut off on a phone. On Android, `SymbolView` draws the icon as a character in a `Text` whose line height equals the font size. This font's characters need about 1.2× the font size (its metrics: 960 units per em, ascent 1056, descent 96), so the line is too short. The `Text` also grows with the phone's font size setting, but the box around it doesn't.

`DownloadIcon` draws the same character itself instead:

- no fixed `lineHeight`, so the `Text` gets the font's natural height;
- `allowFontScaling={false}`, so the phone's font size setting doesn't enlarge it;
- `includeFontPadding: false`, and centered in a `size × size` box that doesn't clip.

The font is loaded with `useFonts` from `expo-font`. Until it's ready, an empty box of the same size is shown, so the layout doesn't jump.

**New dependency.** `@expo-google-fonts/material-symbols` was added with `npx expo install`. `expo-symbols` already depended on it, so it was already installed. It's now listed directly because `DownloadIcon` imports it. It's a font file loaded at runtime, so no native rebuild is needed.

### `src/components/MediaCard.tsx`

**New prop.** `MediaCardProps` has an optional `onDownload?: () => void`. The button calls it when tapped. No screen passes it yet, so tapping does nothing.

**Layout.** The title and author used to sit in a plain `View`. Now they share a row with the button:

```tsx
<View style={styles.footer}>
  <View style={styles.textBlock}>
    <Text style={globalStyles.title}>{name}</Text>
    <Text style={styles.authorText}>{author}</Text>
  </View>
  <Pressable
    onPress={onDownload}
    accessibilityRole="button"
    accessibilityLabel={`Download ${name}`}
    hitSlop={8}
    style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}
  >
    <DownloadIcon size={24} color="#000000" />
  </Pressable>
</View>
```

New styles:

| Style | Values | Why |
| --- | --- | --- |
| `footer` | `flexDirection: "row"`, `alignItems: "flex-end"`, `gap: 12` | Puts the button on the right and lines it up with the bottom of the text |
| `textBlock` | `flex: 1` | Long titles wrap instead of pushing the button off the card |
| `downloadButton` | `44 × 44`, content centered | Big enough to tap comfortably |
| `pressed` | `opacity: 0.5` | Dims the icon while it's pressed |

`hitSlop={8}` makes the button respond to taps up to 8 points outside its edges. Screen readers announce it as "Download <title>, button".

The `TODO: download button` comment that marked this spot has been removed.

### `src/app/(tabs)/index.tsx`

No change. When downloading is built, pass the handler from here, where each card's `MediaItem` is available:

```tsx
<MediaCard
  key={item.id}
  name={item.fileName}
  author={item.fileAuthor}
  thumbnail={item.fileThumbnailUrl}
  onDownload={() => downloadMedia(item)} // to be written; uses item.fileUrl
/>
```

## Verification

- `npx tsc --noEmit` passes.
- `npx expo lint` passes.
- On an Android phone, the first version (Android using `SymbolView`) showed the icon with its bottom cut off. The `DownloadIcon` fix hasn't been checked on a device yet.

## Running it on a phone

This change is JavaScript only. `expo-symbols`, `expo-font` and the Material Symbols font are all JavaScript or assets, so the existing development build doesn't need to be rebuilt. To run it, follow the steps in [remote-favorites.md](remote-favorites.md#running-it-on-an-android-phone).

On the home tab, check that:

1. Each card has the full circle-with-arrow icon at its bottom-right, next to the author, with nothing cut off. Check again with the phone's font size set to the largest setting.
2. A long title wraps, and the button stays in place.
3. Pressing the button dims the icon.
4. With TalkBack (Android) or VoiceOver (iOS) on, the button reads as "Download <title>, button".

If Android or web shows a box or a wrong character instead of the icon, `MATERIAL_CODEPOINT` is wrong. If iOS shows nothing, `IOS_SYMBOL` isn't a valid SF Symbol name.

## Known limitations

- Tapping the button does nothing. Nothing is downloaded yet.
- The button has no downloading, downloaded or failed state. The download feature will need to add these.
- The icon color is hardcoded black, like the rest of the app's colors. There's no dark mode.
- The `SymbolView` docs page is marked beta, so its API may change when Expo is updated.
- The icon ignores the phone's font size setting on Android and web. It stays 24 at any setting, which is normal for icons.
