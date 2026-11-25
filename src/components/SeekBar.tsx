import { useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

type SeekBarProps = {
  currentTime: number; // seconds
  duration: number; // seconds; 0 until the audio is loaded
  onSeek: (seconds: number) => Promise<void> | void;
  // "light" draws it for a dark background, e.g. over fullscreen video.
  tone?: "dark" | "light";
};

const THUMB_SIZE = 28;
const STEP_SECONDS = 5;

// 75 -> "01:15"; 3725 -> "1:02:05".
export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

// A seek bar drawn with React Native's touch handling, so it needs no native slider library.
// Dragging moves the thumb and the time label; the audio seeks when the finger lifts.
export default function SeekBar({ currentTime, duration, onSeek, tone = "dark" }: SeekBarProps) {
  const light = tone === "light";
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  // Only read inside touch handlers, never while rendering.
  const widthRef = useRef(0);
  const drag = useRef({ startRatio: 0, startPageX: 0 });

  const ratio = dragRatio ?? (duration > 0 ? clamp01(currentTime / duration) : 0);
  const shownTime = dragRatio !== null ? dragRatio * duration : currentTime;

  function handleLayout(event: LayoutChangeEvent) {
    widthRef.current = event.nativeEvent.layout.width;
  }

  function handleGrant(event: GestureResponderEvent) {
    const width = widthRef.current || 1;
    const startRatio = clamp01(event.nativeEvent.locationX / width);
    drag.current = { startRatio, startPageX: event.nativeEvent.pageX };
    setDragRatio(startRatio);
  }

  function ratioAt(event: GestureResponderEvent) {
    const width = widthRef.current || 1;
    const dx = event.nativeEvent.pageX - drag.current.startPageX;
    return clamp01(drag.current.startRatio + dx / width);
  }

  function handleMove(event: GestureResponderEvent) {
    setDragRatio(ratioAt(event));
  }

  // Worked out from the event, not from state, so a quick tap that ends before the
  // next render still seeks to where it touched.
  async function handleRelease(event: GestureResponderEvent) {
    await onSeek(ratioAt(event) * duration);
    setDragRatio(null);
  }

  return (
    <View>
      <View
        style={styles.touchArea}
        onLayout={handleLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ text: `${formatTime(shownTime)} of ${formatTime(duration)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === "increment" ? STEP_SECONDS : -STEP_SECONDS;
          void onSeek(Math.min(duration, Math.max(0, currentTime + delta)));
        }}
        onStartShouldSetResponder={() => duration > 0}
        onMoveShouldSetResponder={() => duration > 0}
        // Keep the gesture when the transcript or the sheet tries to take it over.
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
        onResponderTerminate={() => setDragRatio(null)}
      >
        <View style={[styles.track, light && styles.trackLight]} pointerEvents="none">
          <View style={[styles.fill, light && styles.fillLight, { width: `${ratio * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: `${ratio * 100}%`, marginLeft: -THUMB_SIZE / 2 }]}
        />
      </View>
      <View style={styles.times}>
        <Text style={[styles.timeText, light && styles.timeTextLight]}>{formatTime(shownTime)}</Text>
        <Text style={[styles.timeText, light && styles.timeTextLight]}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: 44,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E5EA",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#8E8E93",
  },
  thumb: {
    position: "absolute",
    top: (44 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    // Soft shadow like the screenshot's thumb.
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeText: {
    fontSize: 13,
    color: "#000000",
    fontVariant: ["tabular-nums"],
  },
  trackLight: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  fillLight: {
    backgroundColor: "#FFFFFF",
  },
  timeTextLight: {
    color: "#FFFFFF",
  },
});
