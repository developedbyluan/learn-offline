import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";
import { globalStyles } from "@/styles/global";
import DownloadButton from "@/components/DownloadButton";
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

  return (
    <View>
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
    </View>
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
});
