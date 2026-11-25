import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Icon from "@/components/Icon";
import SeekBar, { formatTime } from "@/components/SeekBar";
import { showToast } from "@/components/feedback/Toast";
import Transcript from "@/components/Transcript";
import type { TranscriptResult } from "@/hooks/useTranscript";
import { usePlaybackPosition } from "@/hooks/usePlaybackPosition";
import { usePlayTimeTracking } from "@/hooks/usePlayTimeTracking";
import { useAuth } from "@clerk/expo";
import { useTranscriptTextSize } from "@/data/transcriptTextSize";
import {
  extendRange,
  initialRange,
  rangeWithoutLines,
  usePlayRange,
  withEnd,
  withStart,
} from "@/hooks/usePlayRange";

const SKIP_SECONDS = 5;
// How close to the end counts as finished, so Play starts again from the beginning.
const END_TOLERANCE_SECONDS = 0.25;
// Pressing Play this close after a range's End (while paused) plays the range again.
const RANGE_RESTART_AFTER_SECONDS = 0.5;
const RANGE_COLOR = "#0A84FF";

type PlayerLayoutProps = {
  mediaId: number;
  title: string;
  // The artwork (audio) or the video, shown full width above the transcript.
  media: ReactNode;
  transcript: TranscriptResult | null;
  currentTime: number; // seconds
  duration: number; // seconds; 0 until loaded
  isLoaded: boolean;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => Promise<void> | void;
};

