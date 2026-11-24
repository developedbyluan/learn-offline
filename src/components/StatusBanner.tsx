import { StyleSheet, Text, View } from "react-native";
import Icon from "@/components/Icon";

// Why the latest favorites request failed.
export type LoadProblem = "offline" | "failed";

const CONTENT = {
  offline: {
    icon: "wifiOff",
    title: "You're offline.",
    body: "Downloaded lessons still play. Pull down to refresh.",
  },
  failed: {
    icon: "info",
    title: "Couldn't update your favorites.",
    body: "Showing your last saved list. Pull down to try again.",
  },
} as const;

// A soft rounded notice above the favorites list when it couldn't be refreshed.
export default function StatusBanner({ kind }: { kind: LoadProblem }) {
  const { icon, title, body } = CONTENT[kind];
  return (
    <View style={styles.banner} accessible accessibilityRole="summary">
      <Icon name={icon} size={20} color="#6C6C70" />
      <Text style={styles.text}>
        <Text style={styles.title}>{title}</Text> {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: "#3C3C43",
  },
  title: {
    fontWeight: "600",
    color: "#000000",
  },
});
