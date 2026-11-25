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
import { showToast } from "@/components/feedback/Toast";
import { isOfflineError } from "@/data/networkErrors";
import {
  ATTENDING_REPLY,
  attendingReplyIds,
  deleteReply,
  fetchPinnedMessages,
  sendReply,
  visiblePinned,
  type PinnedMessage,
} from "@/data/pinnedMessages";
import { globalStyles } from "@/styles/global";
import {
  attendingEvents,
  cancelEventReminder,
  eventFor,
  remindAfterReply,
  syncEventReminders,
} from "@/notifications/eventReminders";

// The signed-in user's pinned messages, loaded fresh each time the tab is opened.
// Online only. See docs/pinned-messages.md.

type Problem = "offline" | "failed";

type State =
  | { userId: string; messages: PinnedMessage[]; problem: Problem | null; loadedAt: number }
  | { userId: string; messages: null; problem: Problem; loadedAt: number };

// The user's own "I'll be there!" state, set right after a send or remove so the button
// changes at once. Dropped when a reload from the server agrees.
type Overrides = { userId: string; values: Record<number, boolean> };

const OFFLINE_TOAST = "You're offline. Try again when you're connected.";

const PROBLEM_TEXT: Record<Problem, string> = {
  offline: "You're offline. Pull down to try again.",
  failed: "Couldn't load pinned messages. Pull down to try again.",
};

export default function PinnedScreen() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [state, setState] = useState<State | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController | null>(null);
  const [overrides, setOverrides] = useState<Overrides | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  // Read synchronously, so a fast double tap can't start two requests.
  const busyRef = useRef(new Set<number>());
  // The newest list from the server, for a remove that has to wait for a reload.
  const latestMessages = useRef<PinnedMessage[] | null>(null);

  // Resolves with the fresh list, or null if it failed or a newer load replaced it.
  const load = useCallback(async (uid: string): Promise<PinnedMessage[] | null> => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const messages = await fetchPinnedMessages(uid, controller.signal);
      if (controller.signal.aborted) return null;
      latestMessages.current = messages;
      setState({ userId: uid, messages, problem: null, loadedAt: Date.now() });
      // Reminders 30 minutes before the events this user is going to.
      void syncEventReminders(uid, attendingEvents(messages, uid));
      // Forget local states the server now agrees with.
      setOverrides((previous) => {
        if (!previous || previous.userId !== uid) return previous;
        const values = { ...previous.values };
        for (const message of messages) {
          const onServer = attendingReplyIds(message, uid).length > 0;
          if (values[message.id] === onServer) delete values[message.id];
        }
        return { userId: uid, values };
      });
      return messages;
    } catch (err) {
      if (controller.signal.aborted) return null;
      console.warn("Couldn't load pinned messages", err);
      const problem: Problem = isOfflineError(err) ? "offline" : "failed";
      // Keep the list from an earlier load of the same user, with a note on top.
      setState((previous) =>
        previous?.userId === uid && previous.messages
          ? { ...previous, problem }
          : { userId: uid, messages: null, problem, loadedAt: Date.now() },
      );
      return null;
    }
  }, []);

  const setBusy = useCallback((id: number, busy: boolean) => {
    if (busy) busyRef.current.add(id);
    else busyRef.current.delete(id);
    setBusyIds(new Set(busyRef.current));
  }, []);

  const setOverride = useCallback((uid: string, id: number, replied: boolean) => {
    setOverrides((previous) => ({
      userId: uid,
      values: { ...(previous?.userId === uid ? previous.values : {}), [id]: replied },
    }));
  }, []);

  // Sends "I'll be there!", or removes the user's "I'll be there!" replies (only those).
  const toggleReply = useCallback(
    async (message: PinnedMessage, replied: boolean) => {
      if (!userId || busyRef.current.has(message.id)) return;
      setBusy(message.id, true);
      try {
        if (!replied) {
          try {
            await sendReply(message.id, userId, ATTENDING_REPLY);
          } catch (err) {
            console.warn("Couldn't send the reply", err);
            showToast(isOfflineError(err) ? OFFLINE_TOAST : "Couldn't send your reply. Try again.");
            return;
          }
          setOverride(userId, message.id, true);
          // May ask for notification permission the first time.
          const reminder = await remindAfterReply(userId, eventFor(message));
          showToast(
            reminder === "no-permission"
              ? "Reply sent. Turn on notifications to get a reminder."
              : "Reply sent",
          );
          void load(userId);
          return;
        }

        // A reply sent this session has no id yet: reload to get it.
        let ids = attendingReplyIds(message, userId);
        if (ids.length === 0) {
          const fresh = (await load(userId)) ?? latestMessages.current ?? [];
          const current = fresh.find((item) => item.id === message.id);
          ids = current ? attendingReplyIds(current, userId) : [];
        }
        if (ids.length === 0) {
          showToast("Couldn't remove your reply. Try again.");
          return;
        }
        const results = await Promise.allSettled(ids.map((id) => deleteReply(id, userId)));
        const failed = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failed) {
          console.warn("Couldn't remove the reply", failed.reason);
          showToast(
            isOfflineError(failed.reason) ? OFFLINE_TOAST : "Couldn't remove your reply. Try again.",
          );
        } else {
          setOverride(userId, message.id, false);
          void cancelEventReminder(message.id);
          showToast("Reply removed");
        }
        void load(userId);
      } finally {
        setBusy(message.id, false);
      }
    },
    [userId, load, setBusy, setOverride],
  );

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
      {visible.map((message) => {
        const local = overrides?.userId === userId ? overrides.values[message.id] : undefined;
        const replied = local ?? attendingReplyIds(message, userId).length > 0;
        return (
          <PinnedCard
            key={message.id}
            message={message}
            now={state.loadedAt}
            replied={replied}
            busy={busyIds.has(message.id)}
            onToggleReply={() => void toggleReply(message, replied)}
          />
        );
      })}
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
