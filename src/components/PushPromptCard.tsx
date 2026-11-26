import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "@/components/Icon";
import { dismissPushCard, turnOnPush, usePushState } from "@/notifications/push";

// On the Pinned tab: offers new-event notifications until they're on or the card is closed.
// Shown only when the switch is on but the phone hasn't allowed notifications.
export default function PushPromptCard() {
  const { enabled, cardDismissed, permissionGranted } = usePushState();
  const [asking, setAsking] = useState(false);
  if (!enabled || cardDismissed || permissionGranted !== false) return null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.header}>
        <Text style={styles.title}>Get notified about new events</Text>
        <Pressable
          onPress={dismissPushCard}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Icon name="close" size={20} color="#8E8E93" />
        </Pressable>
      </View>
      <Text style={styles.message}>{"We'll let you know when a new event is pinned."}</Text>
      <Pressable
        onPress={async () => {
          setAsking(true);
          try {
            await turnOnPush();
          } finally {
            setAsking(false);
          }
        }}
        disabled={asking}
        accessibilityRole="button"
        accessibilityState={{ busy: asking, disabled: asking }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {asking ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Turn on</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#E8F2FF",
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
  },
  message: {
    fontSize: 15,
    lineHeight: 20,
    color: "#3A3A3C",
  },
  button: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.6,
  },
});
