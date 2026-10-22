import { ScrollView } from "react-native";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

import { mediaItems } from "@/data/media";

const item = mediaItems[0];

export default function HomeScreen() {
  return (
    <ScrollView style={globalStyles.container}>
      <MediaCard name={item.fileName} author={item.fileAuthor} />
    </ScrollView>
  );
}
