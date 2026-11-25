import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/expo";
import { useFocusEffect } from "expo-router";
import PinnedCard from "@/components/PinnedCard";
import { isOfflineError } from "@/data/networkErrors";
import { fetchPinnedMessages, visiblePinned, type PinnedMessage } from "@/data/pinnedMessages";
import { globalStyles } from "@/styles/global";

// The signed-in user's pinned messages, loaded fresh each time the tab is opened.
// Online only. See docs/pinned-messages.md.

type Problem = "offline" | "failed";

type State =
  | { userId: string; messages: PinnedMessage[]; problem: Problem | null; loadedAt: number }
  | { userId: string; messages: null; problem: Problem; loadedAt: number };

const PROBLEM_TEXT: Record<Problem, string> = {
  offline: "You're offline. Pull down to try again.",
  failed: "Couldn't load pinned messages. Pull down to try again.",
};

export default function PinnedScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [state, setState] = useState<State | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (uid: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const messages = await fetchPinnedMessages(uid, controller.signal);
      if (controller.signal.aborted) return;
      setState({ userId: uid, messages, problem: null, loadedAt: Date.now() });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("Couldn't load pinned messages", err);
      const problem: Problem = isOfflineError(err) ? "offline" : "failed";
      // Keep the list from an earlier load of the same user, with a note on top.
      setState((previous) =>
        previous?.userId === uid && previous.messages
          ? { ...previous, problem }
          : { userId: uid, messages: null, problem, loadedAt: Date.now() },
      );
    }
  }, []);

  // Reload whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      if (userId) void load(userId);
    }, [userId, load]),
  );

  useEffect(() => () => request.current?.abort(), []);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await load(userId);
    } finally {
      setRefreshing(false);
    }
  }, [userId, load]);

  if (!isLoaded) {
    return <Centered><ActivityIndicator /></Centered>;
  }
  if (!userId) {
    return <Centered><Text style={styles.message}>Sign in to see pinned messages.</Text></Centered>;
  }
  if (!state || state.userId !== userId) {
    return <Centered><ActivityIndicator /></Centered>;
  }

  const visible = state.messages ? visiblePinned(state.messages, state.loadedAt) : [];
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />;

  return (
    <ScrollView
      style={globalStyles.container}
      contentContainerStyle={[styles.content, visible.length === 0 && styles.contentEmpty]}
      refreshControl={refreshControl}
    >
      {state.problem && (
        <View style={styles.problem} accessible accessibilityRole="alert">
          <Text style={styles.problemText}>{PROBLEM_TEXT[state.problem]}</Text>
          {state.messages === null && (
            <Pressable
              onPress={() => void onRefresh()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      )}
      {state.messages !== null && visible.length === 0 && (
        <Text style={styles.message}>No pinned messages right now.</Text>
      )}
      {visible.map((message) => (
        <PinnedCard key={message.id} message={message} now={state.loadedAt} />
      ))}
    </ScrollView>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={[globalStyles.container, styles.centered]}>{children}</View>;
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
  },
  contentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    fontSize: 15,
    color: "#6C6C70",
    textAlign: "center",
  },
  problem: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
  },
  problemText: {
    fontSize: 15,
    lineHeight: 20,
    color: "#3A3A3C",
    textAlign: "center",
  },
  retry: {
    minWidth: 140,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.6,
  },
});
