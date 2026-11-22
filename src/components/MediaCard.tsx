import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";
import { globalStyles } from "@/styles/global";
import DownloadButton from "@/components/DownloadButton";
import { isAudioUrl } from "@/data/media";
import { ensureExtras, getLocalThumbnailUri, useMediaDownload } from "@/data/mediaDownloads";

// Opacity of the thumbnail and text while the media isn't downloaded.
const NOT_DOWNLOADED_OPACITY = 0.4;

type MediaCardProps = {
  name: string;
  author: string;
  thumbnail?: string;
  mediaId?: number;
  mediaSlug?: string;
  fileUrl?: string;
  fileJsonId?: number;
};

export default function MediaCard({
  name,
  author,
  thumbnail,
  mediaId,
  mediaSlug,
  fileUrl,
  fileJsonId,
}: MediaCardProps) {
  const [failedUris, setFailedUris] = useState<string[]>([]);
  const download = useMediaDownload(mediaId, fileUrl);
  // Dim everything except the download button until the file is on the phone.
  // Cards that can't be downloaded (no mediaId or fileUrl) aren't dimmed.
  const dimmed = download !== null && download.status !== "downloaded";
  const contentStyle = dimmed ? styles.dimmed : null;

  // Thumbnail source, in order: the saved copy of a downloaded item, the remote URL
  // (kept in expo-image's disk cache), then the bundled fallback image.
  const localThumbnail = mediaId !== undefined ? getLocalThumbnailUri(mediaId) : null;
  const imageUri = [localThumbnail, thumbnail].find(
    (uri): uri is string => !!uri && !failedUris.includes(uri),
  );

  // Save what a downloaded item is missing: its thumbnail (if an earlier attempt failed),
  // or its transcript (items downloaded before transcripts were saved).
  const needsExtras =
    download?.status === "downloaded" &&
    ((!download.hasThumbnail && !!thumbnail) || !download.hasTranscript);
  useEffect(() => {
    if (needsExtras && mediaId !== undefined && fileUrl && fileJsonId !== undefined) {
      void ensureExtras({ mediaId, fileUrl, fileJsonId, thumbnailUrl: thumbnail });
    }
  }, [needsExtras, mediaId, fileUrl, fileJsonId, thumbnail]);

  // Only downloaded audio opens the player for now.
  const canOpenPlayer =
    download?.status === "downloaded" &&
    !!fileUrl &&
    isAudioUrl(fileUrl) &&
    mediaId !== undefined &&
    fileJsonId !== undefined;

  function openPlayer() {
    if (!canOpenPlayer || mediaId === undefined || !fileUrl || fileJsonId === undefined) return;
    router.push({
      pathname: "/player",
      params: {
        mediaId: String(mediaId),
        fileUrl,
        fileJsonId: String(fileJsonId),
        title: name,
        author,
        ...(thumbnail ? { thumbnail } : {}),
      },
    });
  }

  return (
    // The download button inside handles its own taps, so tapping it doesn't open the player.
    <Pressable
      onPress={openPlayer}
      disabled={!canOpenPlayer}
      accessibilityRole={canOpenPlayer ? "button" : undefined}
      accessibilityLabel={canOpenPlayer ? `Play ${name}` : undefined}
      style={({ pressed }) => pressed && styles.cardPressed}
    >
      <View style={[{ width: "100%", aspectRatio: 16 / 9 }, contentStyle]}>
        <Image
          source={imageUri ? { uri: imageUri } : fallbackThumbnail}
          // Local files don't need the disk cache; remote thumbnails do, for offline use.
          cachePolicy={imageUri && imageUri === localThumbnail ? "memory" : "disk"}
          onError={() => {
            if (imageUri) setFailedUris((uris) => [...uris, imageUri]);
          }}
          contentFit="contain"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <View style={styles.footer}>
        <View style={[styles.textBlock, contentStyle]}>
          <Text style={globalStyles.title}>{name}</Text>
          <Text style={styles.authorText}>{author}</Text>
        </View>
        {mediaId !== undefined && fileUrl && fileJsonId !== undefined ? (
          <DownloadButton
            mediaId={mediaId}
            fileUrl={fileUrl}
            fileJsonId={fileJsonId}
            thumbnailUrl={thumbnail}
            name={name}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  authorText: {
    fontSize: 10,
    color: "#666666",
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  textBlock: {
    flex: 1,
  },
  dimmed: {
    opacity: NOT_DOWNLOADED_OPACITY,
  },
  cardPressed: {
    opacity: 0.7,
  },
});
