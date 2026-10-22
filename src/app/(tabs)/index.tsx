import { Text, View, ScrollView } from "react-native";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

export default function HomeScreen() {
  return (
    <ScrollView style={globalStyles.container}>
      <MediaCard />
    </ScrollView>
  );
}
