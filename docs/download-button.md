# Download button on media cards

Each favorite on the home tab now has a download button in the bottom-right corner of its card. The button is UI only: tapping it does nothing yet. Downloading the file for offline playback will be added in a later change.

The icon hasn't been chosen yet. The current one is a placeholder, defined in one place so it can be swapped easily.

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

### `src/components/MediaCard.tsx`

This is the only file that changed.

**Placeholder icon.** It's set by a constant at the top of the file:

```ts
// Placeholder icon. Swap the names here once the icon is decided.
const DOWNLOAD_ICON = { ios: "arrow.down.circle", android: "download", web: "download" } as const;
```

The icon is drawn with `SymbolView` from `expo-symbols`, which was already a dependency. Each platform uses its own icon set:

| Platform | Icon set | Current name |
| --- | --- | --- |
| iOS | SF Symbols | `arrow.down.circle` |
| Android | Material Symbols | `download` |
| Web | Material Symbols | `download` |

To change the icon, edit only this constant. Browse names in Apple's SF Symbols app for iOS and on Google's Material Symbols site for Android and web. If a name doesn't exist on a platform, `SymbolView` shows its `fallback` instead, which is a plain `↓` text character.

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
    <SymbolView name={DOWNLOAD_ICON} size={24} tintColor="#000000" fallback={<Text>↓</Text>} />
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
- The button hasn't been checked on a device yet.

## Running it on a phone

This change is JavaScript only. According to the SDK 57 docs, `expo-symbols` is included in Expo Go, and it's already in the project, so the existing development build doesn't need to be rebuilt. To run it, follow the steps in [remote-favorites.md](remote-favorites.md#running-it-on-an-android-phone).

On the home tab, check that:

1. Each card has the icon at its bottom-right, next to the author.
2. A long title wraps, and the button stays in place.
3. Pressing the button dims the icon.
4. With TalkBack (Android) or VoiceOver (iOS) on, the button reads as "Download <title>, button".

If the card shows `↓` instead of an icon, the icon name doesn't exist on that platform. Fix it in `DOWNLOAD_ICON`.

## Known limitations

- Tapping the button does nothing. Nothing is downloaded yet.
- The icon is a placeholder.
- The button has no downloading, downloaded or failed state. The download feature will need to add these.
- The icon color is hardcoded black, like the rest of the app's colors. There's no dark mode.
- The `SymbolView` docs page is marked beta, so its API may change when Expo is updated.
