import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/Icon";
import SeekBar from "@/components/SeekBar";
import Transcript from "@/components/Transcript";
import type { TranscriptResult } from "@/hooks/useTranscript";
import { usePlaybackPosition } from "@/hooks/usePlaybackPosition";

const SKIP_SECONDS = 5;
// How close to the end counts as finished, so Play starts again from the beginning.
const END_TOLERANCE_SECONDS = 0.25;

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
  const [mediaHidden, setMediaHidden] = useState(false);

  const seekTo = useCallback(
    async (seconds: number) => {
      await onSeek(seconds);
    },
    [onSeek],
  );

  const togglePlay = useCallback(async () => {
    if (playing) {
      onPause();
      return;
    }
    if (duration > 0 && currentTime >= duration - END_TOLERANCE_SECONDS) {
      await onSeek(0);
    }
    onPlay();
  }, [playing, duration, currentTime, onPlay, onPause, onSeek]);

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
          <Transcript lines={transcript.lines} currentTime={currentTime} onSeek={seekTo} />
        )}
      </View>

      <View style={styles.seekBar}>
        <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
      </View>

      <View style={styles.controls}>
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
      </View>
    </View>
  );
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
});
