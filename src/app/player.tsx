import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import fallbackThumbnail from "../../assets/thumbnail-fallback.png";
import Icon from "@/components/Icon";
import SeekBar from "@/components/SeekBar";
import Transcript from "@/components/Transcript";
import type { TranscriptLine } from "@/data/media";
import { getLocalThumbnailUri, getTranscript, useLocalMediaUri } from "@/data/mediaDownloads";

// Opened from a downloaded audio card. Plays the local file and reads the saved transcript,
// so it works with no internet connection.
type PlayerParams = {
  mediaId: string;
  fileUrl: string;
  fileJsonId: string;
  title?: string;
  thumbnail?: string;
};

type TranscriptResult =
  | { mediaId: number; lines: TranscriptLine[]; error: null }
  | { mediaId: number; lines: null; error: string };

const SKIP_SECONDS = 5;
// How close to the end counts as finished, so Play starts again from the beginning.
const END_TOLERANCE_SECONDS = 0.25;

export default function PlayerScreen() {
  const params = useLocalSearchParams<PlayerParams>();
  const mediaId = Number(params.mediaId);
  const fileJsonId = Number(params.fileJsonId);
  const fileUrl = params.fileUrl ?? "";
  const title = params.title ?? "";
  const insets = useSafeAreaInsets();

  // null if the file isn't on the phone (e.g. the download was removed).
  const localUri = useLocalMediaUri(mediaId, fileUrl);
  const player = useAudioPlayer(localUri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const [artworkHidden, setArtworkHidden] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);

  // Play even when an iPhone's silent switch is on, like other audio apps.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      // Not critical: playback still works, just respects the silent switch.
    });
  }, []);

  // The saved transcript when downloaded; getTranscript fetches it otherwise.
  useEffect(() => {
    if (!Number.isFinite(mediaId) || !Number.isFinite(fileJsonId)) return;
    let cancelled = false;
    getTranscript(mediaId, fileJsonId).then(
      (data) => {
        if (!cancelled) setTranscript({ mediaId, lines: data.json, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : "Couldn't load the transcript.";
        setTranscript({ mediaId, lines: null, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mediaId, fileJsonId]);

  const seekTo = useCallback(
    async (seconds: number) => {
      await player.seekTo(seconds);
    },
    [player],
  );

  const togglePlay = useCallback(async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.duration > 0 && status.currentTime >= status.duration - END_TOLERANCE_SECONDS) {
      await player.seekTo(0);
    }
    player.play();
  }, [player, status.playing, status.currentTime, status.duration]);

  const skip = useCallback(
    (delta: number) => {
      const target = Math.min(status.duration || 0, Math.max(0, status.currentTime + delta));
      void player.seekTo(target);
    },
    [player, status.currentTime, status.duration],
  );

  if (!Number.isFinite(mediaId) || !fileUrl) {
    return <Message text="Couldn't open this lesson." />;
  }
  if (!localUri) {
    return <Message text="This lesson isn't downloaded. Download it to play it offline." />;
  }

  const thumbnailUri = getLocalThumbnailUri(mediaId) ?? params.thumbnail;
  const transcriptForThis = transcript?.mediaId === mediaId ? transcript : null;

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

      {!artworkHidden && (
        <Image
          source={thumbnailUri ? { uri: thumbnailUri } : fallbackThumbnail}
          placeholder={fallbackThumbnail}
          contentFit="contain"
          cachePolicy="disk"
          style={styles.artwork}
          accessibilityIgnoresInvertColors
        />
      )}

      <View style={styles.chevronRow}>
        <Pressable
          onPress={() => setArtworkHidden((hidden) => !hidden)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={artworkHidden ? "Show picture" : "Hide picture"}
        >
          <Icon name={artworkHidden ? "chevronDown" : "chevronUp"} size={22} color="#8E8E93" />
        </Pressable>
      </View>

      <View style={styles.transcript}>
        {transcriptForThis === null ? (
          <ActivityIndicator style={styles.centered} />
        ) : transcriptForThis.lines === null ? (
          <Text style={styles.transcriptError}>{transcriptForThis.error}</Text>
        ) : (
          <Transcript
            lines={transcriptForThis.lines}
            currentTime={status.currentTime}
            onSeek={seekTo}
          />
        )}
      </View>

      <View style={styles.seekBar}>
        <SeekBar currentTime={status.currentTime} duration={status.duration} onSeek={seekTo} />
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => skip(-SKIP_SECONDS)}
          disabled={!status.isLoaded}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back 5 seconds"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Icon name="back5" size={36} color="#000000" />
        </Pressable>

        <Pressable
          onPress={togglePlay}
          disabled={!status.isLoaded}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause" : "Play"}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        >
          {status.isLoaded ? (
            <Icon name={status.playing ? "pause" : "play"} size={36} color="#000000" />
          ) : (
            <ActivityIndicator color="#000000" />
          )}
        </Pressable>

        <Pressable
          onPress={() => skip(SKIP_SECONDS)}
          disabled={!status.isLoaded}
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

function Message({ text }: { text: string }) {
  return (
    <View style={[styles.container, styles.messageContainer]}>
      <Text style={styles.transcriptError}>{text}</Text>
    </View>
  );
}

const PLAY_BUTTON_SIZE = 76;

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
  artwork: {
    width: "100%",
    aspectRatio: 16 / 9,
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
  transcriptError: {
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