// The player screen's UI, shared by the audio and video players. Each player passes in
// its state and controls; this component doesn't know which engine is playing.
export default function PlayerLayout({
  mediaId,
  title,
  media,
  transcript,
  currentTime,
  duration,
  isLoaded,
  playing,
  onPlay,
  onPause,
  onSeek,
}: PlayerLayoutProps) {
  const insets = useSafeAreaInsets();
  // Opens where the lesson was left off, and remembers the position for next time.
  usePlaybackPosition({ mediaId, currentTime, duration, isLoaded, playing, onSeek });
  // Records this visit as a listening session (only time while playing counts).
  const { userId } = useAuth();
  usePlayTimeTracking({ mediaId, userId: userId ?? null, playing, currentTime });
  const [mediaHidden, setMediaHidden] = useState(false);
  const [textSize, cycleTextSize] = useTranscriptTextSize();

  const seekTo = useCallback(
    async (seconds: number) => {
      await onSeek(seconds);
    },
    [onSeek],
  );

  // Play in range: repeats a part of the lesson. See docs/play-range.md.
  const { range, setRange, clear: clearRange } = usePlayRange({
    currentTime,
    playing,
    onSeek: seekTo,
  });
  const lines = transcript?.lines ?? null;
  // Waits for the transcript, so it starts from the right line, and for the length.
  const canUseRange = isLoaded && duration > 0 && transcript !== null;

  const toggleRange = useCallback(() => {
    if (range) {
      clearRange();
      return;
    }
    let next = initialRange(lines, currentTime, duration);
    if (!next) {
      next = rangeWithoutLines(currentTime, duration);
      showToast("No subtitles here. Use ◎ to set Start and End.");
    }
    setRange(next);
    void seekTo(next.start);
  }, [range, clearRange, lines, currentTime, duration, setRange, seekTo]);

  const setStartHere = useCallback(() => {
    if (!range) return;
    const change = withStart(range, currentTime, duration);
    setRange(change.range);
    if (change.notice) showToast(change.notice);
  }, [range, currentTime, duration, setRange]);

  const setEndHere = useCallback(() => {
    if (!range) return;
    const change = withEnd(range, currentTime);
    setRange(change.range);
    if (change.notice) showToast(change.notice);
    // Play the new range from the start right away.
    void seekTo(change.range.start);
  }, [range, currentTime, setRange, seekTo]);

  const extendToLine = useCallback(
    (index: number) => {
      if (lines) setRange((current) => (current ? extendRange(current, lines, index, duration) : current));
    },
    [lines, duration, setRange],
  );

  const togglePlay = useCallback(async () => {
    if (playing) {
      onPause();
      return;
    }
    if (
      range &&
      currentTime >= range.end - END_TOLERANCE_SECONDS &&
      currentTime <= range.end + RANGE_RESTART_AFTER_SECONDS
    ) {
      await onSeek(range.start);
    } else if (duration > 0 && currentTime >= duration - END_TOLERANCE_SECONDS) {
      await onSeek(0);
    }
    onPlay();
  }, [playing, range, duration, currentTime, onPlay, onPause, onSeek]);

  const skip = useCallback(
    (delta: number) => {
      void onSeek(Math.min(duration || 0, Math.max(0, currentTime + delta)));
    },
    [onSeek, currentTime, duration],
  );

  return (
    <View
      style={[
        styles.container,
        {
          // An iOS modal sheet starts below the status bar; Android shows the screen full height.
          paddingTop: Platform.OS === "ios" ? 24 : insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>

      {!mediaHidden && media}

      <View style={styles.chevronRow}>
        <Pressable
          onPress={() => setMediaHidden((hidden) => !hidden)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={mediaHidden ? "Show picture" : "Hide picture"}
        >
          <Icon name={mediaHidden ? "chevronDown" : "chevronUp"} size={22} color="#8E8E93" />
        </Pressable>
      </View>

      <View style={styles.transcript}>
        {transcript === null ? (
          <ActivityIndicator style={styles.centered} />
        ) : transcript.lines === null ? (
          <Text style={styles.message}>{transcript.error}</Text>
        ) : (
          <Transcript
            lines={transcript.lines}
            currentTime={currentTime}
            onSeek={seekTo}
            fontSize={textSize.fontSize}
            lineHeight={textSize.lineHeight}
            range={range}
            onLineLongPress={range ? extendToLine : undefined}
          />
        )}
      </View>

      <View style={styles.seekBar}>
        <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
      </View>

      <View style={styles.controls}>
        {range ? (
          <RangeEnd label="Start" time={range.start} currentTime={currentTime} onSet={setStartHere} />
        ) : (
          <Pressable
            onPress={() => skip(-SKIP_SECONDS)}
            disabled={!isLoaded}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back 5 seconds"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Icon name="back5" size={36} color="#000000" />
          </Pressable>
        )}

        <Pressable
          onPress={togglePlay}
          disabled={!isLoaded}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        >
          {isLoaded ? (
            <Icon name={playing ? "pause" : "play"} size={36} color="#000000" />
          ) : (
            <ActivityIndicator color="#000000" />
          )}
        </Pressable>

        {range ? (
          <RangeEnd label="End" time={range.end} currentTime={currentTime} onSet={setEndHere} />
        ) : (
          <Pressable
            onPress={() => skip(SKIP_SECONDS)}
            disabled={!isLoaded}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Forward 5 seconds"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Icon name="forward5" size={36} color="#000000" />
          </Pressable>
        )}
      </View>

      <View style={styles.menu}>
        <Pressable
          onPress={goToFavorites}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to favorites"
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <Icon name="list" size={22} color={MENU_ICON_COLOR} />
          <MenuLabel text="Favorites" />
        </Pressable>
        <Pressable
          onPress={cycleTextSize}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Transcript text size: ${textSize.name}`}
          accessibilityHint="Changes to the next size"
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <Icon name="textSize" size={22} color={MENU_ICON_COLOR} />
          <MenuLabel text="Text size" />
        </Pressable>
        <Pressable
          onPress={toggleRange}
          disabled={!canUseRange && !range}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={range ? "Stop repeating" : "Repeat a range"}
          accessibilityHint={range ? undefined : "Repeats the current line. Long-press lines to add them."}
          accessibilityState={{ selected: !!range, disabled: !canUseRange && !range }}
          style={({ pressed }) => [
            styles.menuButton,
            !canUseRange && !range && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="repeat" size={22} color={range ? RANGE_COLOR : MENU_ICON_COLOR} />
          <MenuLabel text="Range" color={range ? RANGE_COLOR : undefined} />
        </Pressable>
      </View>
    </View>
  );
}

// The small caption under a menu icon. Hidden from screen readers, because the button
// already has its own label.
function MenuLabel({ text, color }: { text: string; color?: string }) {
  return (
    <Text
      style={[styles.menuLabel, color ? { color } : null]}
      maxFontSizeMultiplier={1.3}
      accessible={false}
      importantForAccessibility="no"
    >
      {text}
    </Text>
  );
}

// One end of the repeat range: "Start: 0:12" and a ◎ button that moves it to the
// current playback time.
function RangeEnd({
  label,
  time,
  currentTime,
  onSet,
}: {
  label: "Start" | "End";
  time: number;
  currentTime: number;
  onSet: () => void;
}) {
  return (
    <View style={styles.rangeEnd}>
      <Text style={styles.rangeText} maxFontSizeMultiplier={1.3}>
        <Text style={styles.rangeLabel}>{label}: </Text>
        {formatTime(time)}
      </Text>
      <Pressable
        onPress={onSet}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Set ${label.toLowerCase()} to current time, now ${formatTime(currentTime)}`}
        style={({ pressed }) => [styles.setPoint, pressed && styles.pressed]}
      >
        <Icon name="setPoint" size={24} color={RANGE_COLOR} />
      </Pressable>
    </View>
  );
}

// Closes the player and shows the favorites list. Opens the list directly if there's
// no screen to go back to.
function goToFavorites() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)");
}

// A full-screen message instead of the player, e.g. when the lesson isn't downloaded.
export function PlayerMessage({ text }: { text: string }) {
  return (
    <View style={[styles.container, styles.messageContainer]}>
      <Text style={styles.message}>{text}</Text>
    </View>
  );
}

const PLAY_BUTTON_SIZE = 76;
// Gray and smaller than the playback controls, so the menu reads as secondary.
const MENU_ICON_COLOR = "#8E8E93";

export const playerStyles = StyleSheet.create({
  // The media slot: full width, 16:9, like the card thumbnails.
  media: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  messageContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    color: "#000000",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  chevronRow: {
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  transcript: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centered: {
    flex: 1,
  },
  message: {
    fontSize: 15,
    color: "#666666",
    textAlign: "center",
    marginTop: 24,
  },
  seekBar: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingTop: 16,
  },
  menu: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 48,
    paddingTop: 12,
  },
  menuButton: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 2,
  },
  menuLabel: {
    fontSize: 12,
    color: MENU_ICON_COLOR,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    backgroundColor: "#D1D1D6",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.5,
  },
  disabled: {
    opacity: 0.35,
  },
  rangeEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rangeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    fontVariant: ["tabular-nums"],
  },
  rangeLabel: {
    fontWeight: "400",
    color: "#8E8E93",
  },
  setPoint: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
