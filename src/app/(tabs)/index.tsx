import { ScrollView } from "react-native";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

import { mediaItems } from "@/data/media";

export default function HomeScreen() {
  return (
    <ScrollView style={globalStyles.container}>
    {mediaItems.map((item) => (
      <MediaCard
        key={item.id}
        name={item.fileName}
        author={item.fileAuthor}
        thumbnail={item.fileThumbnailUrl}
      />
    ))}
    </ScrollView>
  );
}
