import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from "react-native";
import DownloadIcon from "@/components/DownloadIcon";
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
          const message = err instanceof Error ? err.message : "Something went wrong.";
          Alert.alert("Download failed", message);
        });
        break;
      case "downloading":
        cancelDownload(mediaId);
        break;
      case "downloaded":
        Alert.alert("Remove download?", name, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              try {
                deleteDownload(mediaId, fileUrl);
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Something went wrong.";
                Alert.alert("Couldn't remove download", message);
              }
            },
          },
        ]);
        break;
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
