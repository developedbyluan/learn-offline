import { useSyncExternalStore } from "react";
import { AppState, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { File, Paths } from "expo-file-system";
import { confirm } from "@/components/feedback/ConfirmDialog";
import { showToast } from "@/components/feedback/Toast";
import { COMMONVOCAB_BASE_URL, commonvocabAuthHeader } from "@/data/api";
import { requestReminderPermission } from "@/notifications/reminders";

// Server push for new pinned events: this phone's Expo push token is registered with the
// commonvocab worker, which sends a push through Expo when a message is pinned.
// See docs/push-notifications.md (app) and docs/push-server.md (worker).

// The channel the worker sends to (`channelId` in the push). It must exist on the phone, or
// Android drops the notification, so it's created at startup.
export const NEW_EVENTS_CHANNEL_ID = "new-events";
// `data.type` of a new-event push.
export const NEW_PINNED_TYPE = "new-pinned";

type Registration = { token: string; userId: string };

type PushSettings = {
  // The "New pinned events" switch. On by default; nothing is sent without permission anyway.
  enabled: boolean;
  // The Pinned tab's "Get notified" card was closed.
  cardDismissed: boolean;
  // What the worker currently has for this phone, so it can be removed later.
  registered: Registration | null;
};

export type PushState = PushSettings & {
  // Notification permission, once checked (null until then). Not saved.
  permissionGranted: boolean | null;
};

const DEFAULTS: PushSettings = { enabled: true, cardDismissed: false, registered: null };

const settingsFile = () => new File(Paths.document, "push-settings.json");

let state: PushState | null = null;
const listeners = new Set<() => void>();

function isRegistration(value: unknown): value is Registration {
  const v = value as Registration | null;
  return typeof v === "object" && v !== null && typeof v.token === "string" && typeof v.userId === "string";
}

// Read once, on first use. A missing or broken file means the defaults.
function getState(): PushState {
  if (state) return state;
  let saved = DEFAULTS;
  try {
    const file = settingsFile();
    if (file.exists) {
      const data = JSON.parse(file.textSync()) as Partial<PushSettings> | null;
      if (data && typeof data === "object") {
        saved = {
          enabled: data.enabled !== false,
          cardDismissed: data.cardDismissed === true,
          registered: isRegistration(data.registered) ? data.registered : null,
        };
      }
    }
  } catch {
    // Use the defaults.
  }
  state = { ...saved, permissionGranted: null };
  return state;
}

function update(changes: Partial<PushState>) {
  const next = { ...getState(), ...changes };
  state = next;
  try {
    const file = settingsFile();
    if (!file.exists) file.create();
    const { enabled, cardDismissed, registered } = next;
    file.write(JSON.stringify({ enabled, cardDismissed, registered }));
  } catch (err) {
    console.warn("Could not save push settings", err);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePushState(): PushState {
  return useSyncExternalStore(subscribe, getState);
}

let channelReady: Promise<void> | null = null;

function ensureNewEventsChannel(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(NEW_EVENTS_CHANNEL_ID, {
    name: "New events",
    importance: Notifications.AndroidImportance.HIGH,
  })
    .then(() => undefined)
    .catch((err: unknown) => {
      channelReady = null;
      throw err;
    });
  return channelReady;
}

async function postToken(registration: Registration) {
  const res = await fetch(`${COMMONVOCAB_BASE_URL}/push-tokens`, {
    method: "POST",
    headers: { Authorization: commonvocabAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: registration.userId,
      token: registration.token,
      provider: "expo",
      platform: Platform.OS,
    }),
  });
  if (!res.ok) throw new Error(`Registering for push failed: HTTP ${res.status}`);
}

// A registration the worker no longer has (404) counts as removed.
async function deleteToken(registration: Registration) {
  const query = new URLSearchParams({ token: registration.token, user_id: registration.userId });
  const res = await fetch(`${COMMONVOCAB_BASE_URL}/push-tokens?${query.toString()}`, {
    method: "DELETE",
    headers: { Authorization: commonvocabAuthHeader() },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Unregistering from push failed: HTTP ${res.status}`);
  }
}

// The signed-in user, as last told by the auth watcher. Undefined until it has run.
let currentUserId: string | null | undefined;
// Syncs run one after another.
let queue: Promise<void> = Promise.resolve();

async function sync(userId: string | null) {
  const permission = await Notifications.getPermissionsAsync();
  if (getState().permissionGranted !== permission.granted) {
    update({ permissionGranted: permission.granted });
  }
  const { enabled, registered } = getState();

  if (!userId || !enabled || !permission.granted) {
    if (registered) {
      await deleteToken(registered);
      update({ registered: null });
    }
    return;
  }

  await ensureNewEventsChannel();
  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (registered?.token === token && registered.userId === userId) return;
  // A new token, or another account on this phone: drop the old registration first.
  if (registered) {
    await deleteToken(registered);
    update({ registered: null });
  }
  const next = { token, userId };
  await postToken(next);
  update({ registered: next });
}

// Makes the worker's registration for this phone match the switch, permission and the
// signed-in user. Pass the user when it changes; without it, the last one is used.
// Never rejects: failures are logged and the next sync tries again.
export function syncPush(userId?: string | null): Promise<void> {
  if (userId !== undefined) currentUserId = userId;
  if (currentUserId === undefined) return queue;
  const uid = currentUserId;
  queue = queue.then(() => sync(uid)).catch((err: unknown) => {
    console.warn("Couldn't update push registration", err);
  });
  return queue;
}

let started = false;

// Called once at startup. Syncs again when the app comes back to the front (permission may
// have changed in Android settings) and when the push token changes.
export function startPush() {
  if (started) return;
  started = true;
  void ensureNewEventsChannel().catch((err: unknown) =>
    console.warn("Couldn't create the new events channel", err),
  );
  AppState.addEventListener("change", (status) => {
    if (status === "active") void syncPush();
  });
  Notifications.addPushTokenListener(() => void syncPush());
}

// Asks for notification permission (if needed) and turns new-event pushes on. Shows a
// toast, or offers the phone's settings when Android won't ask again.
export async function turnOnPush(): Promise<boolean> {
  try {
    await ensureNewEventsChannel();
    const permission = await requestReminderPermission();
    if (permission === "granted") {
      update({ enabled: true, permissionGranted: true });
      void syncPush();
      showToast("You'll be notified about new events.");
      return true;
    }
    if (permission === "denied") {
      showToast("Allow notifications to hear about new events.");
      return false;
    }
    const openSettings = await confirm({
      title: "Notifications are off for this app",
      message: "To hear about new events, allow notifications in your phone's settings.",
      confirmText: "Open settings",
    });
    if (openSettings) void Linking.openSettings();
    return false;
  } catch (err) {
    console.warn("Couldn't turn on push", err);
    showToast("Couldn't turn on notifications. Please try again.");
    return false;
  }
}

// The Settings switch turned off: this phone is unregistered from the worker.
export function turnOffPush() {
  update({ enabled: false });
  void syncPush();
}

export function dismissPushCard() {
  update({ cardDismissed: true });
}
