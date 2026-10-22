import { Text, View, ScrollView } from "react-native";
import { globalStyles } from "@/styles/global";

export default function HomeScreen() {
  return (
    <ScrollView style={globalStyles.container}>
      // TODO: component for the media card
      <View>
        // TODO: thumbnail image
        <Text>How to Say Hello in French</Text>
        <Text>AJ Hoge</Text>
        // TODO: download button
      </View>
    </ScrollView>
  );
}
