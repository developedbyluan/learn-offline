import { useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { NavigationBar } from "expo-navigation-bar";
import { VideoView, type VideoPlayer } from "expo-video";
import Icon from "@/components/Icon";
import SeekBar from "@/components/SeekBar";
import SubtitleOverlay from "@/components/player/SubtitleOverlay";
import type { TranscriptLine } from "@/data/media";
import { useFullscreenSubtitles } from "@/data/fullscreenSubtitles";

// Our own fullscreen for video, used instead of expo-video's native one, which pauses
// JavaScript on Android and can't show anything on top. It's a layer over the whole player
// screen (not a Modal, whose separate window would keep the system bars), locked to
// landscape with the bars hidden. See docs/video-fullscreen.md.

const SKIP_SECONDS = 5;
// While playing, the controls hide after this long.
const CONTROLS_TIMEOUT_MS = 3000;
// How long "Subtitles on/off" stays on screen.
const TOAST_MS = 1500;

type Props = {
  player: VideoPlayer;
  onClose: () => void;
  lines: TranscriptLine[] | null;
  currentTime: number;
  duration: number;
  playing: boolean;
  // Taller-than-wide videos stay portrait.
  portrait: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
};

function setSystemBarsHidden(hidden: boolean) {
  try {
    NavigationBar.setHidden(hidden);
  } catch (err) {
    console.warn("Couldn't change the navigation bar", err);
  }
}

export default function VideoFullscreen({
  player,
  onClose,
  lines,
  currentTime,
  duration,
  playing,
  portrait,
  onPlay,
  onPause,
  onSeek,
}: Props) {
  const insets = useSafeAreaInsets();
  const [controlsShown, setControlsShown] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const [subtitlesShown, toggleSubtitles] = useFullscreenSubtitles();
  const [toast, setToast] = useState<string | null>(null);
  const hasLines = lines !== null && lines.length > 0;

  // The toast hides itself; a new one restarts the timer.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Landscape and no system bars while open; back to portrait when closed, even if the
  // player screen itself closes.
  useEffect(() => {
    ScreenOrientation.lockAsync(
      portrait ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch((err: unknown) => console.warn("Couldn't rotate to fullscreen", err));
    setSystemBarsHidden(true);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        (err: unknown) => console.warn("Couldn't rotate back", err),
      );
      setSystemBarsHidden(false);
    };
  }, [portrait]);

  // Android Back leaves fullscreen instead of closing the player.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  // With a screen reader, the controls stay visible.
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: controlsShown ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [controlsShown, opacity]);

  // Hide the controls a few seconds after the last touch, while playing.
  const [lastTouch, setLastTouch] = useState(0);
  useEffect(() => {
    if (!controlsShown || !playing || screenReader) return;
    const timer = setTimeout(() => setControlsShown(false), CONTROLS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [controlsShown, playing, screenReader, lastTouch]);

  const touched = useCallback(() => setLastTouch(Date.now()), []);
  const visible = controlsShown || screenReader;

  const skip = (delta: number) => {
    touched();
    onSeek(Math.min(duration || 0, Math.max(0, currentTime + delta)));
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
      />

      {/* Tapping the video shows or hides the controls. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          touched();
          setControlsShown((shown) => !shown);
        }}
        accessible={false}
      />

      <View
        pointerEvents="box-none"
        style={[
          styles.subtitles,
          { bottom: (visible ? 96 : 24) + insets.bottom },
        ]}
      >
        {hasLines && subtitlesShown && (
          <SubtitleOverlay lines={lines} currentTime={currentTime} duration={duration} />
        )}
      </View>

      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity }]}
        pointerEvents={visible ? "box-none" : "none"}
      >
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Exit full screen"
          style={({ pressed }) => [
            styles.roundButton,
            styles.exitButton,
            { top: 16 + insets.top, right: 16 + insets.right },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="fullscreenExit" size={24} color="#FFFFFF" />
        </Pressable>

        {hasLines && (
          <Pressable
            onPress={() => {
              touched();
              const shown = toggleSubtitles();
              setToast(shown ? "Subtitles on" : "Subtitles off");
            }}
            hitSlop={10}
            accessibilityRole="switch"
            accessibilityLabel={subtitlesShown ? "Hide subtitles" : "Show subtitles"}
            accessibilityState={{ checked: subtitlesShown }}
            style={({ pressed }) => [
              styles.roundButton,
              styles.exitButton,
              { top: 16 + insets.top, right: 16 + insets.right + ROUND_BUTTON_SIZE + 12 },
              pressed && styles.pressed,
            ]}
          >
            <Icon name={subtitlesShown ? "subtitles" : "subtitlesOff"} size={24} color="#FFFFFF" />
          </Pressable>
        )}

        <View style={styles.centerControls} pointerEvents="box-none">
          <Pressable
            onPress={() => skip(-SKIP_SECONDS)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back 5 seconds"
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <Icon name="back5" size={30} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => {
              touched();
              if (playing) onPause();
              else onPlay();
            }}
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause" : "Play"}
            style={({ pressed }) => [styles.roundButton, styles.playButton, pressed && styles.pressed]}
          >
            <Icon name={playing ? "pause" : "play"} size={36} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => skip(SKIP_SECONDS)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Forward 5 seconds"
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <Icon name="forward5" size={30} color="#FFFFFF" />
          </Pressable>
        </View>

        <View
          style={[
            styles.seekBar,
            {
              bottom: 8 + insets.bottom,
              left: 24 + insets.left,
              right: 24 + insets.right,
            },
          ]}
          onTouchStart={touched}
        >
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            onSeek={(seconds) => {
              touched();
              onSeek(seconds);
            }}
            tone="light"
          />
        </View>
      </Animated.View>

      {toast && (
        <View
          style={[styles.toastRow, { top: 24 + insets.top }]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.toast}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const ROUND_BUTTON_SIZE = 52;
const PLAY_BUTTON_SIZE = 68;

const styles = StyleSheet.create({
  root: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: "#000000",
    zIndex: 10,
    elevation: 10,
  },
  subtitles: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
  },
  roundButton: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
  },
  exitButton: {
    position: "absolute",
  },
  centerControls: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 48,
  },
  seekBar: {
    position: "absolute",
  },
  pressed: {
    opacity: 0.6,
  },
  toastRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
