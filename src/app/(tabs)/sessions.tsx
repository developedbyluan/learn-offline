import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@clerk/expo";
import Icon from "@/components/Icon";
import { loadCachedFavorites } from "@/data/favoritesCache";
import { getLocalThumbnailUri } from "@/data/mediaDownloads";
import { getLessonTotals } from "@/data/playTimeDb";
import { globalStyles } from "@/styles/global";
import { formatDuration } from "@/utils/formatDuration";

type LessonRow = {
  mediaId: number;
  name: string;
  thumbnail: string | null;
  totalSeconds: number;
  sessionCount: number;
};

// Listening history: one row per lesson, most listening time first.
export default function SessionsScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Reload every time the tab is shown, so new sessions and deletions appear.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      (async () => {
        try {
          const [totals, favorites] = await Promise.all([
            getLessonTotals(userId),
            loadCachedFavorites(userId),
          ]);
          if (cancelled) return;
          const byMediaId = new Map((favorites ?? []).map((item) => [item.mediaId, item]));
          setRows(
            totals.map((total) => {
              const item = byMediaId.get(total.mediaId);
              return {
                ...total,
                name: item?.fileName ?? `Lesson ${total.mediaId}`,
                thumbnail: getLocalThumbnailUri(total.mediaId) ?? item?.fileThumbnailUrl ?? null,
              };
            }),
          );
          setFailed(false);
        } catch (err) {
          console.warn("Couldn't load listening history", err);
          if (!cancelled) setFailed(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (!isLoaded) return <Centered><ActivityIndicator /></Centered>;
  if (!userId) {
    return <Centered><Text style={styles.emptyMessage}>Sign in to see your listening history.</Text></Centered>;
  }
  if (failed && rows === null) {
    return (
      <EmptyState
        title="Couldn't load your history"
        message="Please close and reopen the app, then try again."
      />
    );
  }
  if (rows === null) return <Centered><ActivityIndicator /></Centered>;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No listening yet"
        message="Play a lesson and your listening time will show up here."
      />
    );
  }

  const grandTotal = rows.reduce((sum, row) => sum + row.totalSeconds, 0);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(row) => String(row.mediaId)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">
            Sessions
          </Text>
          <Text style={styles.grandTotal}>Total {formatDuration(grandTotal)}</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <LessonRowView row={item} />}
    />
  );
}

function LessonRowView({ row }: { row: LessonRow }) {
  const sessions = `${row.sessionCount} ${row.sessionCount === 1 ? "session" : "sessions"}`;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/sessions/[mediaId]",
          params: { mediaId: String(row.mediaId), name: row.name },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${formatDuration(row.totalSeconds)}, ${sessions}`}
      accessibilityHint="Shows each session"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {row.thumbnail ? (
        <Image source={{ uri: row.thumbnail }} style={styles.thumbnail} contentFit="cover" />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={2}>
          {row.name}
        </Text>
        <Text style={styles.stats}>
          <Text style={styles.total}>{formatDuration(row.totalSeconds)}</Text> · {sessions}
        </Text>
      </View>
      <Icon name="chevronRight" size={22} color="#C7C7CC" />
    </Pressable>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Centered>
      <Icon name="history" size={40} color="#8E8E93" />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={[globalStyles.container, styles.centered]}>{children}</View>;
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  listContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000000",
  },
  grandTotal: {
    marginTop: 4,
    fontSize: 15,
    color: "#6C6C70",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  thumbnail: {
    width: 96,
    aspectRatio: 16 / 9,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    backgroundColor: "#E5E5EA",
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  stats: {
    fontSize: 14,
    color: "#6C6C70",
  },
  total: {
    fontWeight: "600",
    color: "#000000",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
    marginLeft: 108,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
    textAlign: "center",
  },
  emptyMessage: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    color: "#6C6C70",
    textAlign: "center",
  },
});
