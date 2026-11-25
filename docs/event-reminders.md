# Event reminders

A local notification **30 minutes before** a pinned event starts. It's only for events the user answered **"I'll be there!"** to on the [Pinned tab](pinned-messages.md#replying).

Like the [practice reminders](practice-reminders.md), it's scheduled on the phone with `expo-notifications`. There's no server push.

## What the user gets

| | |
| --- | --- |
| **When** | `pinned_range.start − 30 min`. Nothing is scheduled if that time has passed, for example when the event starts in under 30 minutes or has already started. |
| **Title** | The message's first line, without the `#` marks, e.g. "One on One Coaching with Tố Trinh". |
| **Body** | "Starts at 8:30 PM. You said you'll be there.", in the phone's time zone and locale. |
| **Tap** | Opens the app on the **Pinned** tab, whether it was running or not. |
| **Channel** | **Event reminders**, at high importance. It's separate from Practice reminders, so either can be muted in Android settings without the other. |

**Who gets one:** a message counts only when it has a time window and the user has an "I'll be there!" reply on it. That's the same rule as the green button: `attendingReplyIds` in `src/data/pinnedMessages.ts`.

## Permission

- **The first tap on "I'll be there!"** asks for notification permission if it hasn't been decided yet. It uses the same prompt as the practice reminders (`requestReminderPermission`).
- **If it's refused,** the reply is still sent, and the toast reads "Reply sent. Turn on notifications to get a reminder."
- **Background syncs never ask.** Without permission they schedule nothing and cancel any old reminders.

## Keeping reminders in line

Every reminder has the id `event-reminder-<messageId>` and the data `{ type: "event-reminder", messageId, userId, startsAt }`.

| When | What happens |
| --- | --- |
| The Pinned list loads (opening the tab, pull to refresh, after a tap) | **Sync:** add reminders for new events the user is going to, reschedule any whose start time or title changed, and cancel the rest. |
| "I'll be there!" sent | Schedule that event's reminder at once, after the permission check. |
| Reply removed | Cancel that event's reminder at once. |
| Signed out | Cancel all event reminders. |
| Switched account | Cancel the reminders belonging to the previous account. |

All changes run one after another, so a cancel never interleaves with a schedule.

## Files

| File | What it does |
| --- | --- |
| `src/notifications/eventReminders.ts` | The channel, `syncEventReminders`, `remindAfterReply`, `cancelEventReminder`, `cancelOtherUsersReminders`, and `useEventReminderTaps`, which opens the Pinned tab. |
| `src/app/(tabs)/pinned.tsx` | Syncs after each load, schedules after a send, and cancels after a remove. |
| `src/app/_layout.tsx` | `useEventReminderTaps()`, and `EventRemindersAuthWatcher`, which cancels on sign-out or an account switch. |
| `src/data/pinnedMessages.ts` | `messageTitle`, the first line of the body, shared with the card's `bodyLines`. |

## Testing on a phone

1. Pin a test message that starts about 35 minutes from now. Tap **I'll be there!** and allow notifications. The reminder arrives about 5 minutes later.
2. Remove the reply before then, and nothing arrives.
3. Close the app, then tap a reminder. The app opens on the Pinned tab.
4. Reply to an event that starts in under 30 minutes. No reminder.
5. Reply, then sign out. No reminder.
6. Mute **Event reminders** in Android settings. Practice reminders still arrive.

## Known limitations

- **Server changes arrive late.** If the event's time changes, or it's unpinned or cancelled, the phone only learns on the next Pinned load. If the user doesn't open the tab, the old reminder still fires.
- **Replies made elsewhere** (web, another app) get a reminder only after the app loads the Pinned list.
- **There's no exact alarm**, so a reminder can arrive a few minutes late, as with practice reminders.
- **No "new event" alerts.** Local notifications can't announce newly pinned messages. That would need server push.
