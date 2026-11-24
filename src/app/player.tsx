import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import AudioPlayerScreen from "@/components/player/AudioPlayerScreen";
import VideoPlayerScreen from "@/components/player/VideoPlayerScreen";
import { PlayerMessage } from "@/components/player/PlayerLayout";
import { mediaKind } from "@/data/media";
import { getLocalThumbnailUri, markInUse, useLocalMediaUri } from "@/data/mediaDownloads";
import { useTranscript } from "@/hooks/useTranscript";

// Opened from a downloaded audio or video card. Plays the local file and reads the saved
// transcript, so it works with no internet connection.
type PlayerParams = {
  mediaId: string;
  fileUrl: string;
  fileJsonId: string;
  title?: string;
  author?: string;
  thumbnail?: string;
};

export default function PlayerScreen() {
  const params = useLocalSearchParams<PlayerParams>();
  const mediaId = Number(params.mediaId);
  const fileJsonId = Number(params.fileJsonId);
  const fileUrl = params.fileUrl ?? "";

  // null if the file isn't on the phone (e.g. the download was removed).
  const localUri = useLocalMediaUri(mediaId, fileUrl);
  const transcript = useTranscript(mediaId, fileJsonId);
  const kind = fileUrl ? mediaKind(fileUrl) : null;

  // While the player is open, background updates leave this lesson's files alone.
  useEffect(() => {
    if (!Number.isFinite(mediaId)) return;
    return markInUse(mediaId);
  }, [mediaId]);

  if (!Number.isFinite(mediaId) || !fileUrl || kind === null) {
    return <PlayerMessage text="Couldn't open this lesson." />;
  }
  if (!localUri) {
    return <PlayerMessage text="This lesson isn't downloaded. Download it to play it offline." />;
  }

  // Only one engine is mounted, so only one native player is ever created.
  const Engine = kind === "video" ? VideoPlayerScreen : AudioPlayerScreen;
  return (
    <Engine
      mediaId={mediaId}
      localUri={localUri}
      title={params.title ?? ""}
      author={params.author ?? ""}
      artwork={getLocalThumbnailUri(mediaId) ?? params.thumbnail}
      transcript={transcript}
    />
  );
}
