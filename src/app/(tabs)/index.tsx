import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

import { fetchFavorites, type MediaItem } from "@/data/media";

type FavoritesResult =
  | { userId: string; items: MediaItem[]; error: null }
  | { userId: string; items: null; error: string };

export default function HomeScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [result, setResult] = useState<FavoritesResult | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchFavorites(userId)
      .then((items) => {
        if (!cancelled) setResult({ userId, items, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const error = err instanceof Error ? err.message : "Failed to load favorites";
          setResult({ userId, items: null, error });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!isLoaded) {
    return <Centered><ActivityIndicator /></Centered>;
  }
  if (!userId) {
    return <Centered><Text>Sign in to see your favorites.</Text></Centered>;
  }
  // Result from a previous user (or none yet) means this user's request is still in flight.
  if (!result || result.userId !== userId) {
    return <Centered><ActivityIndicator /></Centered>;
  }
  if (result.error !== null) {
    return <Centered><Text>{result.error}</Text></Centered>;
  }
  const { items } = result;
  if (items.length === 0) {
    return <Centered><Text>You have no favorites yet.</Text></Centered>;
  }

  return (
    <ScrollView
      style={globalStyles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {items.map((item) => (
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

function Centered({ children }: { children: ReactNode }) {
  return <View style={[globalStyles.container, styles.centered]}>{children}</View>;
}

const styles = StyleSheet.create({
  contentContainer: {
    gap: 32,
    paddingBottom: 32,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
});
