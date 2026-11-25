# Daily practice reminders

A local notification that brings learners back to practice:

> **Time to practice!** Open the app and listen today.

Everything is scheduled on the phone with `expo-notifications`. There's no server push, and it works offline.

## What the user sees

In **Settings → Daily reminder**:

- **Remind me to practice** turns reminders on.
  - Turning it on asks for notification permission first.
  - If the user says no, the switch stays off and a toast says "Allow notifications to get reminders."
  - If Android won't ask again, a dialog offers **Open settings**, which calls `Linking.openSettings()`.
- **Choose times** (only shown while reminders are on):
  - **Off (habit mode):** one reminder a day, at the time the user **first opened a lesson on the most recent day they used the app**. Until they've opened a lesson, it's **8:00 PM**. The footnote shows which time is used.
  - **On:** a list of fixed times. Tap a time to change it with Android's clock dialog, ✕ to remove it, and **Add a time** to add one.
    - There can be **up to 5**. Duplicates are refused with a toast.
    - The list starts with the current habit time.
    - Removing the last time switches back to habit mode.

Reminders fire **every day**, including days the user already practiced. Times follow the phone's 12 or 24-hour setting. Tapping the notification opens the app.

## Time rules

`reminderTimes(settings)` in [src/data/reminderSettings.ts](../src/data/reminderSettings.ts):

1. Use `fixedTimes`, if there are any.
2. Otherwise use `firstOpenTime`, the habit.
3. Otherwise use 8:00 PM.

**How the habit is recorded.** `recordLessonOpened()` runs when the player opens a playable lesson.
- On the first open of a new local day, it saves `lastUseDay` and the hour and minute as `firstOpenTime`.
- Later opens that day change nothing.

## Storage

`<documents>/reminder-settings.json`:

```json
{ "enabled": true, "fixedTimes": [{ "hour": 8, "minute": 0 }], "lastUseDay": "2026-11-25", "firstOpenTime": { "hour": 7, "minute": 42 } }
```

- It's shared by every account on the phone, like the transcript text size.
- A missing or broken file means the defaults: reminders off, no times.
- Times are always saved sorted, unique, and at most 5.

## Scheduling

All of this lives in [src/notifications/reminders.ts](../src/notifications/reminders.ts).

**Android channel.** The channel is `practice-reminders` ("Practice reminders", default importance). It's created before asking for permission, because on Android 13+ the prompt only appears once a channel exists.

**How the reminders are rebuilt.** `syncReminders()` rebuilds them in two steps:
1. Cancel every scheduled notification whose id starts with `daily-practice`.
2. If reminders are on **and** permission is granted, schedule one `DAILY` trigger per time, with the ids `daily-practice-0` through `daily-practice-4`.

Runs are queued one after another, and errors are logged, never thrown.

**When it runs:**
- **At app start**, from `startReminders()` in the root layout. This catches a reinstall, an update, or permission changed in Android settings.
- **After every settings change**, through `updateReminderSettings`.
- **When the habit time changes** while in habit mode.

**Foreground.** A reminder that arrives while the app is open is still shown as a banner, with sound.

**Survives a reboot.** expo-notifications adds `RECEIVE_BOOT_COMPLETED`, so the schedule comes back after the phone restarts.

## Files

| File | What it does |
| --- | --- |
| `src/data/reminderSettings.ts` (new) | Settings file, `useReminderSettings`, `updateReminderSettings`, `recordLessonOpened`, `reminderTimes`. |
| `src/notifications/reminders.ts` (new) | Channel, permission, `syncReminders`, `startReminders`. |
| `src/app/(tabs)/settings.tsx` | The Daily reminder section. |
| `src/app/player.tsx` | Calls `recordLessonOpened()`. |
| `src/app/_layout.tsx` | Calls `startReminders()` once. |
| `src/utils/localDate.ts` (new) | Local `YYYY-MM-DD`, moved out of `usePlayTimeTracking`. |
| `src/components/Icon.tsx` | `close` and `add` icons. |
| `app.json` | `expo-notifications` plugin (small icon `android-icon-monochrome.png`, color `#208AEF`) and `@react-native-community/datetimepicker`. |

Both libraries are native, so a **new development build** is needed.

## Testing on a phone

1. In Settings, turn the reminder on. Android 13+ asks for permission. Allow it.
2. Turn on **Choose times**, then set times 2 and 4 minutes from now. Lock the phone. Both arrive.
3. Add times up to 5: **Add a time** disappears. Picking a duplicate shows a toast. A removed time no longer fires.
4. Turn **Choose times** off. The footnote shows 8:00 PM, or the habit time. Open a lesson, and the footnote shows that time. Open another lesson the same day, and it doesn't change.
5. Turn the reminder off, and nothing fires.
6. Deny permission: you get the toast. After two denials, you get the Open settings dialog.
7. Restart the phone, and reminders still fire.

## Known limitations

- **Event reminders are separate.** The 30-minute reminders for pinned events are on their own channel. See [event-reminders.md](event-reminders.md).
- **There's no exact alarm.** Google Play restricts `SCHEDULE_EXACT_ALARM`, so a reminder can arrive a few minutes late.
- **Battery savers can interfere.** Battery savers, some manufacturers' task killers, and force-stopping the app can delay or drop reminders.
- **Turning notifications off in Android settings.** The switch in the app stays on, but nothing is scheduled. The next app start sees the missing permission and schedules nothing.
- **The small icon is the placeholder logo.** It's the monochrome adaptive icon, and Android only uses its shape.
