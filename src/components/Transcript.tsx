import { memo, useCallback, useEffect, useRef } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TranscriptLine } from "@/data/media";
import type { PlayRange } from "@/hooks/usePlayRange";

type TranscriptProps = {
  lines: TranscriptLine[];
  currentTime: number; // seconds
  onSeek: (seconds: number) => void;
  fontSize: number;
  lineHeight: number;
  // The repeat range, if any: its lines get a blue bar.
  range?: PlayRange | null;
  // Long-pressing a line (while a range is on) adds it to the range.
  onLineLongPress?: (index: number) => void;
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

// An answer line is readable only while it's playing (start <= time < end), so the
// learner can try to answer first. Lines with bad timing (end <= start) stay hidden.
export function isAnswerHidden(line: TranscriptLine, currentTime: number) {
  if (line.speaker !== "answer") return false;
  const playing =
    line.end > line.start && currentTime >= line.start && currentTime < line.end;
  return !playing;
}

// Whether a line overlaps the repeat range. A line with broken timing counts from its start.
export function lineInRange(line: TranscriptLine, range: PlayRange) {
  const end = line.end > line.start ? line.end : line.start;
  return line.start < range.end && end >= range.start;
}

// A speaker label is any text ending in a colon, e.g. "Narrator:".
// "question", "answer" and "" aren't shown.
function speakerLabel(speaker: string) {
  return speaker.endsWith(":") ? speaker : null;
}

export default function Transcript({
  lines,
  currentTime,
  onSeek,
  fontSize,
  lineHeight,
  range = null,
  onLineLongPress,
}: TranscriptProps) {
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
          hidden={isAnswerHidden(line, currentTime)}
          inRange={range !== null && lineInRange(line, range)}
          onSeek={onSeek}
          onLongPress={onLineLongPress}
          onLineLayout={handleLineLayout}
          fontSize={fontSize}
          lineHeight={lineHeight}
        />
      ))}
    </ScrollView>
  );
}

type LineProps = {
  index: number;
  line: TranscriptLine;
  isActive: boolean;
  hidden: boolean; // a blurred answer line
  inRange: boolean; // part of the repeat range
  onSeek: (seconds: number) => void;
  onLongPress?: (index: number) => void;
  onLineLayout: (index: number, y: number) => void;
  fontSize: number;
  lineHeight: number;
};

// Memoized so only the lines whose highlight changes re-render while the audio plays.
// The callbacks must be stable (useCallback) for this to work.
const Line = memo(function Line({
  index,
  line,
  isActive,
  hidden,
  inRange,
  onSeek,
  onLongPress,
  onLineLayout,
  fontSize,
  lineHeight,
}: LineProps) {
  const label = speakerLabel(line.speaker);
  const text = line.target.trim();

  return (
    <Pressable
      onPress={() => onSeek(line.start)}
      onLongPress={onLongPress ? () => onLongPress(index) : undefined}
      onLayout={(event) => onLineLayout(index, event.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={hidden ? "Hidden answer" : undefined}
      accessibilityHint="Plays from this line"
      accessibilityState={onLongPress ? { selected: inRange } : undefined}
      accessibilityActions={
        onLongPress ? [{ name: "longpress", label: "Add to repeat range" }] : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") onLongPress?.(index);
      }}
      style={({ pressed }) => [styles.line, inRange && styles.lineInRange, pressed && styles.pressed]}
    >
      {label ? <Text style={styles.speaker}>{label}</Text> : null}
      {hidden ? (
        <HiddenAnswer text={text} fontSize={fontSize} lineHeight={lineHeight} />
      ) : (
        <Text
          style={[
            styles.text,
            { fontSize, lineHeight },
            isActive && styles.textActive,
          ]}
        >
          {text}
        </Text>
      )}
    </Pressable>
  );
});

// Android 12+ (API 31) has a real Gaussian blur filter (RenderEffect). It does nothing
// on iOS or older Android, where the answer would be readable, so a soft text shadow
// stands in for it there.
const CAN_FILTER_BLUR = Platform.OS === "android" && Number(Platform.Version) >= 31;

// A hidden answer: the normal text, blurred so it can't be read. It's the same Text with
// the same size, so the line doesn't move when revealed. The radii scale with the size.
function HiddenAnswer({
  text,
  fontSize,
  lineHeight,
}: {
  text: string;
  fontSize: number;
  lineHeight: number;
}) {
  return (
    <View
      style={[
        styles.blurBox,
        CAN_FILTER_BLUR && { filter: [{ blur: Math.round(fontSize * 0.4) }] },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize, lineHeight },
          !CAN_FILTER_BLUR && [
            styles.shadowBlur,
            { textShadowRadius: Math.round(fontSize * 0.6) },
          ],
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 48,
  },
  line: {
    marginBottom: 28,
  },
  // Lines in the repeat range are indented, with a blue line in the gap. It must stay inside
  // the ScrollView: anything outside its edges (e.g. a negative margin) is clipped on Android.
  lineInRange: {
    borderLeftWidth: 3,
    borderLeftColor: "#0A84FF",
    paddingLeft: 16,
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
    color: "#A1A1A6",
  },
  textActive: {
    color: "#000000",
  },
  // Padding gives the blur room to spread instead of being cut off at the edges; the
  // negative margin cancels it so the line keeps its size and position.
  blurBox: {
    padding: 12,
    margin: -12,
  },
  // Transparent glyphs with a soft shadow. The shadow color must not be opaque: on
  // Android, Paint.setShadowLayer then uses the shadow's own alpha, not the text's (zero).
  shadowBlur: {
    color: "transparent",
    textShadowColor: "rgba(142, 142, 147, 0.9)",
    textShadowOffset: { width: 0, height: 0 },
  },
});
