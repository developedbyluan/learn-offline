import { StyleSheet, Text, View } from "react-native";
import {
  formatPinnedRange,
  isHappeningNow,
  type PinnedMessage,
} from "@/data/pinnedMessages";

// A light reading of the markdown body: lines starting with "#" are headings, the rest is
// text. Blank lines are dropped.
function bodyLines(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = /^(#{1,6})\s*(.*)$/.exec(line);
      return heading
        ? { heading: true, level: heading[1].length, text: heading[2] }
        : { heading: false, level: 0, text: line };
    })
    .filter((line) => line.text);
}

// One pinned message. Links aren't shown yet (see docs/pinned-messages.md).
export default function PinnedCard({ message, now }: { message: PinnedMessage; now: number }) {
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
});
