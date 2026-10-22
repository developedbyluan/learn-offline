import { View, Text } from "react-native";
import { Link } from "expo-router";

type MediaCardProps = {
  title: string;
  author: string;
};

export default function MediaCard({ title, author }: MediaCardProps) {
  return (
    <View>
      // TODO: thumbnail image
      <Text>{title}</Text>
      <Text>{author}</Text>
      // TODO: download button
      <Link href="/settings">Go to Settings</Link>
    </View>
  );
}
