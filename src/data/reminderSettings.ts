import { useSyncExternalStore } from "react";
import { File, Paths } from "expo-file-system";
import { localDate } from "@/utils/localDate";

// Daily practice reminder settings, saved on the phone for every account (like the text size).
// See docs/practice-reminders.md.

export type ReminderTime = { hour: number; minute: number };

export type ReminderSettings = {
  enabled: boolean;
  // Times chosen by the user, sorted and unique. Empty means "follow my habit".
  fixedTimes: ReminderTime[];
  // The last day a lesson was opened (local YYYY-MM-DD), and when the first one was opened that day.
  lastUseDay: string | null;
  firstOpenTime: ReminderTime | null;
};

export const MAX_FIXED_TIMES = 5;
// Used in habit mode until the user has opened a lesson.
export const DEFAULT_REMINDER_TIME: ReminderTime = { hour: 20, minute: 0 };

const DEFAULTS: ReminderSettings = {
  enabled: false,
  fixedTimes: [],
  lastUseDay: null,
  firstOpenTime: null,
};

const settingsFile = () => new File(Paths.document, "reminder-settings.json");

let current: ReminderSettings | null = null;
const listeners = new Set<() => void>();
// Set by the scheduler, so this file doesn't import expo-notifications.
let onChange: (() => void) | null = null;

function isTime(value: unknown): value is ReminderTime {
  const v = value as ReminderTime | null;
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isInteger(v.hour) &&
    Number.isInteger(v.minute) &&
    v.hour >= 0 &&
    v.hour <= 23 &&
    v.minute >= 0 &&
    v.minute <= 59
  );
}

const minutesOf = (time: ReminderTime) => time.hour * 60 + time.minute;

// Sorted, without duplicates, at most MAX_FIXED_TIMES.
export function normalizeTimes(times: ReminderTime[]): ReminderTime[] {
  const unique = new Map<number, ReminderTime>();
  for (const time of times) {
    if (isTime(time)) unique.set(minutesOf(time), { hour: time.hour, minute: time.minute });
  }
  return [...unique.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, MAX_FIXED_TIMES)
    .map(([, time]) => time);
}

export function sameTime(a: ReminderTime, b: ReminderTime) {
  return a.hour === b.hour && a.minute === b.minute;
}

// Read once, on first use. A missing or broken file means the defaults.
export function getReminderSettings(): ReminderSettings {
  if (current) return current;
  current = DEFAULTS;
  try {
    const file = settingsFile();
    if (file.exists) {
      const data = JSON.parse(file.textSync()) as Partial<ReminderSettings> | null;
      if (data && typeof data === "object") {
        current = {
          enabled: data.enabled === true,
          fixedTimes: Array.isArray(data.fixedTimes) ? normalizeTimes(data.fixedTimes) : [],
          lastUseDay: typeof data.lastUseDay === "string" ? data.lastUseDay : null,
          firstOpenTime: isTime(data.firstOpenTime) ? data.firstOpenTime : null,
        };
      }
    }
  } catch {
    // Use the defaults.
  }
  return current;
}

function save(next: ReminderSettings) {
  current = next;
  listeners.forEach((listener) => listener());
  try {
    const file = settingsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(next));
  } catch (err) {
    console.warn("Could not save reminder settings", err);
  }
}

// Saves the change and reschedules the reminders.
export function updateReminderSettings(patch: Partial<ReminderSettings>) {
  const next = { ...getReminderSettings(), ...patch };
  if (patch.fixedTimes) next.fixedTimes = normalizeTimes(patch.fixedTimes);
  save(next);
  onChange?.();
}

// The times the reminders fire: the chosen times, otherwise the habit time, otherwise 8:00 PM.
export function reminderTimes(settings: ReminderSettings): ReminderTime[] {
  if (settings.fixedTimes.length > 0) return settings.fixedTimes;
  return [settings.firstOpenTime ?? DEFAULT_REMINDER_TIME];
}

// Called when a lesson opens. The first lesson of a new day sets the habit time; later ones
// that day don't change it. Reschedules only when the reminder follows the habit.
export function recordLessonOpened(now = new Date()) {
  const settings = getReminderSettings();
  const today = localDate(now);
  if (settings.lastUseDay === today) return;
  save({
    ...settings,
    lastUseDay: today,
    firstOpenTime: { hour: now.getHours(), minute: now.getMinutes() },
  });
  if (settings.enabled && settings.fixedTimes.length === 0) onChange?.();
}

export function setReminderSettingsListener(listener: () => void) {
  onChange = listener;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReminderSettings(): ReminderSettings {
  return useSyncExternalStore(subscribe, getReminderSettings);
}
