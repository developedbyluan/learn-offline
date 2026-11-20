import { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";
import { globalStyles } from "@/styles/global";

// Placeholder icon. Swap the names here once the icon is decided.
const DOWNLOAD_ICON = { ios: "arrow.down.circle", android: "download", web: "download" } as const;

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
          <SymbolView
            name={DOWNLOAD_ICON}
            size={24}
            tintColor="#000000"
            fallback={<Text>↓</Text>}
          />
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
