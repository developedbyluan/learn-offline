import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import {
  attendingReplyIds,
  messageTitle,
  type PinnedMessage,
} from "@/data/pinnedMessages";
import { requestReminderPermission } from "@/notifications/reminders";

// A reminder 30 minutes before each pinned event the user said "I'll be there!" to.
// Scheduled on the phone (no server push). See docs/event-reminders.md.

const CHANNEL_ID = "event-reminders";
// Each reminder's id is `${PREFIX}<messageId>`.
const PREFIX = "event-reminder-";
const LEAD_MS = 30 * 60 * 1000;
const DATA_TYPE = "event-reminder";

export type AttendingEvent = {
  messageId: number;
  title: string;
  start: number; // Unix seconds
};

type ReminderData = { type: string; messageId: number; userId: string; startsAt: number };

// The events in a list that this user is going to.
export function attendingEvents(messages: PinnedMessage[], userId: string): AttendingEvent[] {
  return messages.flatMap((message) =>
    message.pinnedRange && attendingReplyIds(message, userId).length > 0
      ? [eventFor(message)]
      : [],
  );
}

export function eventFor(message: PinnedMessage): AttendingEvent {
  return {
    messageId: message.id,
    title: messageTitle(message.body),
    start: message.pinnedRange?.start ?? 0,
  };
}

let channelReady: Promise<void> | null = null;

// A channel of its own, so users can mute event reminders without muting practice ones.
function ensureEventChannel(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Event reminders",
    importance: Notifications.AndroidImportance.HIGH,
  })
    .then(() => undefined)
    .catch((err: unknown) => {
      channelReady = null;
      throw err;
    });
  return channelReady;
}

// Changes run one after another, so a cancel never interleaves with a schedule.
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((err: unknown) => {
    console.warn("Couldn't update event reminders", err);
  });
  return queue;
}

const fireAt = (event: AttendingEvent) => event.start * 1000 - LEAD_MS;

function startTime(event: AttendingEvent) {
  return new Date(event.start * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

async function scheduledReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((request) => request.identifier.startsWith(PREFIX));
}

async function cancel(identifier: string) {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

// Schedules (or replaces) one reminder. Nothing is scheduled once its time has passed,
// e.g. for an event starting in less than 30 minutes.
async function schedule(userId: string, event: AttendingEvent) {
  const identifier = `${PREFIX}${event.messageId}`;
  await cancel(identifier);
  const date = fireAt(event);
  if (date <= Date.now()) return;
  await ensureEventChannel();
  const data: ReminderData = {
    type: DATA_TYPE,
    messageId: event.messageId,
    userId,
    startsAt: event.start,
  };
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: event.title,
      body: `Starts at ${startTime(event)}. You said you'll be there.`,
      data,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: CHANNEL_ID,
    },
  });
}

function dataOf(request: Notifications.NotificationRequest): Partial<ReminderData> {
  return (request.content.data ?? {}) as Partial<ReminderData>;
}

// Makes the scheduled reminders match the events this user is going to: adds new ones,
// moves changed times, and cancels the rest (including other accounts'). Never prompts
// for permission; without it, nothing is scheduled. Never rejects.
export function syncEventReminders(userId: string, events: AttendingEvent[]): Promise<void> {
  return enqueue(async () => {
    const existing = await scheduledReminders();
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      await Promise.all(existing.map((request) => cancel(request.identifier)));
      return;
    }
    const wanted = new Map(
      events
        .filter((event) => fireAt(event) > Date.now())
        .map((event) => [`${PREFIX}${event.messageId}`, event]),
    );
    for (const request of existing) {
      const event = wanted.get(request.identifier);
      const data = dataOf(request);
      const upToDate =
        event !== undefined &&
        data.userId === userId &&
        data.startsAt === event.start &&
        request.content.title === event.title;
      if (upToDate) wanted.delete(request.identifier);
      else await cancel(request.identifier);
    }
    for (const event of wanted.values()) await schedule(userId, event);
  });
}

export type ReminderResult = "scheduled" | "no-permission";

// Right after the user says "I'll be there!": asks for notification permission if it
// hasn't been decided yet, then schedules the reminder.
export async function remindAfterReply(
  userId: string,
  event: AttendingEvent,
): Promise<ReminderResult> {
  try {
    await ensureEventChannel();
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await requestReminderPermission()) === "granted";
    if (!granted) return "no-permission";
  } catch (err) {
    console.warn("Couldn't check notification permission", err);
    return "no-permission";
  }
  await enqueue(() => schedule(userId, event));
  return "scheduled";
}

// Right after the user removes their reply.
export function cancelEventReminder(messageId: number): Promise<void> {
  return enqueue(() => cancel(`${PREFIX}${messageId}`));
}

// Cancels every reminder that isn't this user's (all of them when signed out).
export function cancelOtherUsersReminders(userId: string | null): Promise<void> {
  return enqueue(async () => {
    const existing = await scheduledReminders();
    await Promise.all(
      existing
        .filter((request) => userId === null || dataOf(request).userId !== userId)
        .map((request) => cancel(request.identifier)),
    );
  });
}

function isEventReminder(response: Notifications.NotificationResponse | null) {
  return (
    response !== null &&
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
    response.notification.request.content.data?.type === DATA_TYPE
  );
}

// Tapping a reminder opens the Pinned tab, whether the app was running or not.
export function useEventReminderTaps() {
  useEffect(() => {
    const last = Notifications.getLastNotificationResponse();
    if (isEventReminder(last)) {
      router.push("/pinned");
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isEventReminder(response)) router.push("/pinned");
    });
    return () => subscription.remove();
  }, []);
}
