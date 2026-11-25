import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/expo";
import { globalStyles } from "@/styles/global";
import Icon from "@/components/Icon";
import MediaCard from "@/components/MediaCard";
import StatusBanner, { type LoadProblem } from "@/components/StatusBanner";
import { isOfflineError } from "@/data/networkErrors";

import { fetchFavorites, type MediaItem } from "@/data/media";
import { loadCachedFavorites, saveCachedFavorites } from "@/data/favoritesCache";
import { syncDownloads, useDownloadedItems, type DownloadedItem } from "@/data/mediaDownloads";

// `items` may be the saved copy. `problem` says why the latest request failed (offline or
// another failure); a saved copy is then shown with a StatusBanner, and with no saved copy
// the screen explains the problem with a Try again button.
type FavoritesResult =
  | { userId: string; items: MediaItem[]; problem: LoadProblem | null }
  | { userId: string; items: null; problem: LoadProblem };
// Coming back to the app refreshes the list at most this often.
const FOREGROUND_REFRESH_MS = 30_000;

export default function HomeScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [result, setResult] = useState<FavoritesResult | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  // Every lesson on the phone; the ones not in the list are shown in their own section.
  const downloads = useDownloadedItems();
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
      setResult({ userId: uid, items, problem: null });
      syncDownloads(items);
    } catch (err: unknown) {
      if (currentUserId.current !== uid) return;
      console.warn("Couldn't load favorites", err);
      const problem: LoadProblem = isOfflineError(err) ? "offline" : "failed";
      setResult((previous) =>
        previous?.userId === uid && previous.items
          ? { userId: uid, items: previous.items, problem }
          : { userId: uid, items: null, problem },
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
      if (cached) setResult({ userId, items: cached, problem: null });
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
    return (
      <LoadFailed problem={result.problem} refreshing={refreshing} onRetry={onRefresh} />
    );
  }
  const { items, problem } = result;
  const favoriteIds = new Set(items.map((item) => item.mediaId));
  const leftovers = downloads.filter((download) => !favoriteIds.has(download.mediaId));
  if (items.length === 0 && leftovers.length === 0) {
    return (
      <Centered>
        <Text>You have no favorites yet.</Text>
        {problem && (
          <View style={styles.emptyBanner}>
            <StatusBanner kind={problem} />
          </View>
        )}
      </Centered>
    );
  }

  return (
    <ScrollView
      style={globalStyles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {problem && <StatusBanner kind={problem} />}
      {items.length === 0 && <Text style={styles.noFavorites}>You have no favorites yet.</Text>}
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
          mediaSlug={item.fileSlug}
        />
      ))}
      {leftovers.length > 0 && <NotInFavorites items={leftovers} />}
    </ScrollView>
  );
}

// Downloads whose lesson left the favorites list. They stay on the phone until the user
// removes them, and still play offline.
function NotInFavorites({ items }: { items: DownloadedItem[] }) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Not in favorites anymore
        </Text>
        <Text style={styles.sectionMessage}>
          {"Still on this phone. Remove them when you're done."}
        </Text>
      </View>
      {items.map((item) => (
        <MediaCard
          key={`download-${item.mediaId}`}
          name={item.fileName ?? `Lesson ${item.mediaId}`}
          author={item.fileAuthor ?? ""}
          thumbnail={item.thumbnailUrl ?? undefined}
          mediaId={item.mediaId}
          mediaSlug={item.fileSlug}
          fileUrl={item.fileUrl}
          fileJsonId={item.fileJsonId}
          updatedAtOfMedia={item.updatedAtOfMedia}
          notInFavorites
        />
      ))}
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={[globalStyles.container, styles.centered]}>{children}</View>;
}

// Shown when the list couldn't load and there's no saved copy to fall back on.
function LoadFailed({
  problem,
  refreshing,
  onRetry,
}: {
  problem: LoadProblem;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const offline = problem === "offline";
  return (
    <Centered>
      <Icon name={offline ? "wifiOff" : "info"} size={40} color="#8E8E93" />
      <Text style={styles.failedTitle} accessibilityRole="header">
        {offline ? "You're offline" : "Couldn't load your favorites"}
      </Text>
      <Text style={styles.failedMessage}>
        {offline
          ? "Connect to the internet to load your favorites."
          : "Please try again in a moment."}
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityState={{ busy: refreshing }}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        {refreshing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.retryText}>Try again</Text>
        )}
      </Pressable>
    </Centered>
  );
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
  emptyBanner: {
    alignSelf: "stretch",
    marginTop: 16,
  },
  noFavorites: {
    fontSize: 15,
    color: "#6C6C70",
    textAlign: "center",
    marginTop: 16,
  },
  sectionHeader: {
    marginTop: 8,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#C6C6C8",
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000000",
  },
  sectionMessage: {
    fontSize: 15,
    lineHeight: 20,
    color: "#6C6C70",
  },
  failedTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
    textAlign: "center",
  },
  failedMessage: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    color: "#6C6C70",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    minWidth: 140,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
});
