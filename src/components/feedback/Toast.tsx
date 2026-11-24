import { useEffect, useRef, useSyncExternalStore } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/Icon";

// A small dark message at the bottom of the screen that hides itself. Call showToast()
// from anywhere; <ToastHost /> (mounted once in the root layout) draws it.

type Toast = { id: number; message: string };

const VISIBLE_MS = 4000;
// Keeps the toast above the tab bar.
const BOTTOM_OFFSET = 64;

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

// Shows a message. A new toast replaces the one on screen.
export function showToast(message: string) {
  current = { id: nextId++, message };
  emit();
}

function hideToast(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  if (!toast) return null;
  // Keyed by id, so a replacing toast animates in fresh.
  return <ToastView key={toast.id} toast={toast} />;
}

function ToastView({ toast }: { toast: Toast }) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(toast.message);
    Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => dismiss(), VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
      hideToast(toast.id),
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + BOTTOM_OFFSET }]}
    >
      <Animated.View
        style={{
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        }}
      >
        <Pressable
          onPress={dismiss}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityHint="Dismisses the message"
          style={styles.toast}
        >
          <Icon name="info" size={20} color="#FFFFFF" />
          <Text style={styles.message}>{toast.message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#1C1C1E",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: "#FFFFFF",
  },
});
