import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { showToast } from "@/components/feedback/Toast";
import {
  ATTENDING_REPLY,
  bodyLines,
  formatPinnedRange,
  isHappeningNow,
  type MessageLink,
  type PinnedMessage,
} from "@/data/pinnedMessages";

// Opens a link with the phone (e.g. the Zoom app or the browser). canOpenURL isn't used:
// on Android 11+ it says no for apps not listed in <queries>.
function openLink(url: string) {
  let valid = true;
  try {
    new URL(url); // Throws for a malformed URL.
  } catch {
    valid = false;
  }
  if (!valid) {
    showToast("Couldn't open this link.");
    return;
  }
  Linking.openURL(url).catch((err: unknown) => {
    console.warn("Couldn't open link", err);
    showToast("Couldn't open this link.");
  });
}

const linkLabel = (link: MessageLink) => (link.note ? `${link.text} · ${link.note}` : link.text);

type Props = {
  message: PinnedMessage;
  now: number;
  // Whether the user has answered "I'll be there!", and whether a request is running.
  replied: boolean;
  busy: boolean;
  onToggleReply: () => void;
};

// One pinned message. Its links show only once the user has said "I'll be there!"
// (see docs/pinned-messages.md).
export default function PinnedCard({ message, now, replied, busy, onToggleReply }: Props) {
  const range = message.pinnedRange;
  const live = range !== null && isHappeningNow(range, now);

  return (
    <View style={styles.card}>
      {range && (
        <View style={styles.whenRow}>
          {live && (
            <View style={styles.nowTag}>
              <Text style={styles.nowText}>Now</Text>
            </View>
          )}
          <Text style={styles.when}>{formatPinnedRange(range, now)}</Text>
        </View>
      )}
      {bodyLines(message.body).map((line, index) =>
        line.heading ? (
          <Text
            key={index}
            style={[styles.heading, line.level >= 3 && styles.headingSmall]}
            accessibilityRole="header"
          >
            {line.text}
          </Text>
        ) : (
          <Text key={index} style={styles.text}>
            {line.text}
          </Text>
        ),
      )}
      {message.displayName ? <Text style={styles.author}>{message.displayName}</Text> : null}
      {range && (
        <Pressable
          onPress={onToggleReply}
          disabled={busy}
          accessibilityRole="switch"
          accessibilityLabel={ATTENDING_REPLY}
          accessibilityHint={replied ? "Removes your reply" : "Sends a reply"}
          accessibilityState={{ checked: replied, busy, disabled: busy }}
          style={({ pressed }) => [
            styles.reply,
            replied ? styles.replyOn : styles.replyOff,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={replied ? "#FFFFFF" : "#0A84FF"} />
          ) : (
            <Text style={[styles.replyText, replied && styles.replyTextOn]}>
              {replied ? `✓ ${ATTENDING_REPLY}` : ATTENDING_REPLY}
            </Text>
          )}
        </Pressable>
      )}
      {range && replied && message.links.length > 0 && (
        <View style={styles.linksRow}>
          {message.links.map((link) => (
            <Pressable
              key={link.id}
              onPress={() => openLink(link.url)}
              hitSlop={4}
              accessibilityRole="link"
              accessibilityLabel={link.note ? `${link.text}, ${link.note}` : link.text}
              accessibilityHint="Opens the link"
              style={({ pressed }) => [styles.linkPill, pressed && styles.pressed]}
            >
              <Text style={styles.linkText} numberOfLines={1}>
                {linkLabel(link)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F2F2F7",
    gap: 6,
  },
  whenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  when: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0A84FF",
  },
  nowTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#34C759",
  },
  nowText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: "#000000",
  },
  headingSmall: {
    fontSize: 17,
    lineHeight: 22,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    color: "#1C1C1E",
  },
  author: {
    marginTop: 4,
    fontSize: 13,
    color: "#6C6C70",
  },
  // "I'll be there!": outlined blue until the user replies, then filled green.
  reply: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  replyOff: {
    borderColor: "#0A84FF",
    backgroundColor: "#FFFFFF",
  },
  replyOn: {
    borderColor: "#34C759",
    backgroundColor: "#34C759",
  },
  replyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A84FF",
  },
  replyTextOn: {
    color: "#FFFFFF",
  },
  linksRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  linkPill: {
    minHeight: 36,
    maxWidth: "100%",
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#0A84FF",
    justifyContent: "center",
  },
  linkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.6,
  },
});
