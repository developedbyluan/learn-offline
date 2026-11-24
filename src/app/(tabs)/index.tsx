import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/expo";
import { globalStyles } from "@/styles/global";
import MediaCard from "@/components/MediaCard";

import { fetchFavorites, type MediaItem } from "@/data/media";
import { loadCachedFavorites, saveCachedFavorites } from "@/data/favoritesCache";
import { syncDownloads } from "@/data/mediaDownloads";

// `items` may be the saved copy. `error` is set when the latest request failed;
// if a saved copy exists, it is shown with an offline notice instead of the error.
type FavoritesResult =
  | { userId: string; items: MediaItem[]; error: string | null }
  | { userId: string; items: null; error: string };

const OFFLINE_NOTICE = "Can't reach the server. Showing your saved favorites.";
// Coming back to the app refreshes the list at most this often.
const FOREGROUND_REFRESH_MS = 30_000;

export default function HomeScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [result, setResult] = useState<FavoritesResult | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  // Only read in effects and callbacks.
  const currentUserId = useRef(userId);
  const lastFetchAt = useRef(0);

  useEffect(() => {
    currentUserId.current = userId;
  }, [userId]);

  // Fetches the latest list, saves it for offline use, and updates outdated downloads.
  // If the request fails, the list on screen (saved or fresh) stays, with the offline notice.
  const fetchFresh = useCallback(async (uid: string) => {
    lastFetchAt.current = Date.now();
    try {
      const items = await fetchFavorites(uid);
      if (currentUserId.current !== uid) return;
      saveCachedFavorites(uid, items);
      setResult({ userId: uid, items, error: null });
      syncDownloads(items);
    } catch (err: unknown) {
      if (currentUserId.current !== uid) return;
      const error = err instanceof Error ? err.message : "Failed to load favorites";
      setResult((previous) =>
        previous?.userId === uid && previous.items
          ? { userId: uid, items: previous.items, error }
          : { userId: uid, items: null, error },
      );
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      // Show the saved list right away, then replace it with fresh data.
      const cached = await loadCachedFavorites(userId);
      if (cancelled) return;
      if (cached) setResult({ userId, items: cached, error: null });
      await fetchFresh(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, fetchFresh]);

  // Refresh when the app comes back to the foreground, so server updates are noticed.
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastFetchAt.current > FOREGROUND_REFRESH_MS) {
        void fetchFresh(userId);
      }
    });
    return () => subscription.remove();
  }, [userId, fetchFresh]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await fetchFresh(userId);
    } finally {
      setRefreshing(false);
    }
  }, [userId, fetchFresh]);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
          updatedAtOfMedia={item.updatedAtOfMedia}
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
