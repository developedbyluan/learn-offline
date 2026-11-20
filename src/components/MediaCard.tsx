import { useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";
import { globalStyles } from "@/styles/global";
import DownloadButton from "@/components/DownloadButton";
import { useMediaDownload } from "@/data/mediaDownloads";

// Opacity of the thumbnail and text while the media isn't downloaded.
const NOT_DOWNLOADED_OPACITY = 0.4;

type MediaCardProps = {
  name: string;
  author: string;
  thumbnail?: string;
  mediaId?: number;
  mediaSlug?: string;
  fileUrl?: string;
};

export default function MediaCard({
  name,
  author,
  thumbnail,
  mediaId,
  mediaSlug,
  fileUrl,
}: MediaCardProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFallback = !thumbnail || failedUrl === thumbnail;
  const download = useMediaDownload(mediaId, fileUrl);
  // Dim everything except the download button until the file is on the phone.
  // Cards that can't be downloaded (no mediaId or fileUrl) aren't dimmed.
  const dimmed = download !== null && download.status !== "downloaded";
  const contentStyle = dimmed ? styles.dimmed : null;

  return (
    <View>
      <View style={[{ width: "100%", aspectRatio: 16 / 9 }, contentStyle]}>
        <Image
          source={showFallback ? fallbackThumbnail : { uri: thumbnail }}
          onError={() => setFailedUrl(thumbnail ?? null)}
          resizeMode="contain"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <View style={styles.footer}>
        <View style={[styles.textBlock, contentStyle]}>
          <Text style={globalStyles.title}>{name}</Text>
          <Text style={styles.authorText}>{author}</Text>
        </View>
        {mediaId !== undefined && fileUrl ? (
          <DownloadButton mediaId={mediaId} fileUrl={fileUrl} name={name} />
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
