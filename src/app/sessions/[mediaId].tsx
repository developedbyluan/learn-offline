import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/expo";
import Icon from "@/components/Icon";
import { showToast } from "@/components/feedback/Toast";
import { deleteSession, getLessonSessions, type PlaySession } from "@/data/playTimeDb";
import { formatDuration } from "@/utils/formatDuration";

const DELETE_WIDTH = 88;

// One lesson's listening sessions, newest first. Swipe a row left to delete it.
export default function LessonSessionsScreen() {
  const params = useLocalSearchParams<{ mediaId: string; name?: string }>();
  const mediaId = Number(params.mediaId);
  const name = params.name || `Lesson ${params.mediaId}`;
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const [sessions, setSessions] = useState<PlaySession[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !Number.isFinite(mediaId)) return;
      let cancelled = false;
      getLessonSessions(userId, mediaId)
        .then((rows) => {
          if (!cancelled) setSessions(rows);
        })
        .catch((err: unknown) => {
          console.warn("Couldn't load sessions", err);
          if (!cancelled) setSessions([]);
        });
      return () => {
        cancelled = true;
      };
    }, [userId, mediaId]),
  );

  const remove = useCallback(async (id: string) => {
    try {
      await deleteSession(id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSessions((current) => current?.filter((session) => session.id !== id) ?? null);
      showToast("Session deleted");
    } catch (err) {
      console.warn("Couldn't delete session", err);
      showToast("Couldn't delete this session. Please try again.");
    }
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: name }} />
      {sessions === null ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyMessage}>No sessions left for this lesson.</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(session) => session.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<Summary sessions={sessions} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => <SessionRow session={item} onDelete={remove} />}
          ListFooterComponent={<Text style={styles.hint}>Swipe left on a session to delete it.</Text>}
        />
      )}
    </View>
  );
}

function Summary({ sessions }: { sessions: PlaySession[] }) {
  const total = sessions.reduce((sum, session) => sum + session.seconds, 0);
  const count = `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTotal}>{formatDuration(total)}</Text>
      <Text style={styles.summaryCount}>{count}</Text>
    </View>
  );
}

function SessionRow({
  session,
  onDelete,
}: {
  session: PlaySession;
  onDelete: (id: string) => void;
}) {
  const started = new Date(session.startedAt);
  const ended = new Date(session.endedAt);
  const date = started.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const range = `${time(started)} – ${time(ended)}`;
  const duration = formatDuration(session.seconds);

  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => onDelete(session.id)}
          accessibilityRole="button"
          accessibilityLabel="Delete session"
          style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}
        >
          <Icon name="delete" size={22} color="#FFFFFF" />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}
    >
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${date}, ${range}, ${duration}`}
        accessibilityActions={[{ name: "delete", label: "Delete session" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") onDelete(session.id);
        }}
      >
        <View style={styles.rowText}>
          <Text style={styles.date}>{date}</Text>
          <Text style={styles.range}>{range}</Text>
        </View>
        <Text style={styles.duration}>{duration}</Text>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyMessage: {
    fontSize: 15,
    color: "#6C6C70",
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 32,
  },
  summary: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  summaryTotal: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000000",
  },
  summaryCount: {
    marginTop: 2,
    fontSize: 15,
    color: "#6C6C70",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  date: {
    fontSize: 16,
    fontWeight: "500",
    color: "#000000",
  },
  range: {
    fontSize: 14,
    color: "#6C6C70",
  },
  duration: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    fontVariant: ["tabular-nums"],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
    marginLeft: 20,
  },
  deleteAction: {
    width: DELETE_WIDTH,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  hint: {
    marginTop: 16,
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
  },
});
