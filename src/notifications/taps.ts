import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { EVENT_REMINDER_TYPE } from "@/notifications/eventReminders";
import { NEW_PINNED_TYPE } from "@/notifications/push";

// Notifications whose tap opens the Pinned tab: the 30-minute event reminder (local) and
// the new-event push (from the worker).
const OPENS_PINNED = new Set<unknown>([EVENT_REMINDER_TYPE, NEW_PINNED_TYPE]);

function opensPinned(response: Notifications.NotificationResponse | null) {
  return (
    response !== null &&
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
    OPENS_PINNED.has(response.notification.request.content.data?.type)
  );
}

// Handles taps whether the app was running or not (a cold start reads the last response).
export function useNotificationTaps() {
  useEffect(() => {
    const last = Notifications.getLastNotificationResponse();
    if (opensPinned(last)) {
      router.push("/pinned");
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (opensPinned(response)) router.push("/pinned");
    });
    return () => subscription.remove();
  }, []);
}
