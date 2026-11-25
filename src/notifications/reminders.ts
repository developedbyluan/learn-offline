import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  getReminderSettings,
  reminderTimes,
  setReminderSettingsListener,
} from "@/data/reminderSettings";

// Daily practice reminders, scheduled on the phone (no server push).
// See docs/practice-reminders.md.

const CHANNEL_ID = "practice-reminders";
// Each reminder's id is `${REMINDER_PREFIX}-<index>`.
const REMINDER_PREFIX = "daily-practice";

let channelReady: Promise<void> | null = null;
// Reschedules run one after another, so a cancel never interleaves with a schedule.
let queue: Promise<void> = Promise.resolve();

// Android 8+ needs a channel, and on Android 13+ the permission prompt only appears once one exists.
function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Practice reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  })
    .then(() => undefined)
    .catch((err: unknown) => {
      channelReady = null;
      throw err;
    });
  return channelReady;
}

export type PermissionResult = "granted" | "denied" | "blocked";

// Asks for notification permission if needed. "blocked" means the system won't ask again,
// so the user has to allow it in the phone's settings.
export async function requestReminderPermission(): Promise<PermissionResult> {
  await ensureChannel();
  let status = await Notifications.getPermissionsAsync();
  if (!status.granted && status.canAskAgain) {
    status = await Notifications.requestPermissionsAsync();
  }
  if (status.granted) return "granted";
  return status.canAskAgain ? "denied" : "blocked";
}

async function reschedule() {
  // Cancel every reminder first, so a removed time never keeps firing.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(REMINDER_PREFIX))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );

  const settings = getReminderSettings();
  if (!settings.enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await ensureChannel();

  const times = reminderTimes(settings);
  for (const [index, time] of times.entries()) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}-${index}`,
      content: {
        title: "Time to practice!",
        body: "Open the app and listen today.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: CHANNEL_ID,
      },
    });
  }
}

// Makes the scheduled reminders match the settings. Never rejects.
export function syncReminders(): Promise<void> {
  queue = queue.then(reschedule).catch((err: unknown) => {
    console.warn("Couldn't schedule practice reminders", err);
  });
  return queue;
}

let started = false;

// Called once at startup: shows reminders that arrive while the app is open, reschedules
// whenever the settings change, and syncs once in case permission or the app changed.
export function startReminders() {
  if (started) return;
  started = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  setReminderSettingsListener(() => void syncReminders());
  void syncReminders();
}
