import { View, Text, Image } from "react-native";

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
  return (
    <View>
      <Image
        source={{ uri: thumbnail ?? "" }}
        style={{ width: 100, height: 100 }}
      />
      <View>
        <Text>{name}</Text>
        <Text>{author}</Text>
      </View>
      // TODO: download button
    </View>
  );
}
