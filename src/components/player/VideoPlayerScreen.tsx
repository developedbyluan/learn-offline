import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import Icon from "@/components/Icon";
import PlayerLayout, { playerStyles } from "@/components/player/PlayerLayout";
import type { EnginePlayerProps } from "@/components/player/AudioPlayerScreen";

// How often the current time is reported, for the seek bar and the transcript highlight.
const TIME_UPDATE_SECONDS = 0.25;

// Setting currentTime is expo-video's frame-accurate seek (seekBy may land elsewhere).
// It's a native setter, kept outside the component because the React Compiler doesn't
// allow assigning to a value returned by a hook.
function seekVideo(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}

// Plays a downloaded video file with expo-video, in the artwork's place. The sound keeps
// playing in the background, with a media notification, until the player closes.
export default function VideoPlayerScreen({
  mediaId,
  localUri,
  title,
  author,
  artwork,
  transcript,
}: EnginePlayerProps) {
  const videoRef = useRef<VideoView>(null);
  const player = useVideoPlayer(
    { uri: localUri, metadata: { title, artist: author || undefined, artwork } },
    (p) => {
      p.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      p.staysActiveInBackground = true;
      p.showNowPlayingNotification = true;
      p.audioMixingMode = "doNotMix";
    },
  );

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  // null until the first event arrives.
  const sourceLoad = useEvent(player, "sourceLoad");
  const isLoaded = status === "readyToPlay";
  // Kept in state so a seek shows right away, even while paused, when timeUpdate
  // events may not arrive.
  const [currentTime, setCurrentTime] = useState(0);
  useEventListener(player, "timeUpdate", (event) => setCurrentTime(event.currentTime));
  // The status change re-renders, so player.duration is read once the file has loaded,
  // even if sourceLoad fired before the listener was attached.
  const duration = sourceLoad?.duration ?? (isLoaded ? player.duration : 0);

  const play = useCallback(() => player.play(), [player]);
  const pause = useCallback(() => player.pause(), [player]);
  const seek = useCallback(
    (seconds: number) => {
      seekVideo(player, seconds);
      setCurrentTime(seconds);
    },
    [player],
  );

  return (
    <PlayerLayout
      mediaId={mediaId}
      title={title}
      media={
        <View style={[playerStyles.media, styles.videoBox]}>
          <VideoView
            ref={videoRef}
            player={player}
            nativeControls={false}
            contentFit="contain"
            style={StyleSheet.absoluteFill}
          />
          {status === "error" ? (
            <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
              <Text style={styles.errorText}>Couldn&apos;t play this video.</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => void videoRef.current?.enterFullscreen()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Full screen"
              style={({ pressed }) => [styles.fullscreenButton, pressed && styles.pressed]}
            >
              <Icon name="fullscreen" size={22} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      }
      transcript={transcript}
      currentTime={currentTime}
      duration={duration}
      isLoaded={isLoaded}
      playing={isPlaying}
      onPlay={play}
      onPause={pause}
      onSeek={seek}
    />
  );
}

const FULLSCREEN_BUTTON_SIZE = 36;

const styles = StyleSheet.create({
  videoBox: {
    backgroundColor: "#000000",
  },
  fullscreenButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: FULLSCREEN_BUTTON_SIZE,
    height: FULLSCREEN_BUTTON_SIZE,
    borderRadius: FULLSCREEN_BUTTON_SIZE / 2,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  errorOverlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 15,
  },
});
