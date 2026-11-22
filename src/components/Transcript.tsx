import { memo, useCallback, useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { TranscriptLine } from "@/data/media";

type TranscriptProps = {
  lines: TranscriptLine[];
  currentTime: number; // seconds
  onSeek: (seconds: number) => void;
};

// After the user scrolls by hand, wait this long before following the audio again.
const MANUAL_SCROLL_PAUSE_MS = 4000;
// Keep the current line this far below the top of the list.
const SCROLL_TOP_OFFSET = 24;

// The line being spoken: the last one that has started. Between lines, the previous
// line stays highlighted. -1 before the first line starts.
export function activeLineIndex(lines: TranscriptLine[], currentTime: number) {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= currentTime) index = i;
    else break;
  }
  return index;
}

// A speaker label is any text ending in a colon, e.g. "Narrator:".
// "question", "answer" and "" aren't shown.
function speakerLabel(speaker: string) {
  return speaker.endsWith(":") ? speaker : null;
}

export default function Transcript({ lines, currentTime, onSeek }: TranscriptProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lineYs = useRef<number[]>([]);
  const lastManualScroll = useRef(0);
  const active = activeLineIndex(lines, currentTime);

  const handleLineLayout = useCallback((index: number, y: number) => {
    lineYs.current[index] = y;
  }, []);

  // Follow the audio, unless the user scrolled recently.
  useEffect(() => {
    if (active < 0) return;
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_PAUSE_MS) return;
    const y = lineYs.current[active];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_TOP_OFFSET), animated: true });
  }, [active]);

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      onScrollBeginDrag={() => {
        lastManualScroll.current = Date.now();
      }}
      onMomentumScrollEnd={() => {
        lastManualScroll.current = Date.now();
      }}
    >
      {lines.map((line, index) => (
        <Line
          key={line.id}
          index={index}
          line={line}
          isActive={index === active}
          onSeek={onSeek}
          onLineLayout={handleLineLayout}
        />
      ))}
    </ScrollView>
  );
}

type LineProps = {
  index: number;
  line: TranscriptLine;
  isActive: boolean;
  onSeek: (seconds: number) => void;
  onLineLayout: (index: number, y: number) => void;
};

// Memoized so only the lines whose highlight changes re-render while the audio plays.
// The callbacks must be stable (useCallback) for this to work.
const Line = memo(function Line({ index, line, isActive, onSeek, onLineLayout }: LineProps) {
  const label = speakerLabel(line.speaker);
  const text = line.target.trim();

  return (
    <Pressable
      onPress={() => onSeek(line.start)}
      onLayout={(event) => onLineLayout(index, event.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityHint="Plays from this line"
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      {label ? <Text style={styles.speaker}>{label}</Text> : null}
      <Text style={[styles.text, isActive && styles.textActive]}>{text}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 48,
  },
  line: {
    marginBottom: 28,
  },
  pressed: {
    opacity: 0.6,
  },
  speaker: {
    fontSize: 17,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 4,
  },
  text: {
    fontSize: 22,
    lineHeight: 30,
    color: "#A1A1A6",
  },
  textActive: {
    color: "#000000",
  },
});
