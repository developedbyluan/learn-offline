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
  name: string;
};

export default function DownloadButton({
  mediaId,
  fileUrl,
  fileJsonId,
  thumbnailUrl,
  name,
}: DownloadButtonProps) {
  const state = useMediaDownload(mediaId, fileUrl);

  function handlePress() {
    switch (state.status) {
      case "none":
        startDownload({ mediaId, fileUrl, fileJsonId, thumbnailUrl }).catch((err: unknown) => {
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

  const label =
    state.status === "downloading"
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
      {state.status === "downloading" ? (
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
