import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import DownloadIcon from "@/components/DownloadIcon";
import { confirm } from "@/components/feedback/ConfirmDialog";
import { showToast } from "@/components/feedback/Toast";
import { isOfflineError } from "@/data/networkErrors";
import {
  cancelDownload,
  deleteDownload,
  startDownload,
  useMediaDownload,
} from "@/data/mediaDownloads";

type DownloadButtonProps = {
  mediaId: number;
  fileUrl: string;
  fileJsonId: number;
  thumbnailUrl?: string;
  updatedAtOfMedia?: number;
  name: string;
};

export default function DownloadButton({
  mediaId,
  fileUrl,
  fileJsonId,
  thumbnailUrl,
  updatedAtOfMedia,
  name,
}: DownloadButtonProps) {
  const state = useMediaDownload(mediaId, fileUrl);
  // A newer version is downloading in the background; the old copy still plays.
  const updating = state.status === "downloaded" && state.updating;

  function handlePress() {
    if (updating) {
      // Keeps the old copy; the next refresh tries again.
      cancelDownload(mediaId);
      return;
    }
    switch (state.status) {
      case "none":
        startDownload({ mediaId, fileUrl, fileJsonId, thumbnailUrl, updatedAtOfMedia }).catch((err: unknown) => {
          console.warn("Download failed", err);
          showToast(downloadErrorMessage(err));
        });
        break;
      case "downloading":
        cancelDownload(mediaId);
        break;
      case "downloaded":
        void confirmRemove();
        break;
    }
  }

  async function confirmRemove() {
    const confirmed = await confirm({
      title: "Remove download?",
      message: name,
      confirmText: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      deleteDownload(mediaId, fileUrl);
    } catch (err: unknown) {
      console.warn("Couldn't remove download", err);
      showToast("Couldn't remove this download. Please try again.");
    }
  }

  const label = updating
    ? `Updating ${name}. Tap to cancel`
    : state.status === "downloading"
      ? `Cancel download of ${name}`
      : state.status === "downloaded"
        ? `Remove download of ${name}`
        : `Download ${name}`;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {updating ? (
        <ActivityIndicator size="small" color="#007AFF" />
      ) : state.status === "downloading" ? (
        state.progress === null ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text allowFontScaling={false} style={styles.progressText}>
            {state.progress}%
          </Text>
        )
      ) : (
        <DownloadIcon size={24} color="#000000" downloaded={state.status === "downloaded"} />
      )}
    </Pressable>
  );
}

// A friendly message instead of the raw system error.
function downloadErrorMessage(err: unknown) {
  return isOfflineError(err)
    ? "You're offline. Connect to the internet to download this lesson."
    : "Couldn't download this lesson. Please try again.";
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.5,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#000000",
  },
});
