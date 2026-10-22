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
    <View>
      <Image
        source={showFallback ? fallbackThumbnail : { uri: thumbnail }}
        style={{ width: 100, height: 100 }}
        onError={() => setFailedUrl(thumbnail ?? null)}
      />
      <View>
        <Text>{name}</Text>
        <Text>{author}</Text>
      </View>
      // TODO: download button
    </View>
  );
}
