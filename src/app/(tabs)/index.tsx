import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

import { fetchFavorites, type MediaItem } from "@/data/media";
import { loadCachedFavorites, saveCachedFavorites } from "@/data/favoritesCache";

// `items` may be the saved copy. `error` is set when the latest request failed;
// if a saved copy exists, it is shown with an offline notice instead of the error.
type FavoritesResult =
  | { userId: string; items: MediaItem[]; error: string | null }
  | { userId: string; items: null; error: string };

const OFFLINE_NOTICE = "Can't reach the server. Showing your saved favorites.";

export default function HomeScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [result, setResult] = useState<FavoritesResult | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      // Show the saved list right away, then replace it with fresh data.
      const cached = await loadCachedFavorites(userId);
      if (cancelled) return;
      if (cached) setResult({ userId, items: cached, error: null });

      try {
        const items = await fetchFavorites(userId);
        if (cancelled) return;
        saveCachedFavorites(userId, items);
        setResult({ userId, items, error: null });
      } catch (err: unknown) {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : "Failed to load favorites";
        setResult(cached ? { userId, items: cached, error } : { userId, items: null, error });
      }
    })();

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
  if (result.items === null) {
    return <Centered><Text>{result.error}</Text></Centered>;
  }
  const { items } = result;
  const isOffline = result.error !== null;
  if (items.length === 0) {
    return (
      <Centered>
        <Text>You have no favorites yet.</Text>
        {isOffline && <Text style={styles.offlineText}>{OFFLINE_NOTICE}</Text>}
      </Centered>
    );
  }

  return (
    <ScrollView
      style={globalStyles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {isOffline && <Text style={styles.offlineText}>{OFFLINE_NOTICE}</Text>}
      {items.map((item) => (
        <MediaCard
          key={item.id}
          name={item.fileName}
          author={item.fileAuthor}
          thumbnail={item.fileThumbnailUrl}
          mediaId={item.mediaId}
          fileUrl={item.fileUrl}
          fileJsonId={item.fileJsonId}
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
  offlineText: {
    fontSize: 12,
    color: "#666666",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
});
