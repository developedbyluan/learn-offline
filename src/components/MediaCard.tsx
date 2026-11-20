import { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";
import { globalStyles } from "@/styles/global";
import DownloadIcon from "@/components/DownloadIcon";

type MediaCardProps = {
  name: string;
  author: string;
  thumbnail?: string;
  mediaId?: number;
  mediaSlug?: string;
  onDownload?: () => void;
};

export default function MediaCard({
  name,
  author,
  thumbnail,
  mediaId,
  mediaSlug,
  onDownload,
}: MediaCardProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFallback = !thumbnail || failedUrl === thumbnail;

  return (
    <View>
      <View style={{ width: "100%", aspectRatio: 16 / 9 }}>
        <Image
          source={showFallback ? fallbackThumbnail : { uri: thumbnail }}
          onError={() => setFailedUrl(thumbnail ?? null)}
          resizeMode="contain"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
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
  downloadButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.5,
  },
});
