import { ClerkProvider, useAuth } from "@clerk/expo";
import { resourceCache } from "@clerk/expo/resource-cache";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DialogHost } from "@/components/feedback/ConfirmDialog";
import { ToastHost } from "@/components/feedback/Toast";
import { startReminders } from "@/notifications/reminders";
import { cancelOtherUsersReminders } from "@/notifications/eventReminders";
import { startPush, syncPush } from "@/notifications/push";
import { useNotificationTaps } from "@/notifications/taps";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error("Add your clerk publishable key to your .env file");
}

export default function RootLayout() {
  // Keeps the daily practice reminders in line with the settings.
  useEffect(() => {
    startReminders();
    startPush();
  }, []);
  // Tapping an event reminder or a new-event push opens the Pinned tab.
  useNotificationTaps();

  return (
    // Needed for swipe gestures, e.g. swipe to delete a listening session.
    <GestureHandlerRootView style={styles.root}>
      <ClerkProvider
        publishableKey={publishableKey}
        tokenCache={tokenCache}
        // Experimental: saves Clerk's session data on the device so a signed-in
        // user can open the app with no internet connection.
        __experimental_resourceCache={resourceCache}
      >
        {/* A stack (instead of a plain Slot) so the player can open as a modal sheet over the tabs. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="player"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          {/* One lesson's listening sessions, opened from the Sessions tab. */}
          <Stack.Screen
            name="sessions/[mediaId]"
            options={{ headerShown: true, title: "Sessions", headerBackTitle: "Back" }}
          />
        </Stack>
        {/* In-app messages, usable from any screen: showToast() and confirm(). */}
        <ToastHost />
        <DialogHost />
        <NotificationsAuthWatcher />
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

// Notifications belong to the signed-in user. Signing out cancels event reminders and
// unregisters the phone from new-event pushes; switching accounts moves both to the new
// account. See docs/event-reminders.md and docs/push-notifications.md.
function NotificationsAuthWatcher() {
  const { userId, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  useEffect(() => {
    if (!isLoaded) return;
    void cancelOtherUsersReminders(userId ?? null);
    void syncPush(userId ?? null);
  }, [isLoaded, userId]);
  return null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
