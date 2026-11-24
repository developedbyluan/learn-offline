import { useSyncExternalStore } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

// A rounded confirm dialog that matches the app, instead of the system alert.
// Call confirm() from anywhere; <DialogHost /> (mounted once in the root layout) draws it.

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean; // red confirm button
};

type Request = ConfirmOptions & { resolve: (confirmed: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

// Resolves true on confirm, false on cancel (Cancel, a backdrop tap or Android back).
// A new dialog cancels one that's already open.
export function confirm(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function close(confirmed: boolean) {
  const request = current;
  if (!request) return;
  current = null;
  emit();
  request.resolve(confirmed);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function DialogHost() {
  const request = useSyncExternalStore(subscribe, () => current);

  return (
    <Modal
      visible={request !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close(false)}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => close(false)}
        accessibilityLabel="Close"
        importantForAccessibility="no"
      >
        {request && (
          // Taps on the card don't reach the backdrop.
          <Pressable style={styles.card} accessibilityViewIsModal onPress={() => {}}>
            <Text style={styles.title} accessibilityRole="header">
              {request.title}
            </Text>
            {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
            <View style={styles.buttons}>
              <Pressable
                onPress={() => close(false)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>{request.cancelText ?? "Cancel"}</Text>
              </Pressable>
              <Pressable
                onPress={() => close(true)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  request.destructive ? styles.destructive : styles.primary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.confirmText}>{request.confirmText}</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
    textAlign: "center",
  },
  message: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    color: "#6C6C70",
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: {
    backgroundColor: "#F2F2F7",
  },
  primary: {
    backgroundColor: "#0A84FF",
  },
  destructive: {
    backgroundColor: "#FF3B30",
  },
  pressed: {
    opacity: 0.7,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
