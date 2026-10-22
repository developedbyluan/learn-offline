import { View, Text } from "react-native";

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
      // TODO: thumbnail image
      <Text>{name}</Text>
      <Text>{author}</Text>
    </View>
  );
}
