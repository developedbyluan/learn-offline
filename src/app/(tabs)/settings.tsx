import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { UserButton } from "@clerk/expo/native-components";
import Icon from "@/components/Icon";
import { confirm } from "@/components/feedback/ConfirmDialog";
import { showToast } from "@/components/feedback/Toast";
import {
  DEFAULT_REMINDER_TIME,
  MAX_FIXED_TIMES,
  reminderTimes,
  sameTime,
  updateReminderSettings,
  useReminderSettings,
  type ReminderTime,
} from "@/data/reminderSettings";
import { requestReminderPermission } from "@/notifications/reminders";
import { turnOffPush, turnOnPush, usePushState } from "@/notifications/push";
import { globalStyles } from "@/styles/global";

export default function SettingsScreen() {
  return (
    <ScrollView style={globalStyles.container} contentContainerStyle={styles.content}>
      <Text style={globalStyles.title}>Settings</Text>
      <ReminderSection />
      <EventsSection />
      <UserButton />
    </ScrollView>
  );
}

// "8:00 AM" or "20:00", following the phone's 12/24-hour setting.
function formatTime(time: ReminderTime) {
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Opens Android's clock dialog. Resolves with the chosen time, or null if dismissed.
function pickTime(initial: ReminderTime): Promise<ReminderTime | null> {
  return new Promise((resolve) => {
    const value = new Date();
    value.setHours(initial.hour, initial.minute, 0, 0);
    DateTimePickerAndroid.open({
      value,
      mode: "time",
      onChange: (event, date) => {
        if (event.type === "set" && date) {
          resolve({ hour: date.getHours(), minute: date.getMinutes() });
        } else {
          resolve(null);
        }
      },
    });
  });
}

function ReminderSection() {
  const settings = useReminderSettings();
  const [asking, setAsking] = useState(false);
  const { enabled, fixedTimes, firstOpenTime } = settings;
  const choosingTimes = fixedTimes.length > 0;

  async function toggleReminder(on: boolean) {
    if (!on) {
      updateReminderSettings({ enabled: false });
      return;
    }
    setAsking(true);
    try {
      const permission = await requestReminderPermission();
      if (permission === "granted") {
        updateReminderSettings({ enabled: true });
      } else if (permission === "denied") {
        showToast("Allow notifications to get reminders.");
      } else {
        const openSettings = await confirm({
          title: "Notifications are off for this app",
          message: "To get daily reminders, allow notifications in your phone's settings.",
          confirmText: "Open settings",
        });
        if (openSettings) void Linking.openSettings();
      }
    } catch (err) {
      console.warn("Couldn't turn on reminders", err);
      showToast("Couldn't turn on reminders. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  function toggleChooseTimes(on: boolean) {
    // Start the list with the time the reminder uses now.
    updateReminderSettings({ fixedTimes: on ? reminderTimes(settings) : [] });
  }

  async function changeTime(index: number) {
    const picked = await pickTime(fixedTimes[index]);
    if (!picked || sameTime(picked, fixedTimes[index])) return;
    if (fixedTimes.some((time) => sameTime(time, picked))) {
      showToast(`You already have a reminder at ${formatTime(picked)}.`);
      return;
    }
    updateReminderSettings({
      fixedTimes: fixedTimes.map((time, i) => (i === index ? picked : time)),
    });
  }

  async function addTime() {
    const last = fixedTimes[fixedTimes.length - 1] ?? DEFAULT_REMINDER_TIME;
    const picked = await pickTime({ hour: (last.hour + 1) % 24, minute: last.minute });
    if (!picked) return;
    if (fixedTimes.some((time) => sameTime(time, picked))) {
      showToast(`You already have a reminder at ${formatTime(picked)}.`);
      return;
    }
    updateReminderSettings({ fixedTimes: [...fixedTimes, picked] });
  }

  function removeTime(index: number) {
    // Removing the last time switches back to following the habit.
    updateReminderSettings({ fixedTimes: fixedTimes.filter((_, i) => i !== index) });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Daily reminder
      </Text>
      <View style={styles.group}>
        <SwitchRow
          label="Remind me to practice"
          value={enabled}
          disabled={asking}
          onValueChange={toggleReminder}
        />
        {enabled && (
          <>
            <Separator />
            <SwitchRow label="Choose times" value={choosingTimes} onValueChange={toggleChooseTimes} />
            {fixedTimes.map((time, index) => (
              <View key={`${time.hour}:${time.minute}`}>
                <Separator />
                <View style={styles.row}>
                  <Pressable
                    onPress={() => void changeTime(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reminder at ${formatTime(time)}`}
                    accessibilityHint="Changes the time"
                    style={({ pressed }) => [styles.timeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.timeText}>{formatTime(time)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeTime(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${formatTime(time)}`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                  >
                    <Icon name="close" size={20} color="#8E8E93" />
                  </Pressable>
                </View>
              </View>
            ))}
            {choosingTimes && fixedTimes.length < MAX_FIXED_TIMES && (
              <>
                <Separator />
                <Pressable
                  onPress={() => void addTime()}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Icon name="add" size={20} color="#0A84FF" />
                  <Text style={styles.addText}>Add a time</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </View>
      {enabled && (
        <Text style={styles.footnote}>
          {choosingTimes
            ? fixedTimes.length >= MAX_FIXED_TIMES
              ? `Up to ${MAX_FIXED_TIMES} reminders a day.`
              : "You'll get a reminder every day at these times."
            : firstOpenTime
              ? `Reminds you at ${formatTime(firstOpenTime)}, the time you started a lesson on your last practice day.`
              : `Reminds you at ${formatTime(DEFAULT_REMINDER_TIME)} until you start your first lesson.`}
        </Text>
      )}
    </View>
  );
}

// New-event pushes from the server. The switch is on only when they can actually arrive:
// turned on here and allowed by the phone. See docs/push-notifications.md.
function EventsSection() {
  const { enabled, permissionGranted } = usePushState();
  const [asking, setAsking] = useState(false);

  async function toggle(on: boolean) {
    if (!on) {
      turnOffPush();
      return;
    }
    setAsking(true);
    try {
      await turnOnPush();
    } finally {
      setAsking(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Events
      </Text>
      <View style={styles.group}>
        <SwitchRow
          label="New pinned events"
          value={enabled && permissionGranted === true}
          disabled={asking}
          onValueChange={(on) => void toggle(on)}
        />
      </View>
      <Text style={styles.footnote}>Get a notification when a new event is pinned.</Text>
    </View>
  );
}

function SwitchRow({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Separator(): ReactNode {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: {
    gap: 24,
    paddingBottom: 32,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6C6C70",
    textTransform: "uppercase",
    marginLeft: 4,
  },
  group: {
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
    overflow: "hidden",
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: "#000000",
  },
  timeButton: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  timeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  removeButton: {
    padding: 4,
  },
  addText: {
    fontSize: 16,
    color: "#0A84FF",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#C6C6C8",
    marginLeft: 16,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    color: "#6C6C70",
    marginHorizontal: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
