import { View, Text } from "react-native";
import { Link } from "expo-router";

export default function MediaCard() {
  return (
    <View>
      // TODO: thumbnail image
      <Text>How to Say Hello in French</Text>
      <Text>AJ Hoge</Text>
      // TODO: download button
      <Link href="/settings">Go to Settings</Link>
    </View>
  );
}
