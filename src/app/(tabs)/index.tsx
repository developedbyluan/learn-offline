import { Text, View, ScrollView } from "react-native";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

// Fake Data
const mediaItems = [
  {
    id: 1,
    title: "How to Say Hello in French",
    author: "AJ Hoge",
  },
  {
    id: 2,
    title: "How to Say Hello in Spanish",
    author: "Maria Lopez",
  },
  {
    id: 3,
    title: "How to Say Hello in German",
    author: "John Doe",
  },
];

export default function HomeScreen() {
  return (
    <ScrollView style={globalStyles.container}>
      {mediaItems.map((item) => (
        <MediaCard
          key={item.id}
          title={item.title}
          author={item.author}
        />
      ))}
    </ScrollView>
  );
}
