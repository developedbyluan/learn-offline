import { StyleSheet, Text, View } from "react-native";
import type { TranscriptLine } from "@/data/media";
import { activeLineIndex, HiddenAnswer, isAnswerHidden } from "@/components/Transcript";
import { lineEnd } from "@/hooks/usePlayRange";

const FONT_SIZE = 20;
const LINE_HEIGHT = 27;
// Not fully opaque: the blur fallback draws it as a text shadow, which needs some transparency.
const HIDDEN_COLOR = "rgba(255, 255, 255, 0.9)";

type Props = {
  lines: TranscriptLine[];
  currentTime: number;
  duration: number;
};

// The line being spoken, drawn over fullscreen video like a subtitle, with its speaker:
// a Q or A badge for questions and answers, or a label such as "Narrator:" above the line.
// Nothing shows between lines. Answers stay blurred until they're spoken.
export default function SubtitleOverlay({ lines, currentTime, duration }: Props) {
  const index = activeLineIndex(lines, currentTime);
  if (index < 0 || currentTime >= lineEnd(lines, index, duration)) return null;

  const line = lines[index];
  const text = line.target.trim();
  if (!text) return null;
  const hidden = isAnswerHidden(line, currentTime);
  const badge = line.speaker === "question" ? "Q" : line.speaker === "answer" ? "A" : null;
  const label = line.speaker.endsWith(":") ? line.speaker : null;

  return (
    <View style={styles.box} pointerEvents="none" accessibilityLiveRegion="polite">
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {badge && (
          <View
            style={[styles.badge, badge === "Q" ? styles.badgeQuestion : styles.badgeAnswer]}
            accessibilityLabel={badge === "Q" ? "Question" : "Answer"}
          >
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        <View style={styles.textBox}>
          {hidden ? (
            <View accessible accessibilityLabel="Hidden answer">
              <HiddenAnswer
                text={text}
                fontSize={FONT_SIZE}
                lineHeight={LINE_HEIGHT}
                color={HIDDEN_COLOR}
              />
            </View>
          ) : (
            <Text style={styles.text}>{text}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: "center",
    maxWidth: "80%",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    gap: 4,
    overflow: "hidden",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#C7C7CC",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  badgeQuestion: {
    backgroundColor: "#0A84FF",
  },
  badgeAnswer: {
    backgroundColor: "#34C759",
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  textBox: {
    flexShrink: 1,
  },
  text: {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: "#FFFFFF",
    fontWeight: "500",
  },
});
