import { useState } from "react";
import { View, Text, Image } from "react-native";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";

type MediaCardProps = {
  name: string;
  author: string;
  thumbnail?: string;
  mediaId?: number;
  mediaSlug?: string;
};

export default function MediaCard({
  name,
  author,
  thumbnail,
  mediaId,
  mediaSlug,
}: MediaCardProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFallback = !thumbnail || failedUrl === thumbnail;

  return (
    <View style={{ marginBottom: 32 }}>
      <View style={{ width: "100%", aspectRatio: 16 / 9 }}>
        <Image
          source={showFallback ? fallbackThumbnail : { uri: thumbnail }}
          onError={() => setFailedUrl(thumbnail ?? null)}
          resizeMode="contain"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <View>
        <Text>{name}</Text>
        <Text>{author}</Text>
      </View>
      // TODO: download button
    </View>
  );
}
