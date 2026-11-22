import { useCallback, useEffect } from "react";
import { Image } from "expo-image";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import fallbackThumbnail from "../../../assets/thumbnail-fallback.png";
import PlayerLayout, { playerStyles } from "@/components/player/PlayerLayout";
import type { TranscriptResult } from "@/hooks/useTranscript";

export type EnginePlayerProps = {
  mediaId: number;
  localUri: string; // the downloaded file
  title: string;
  author: string;
  artwork?: string; // local thumbnail if saved, otherwise the remote URL
  transcript: TranscriptResult | null;
};

// Plays a downloaded audio file with expo-audio. Keeps playing in the background,
// with lock-screen and notification controls, until the player closes.
export default function AudioPlayerScreen({
  mediaId,
  localUri,
  title,
  author,
  artwork,
  transcript,
}: EnginePlayerProps) {
  const player = useAudioPlayer(localUri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  // Play even when an iPhone's silent switch is on, and keep playing when the app goes to
  // the background or the screen locks. "doNotMix" is required for lock-screen controls
  // and pauses other apps' audio.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {
      // Not critical: playback still works in the foreground.
    });
  }, []);

  // Lock-screen and notification controls. On Android they're also what keeps background
  // playback going past ~3 minutes. Removed when the player closes.
  useEffect(() => {
    try {
      player.setActiveForLockScreen(
        true,
        { title, artist: author || undefined, artworkUrl: artwork },
        { showSeekBackward: true, showSeekForward: true },
      );
    } catch {
      // A build without the playback service: the player still works in the foreground.
    }
    return () => {
      try {
        player.clearLockScreenControls();
      } catch {
        // The player may already be released.
      }
    };
  }, [player, title, author, artwork]);

  const play = useCallback(() => player.play(), [player]);
  const pause = useCallback(() => player.pause(), [player]);
  const seek = useCallback((seconds: number) => player.seekTo(seconds), [player]);

  return (
    <PlayerLayout
      mediaId={mediaId}
      title={title}
      media={
        <Image
          source={artwork ? { uri: artwork } : fallbackThumbnail}
          placeholder={fallbackThumbnail}
          contentFit="contain"
          cachePolicy="disk"
          style={playerStyles.media}
          accessibilityIgnoresInvertColors
        />
      }
      transcript={transcript}
      currentTime={status.currentTime}
      duration={status.duration}
      isLoaded={status.isLoaded}
      playing={status.playing}
      onPlay={play}
      onPause={pause}
      onSeek={seek}
    />
  );
}
