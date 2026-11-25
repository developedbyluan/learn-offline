# Pinned messages

The **Pinned** tab (Home, Sessions, **Pinned**, Settings) shows the signed-in user's pinned messages, such as an upcoming coaching session.

## Where the data comes from

```
GET https://commonvocab.developedbyluan.workers.dev/messages?user_id={clerk_user_id}&pinned=true&include=replies
Authorization: Basic <EXPO_PUBLIC_COMMONVOCAB_API_USER:EXPO_PUBLIC_COMMONVOCAB_API_PASS>
```

- **The server** is the commonvocab worker, not flucom-api. It has **its own Basic credentials**: `EXPO_PUBLIC_COMMONVOCAB_API_USER` and `EXPO_PUBLIC_COMMONVOCAB_API_PASS`. They're in `.env` locally and in the EAS development, preview and production environments.
- **The risk:** like the flucom-api credentials, they're built into the APK, which is accepted for internal testing (see [play-time-tracking.md](play-time-tracking.md)).
- **`user_id`** is the Clerk user id from `useAuth()`.
- **The response** is an array of messages. Times are Unix **seconds**. The app reads:

| Field | Used for |
| --- | --- |
| `id` | the list key. Messages without an `id` or `body` are skipped. |
| `body` | the card text, as light markdown |
| `display_name` | the small gray name under the text |
| `pin_rank` | the order: lowest first, unranked last, then newest `created_at` |
| `pinned_range` `{start, end}` | the time label, the **Now** tag, and hiding ended messages |
| `links` `[{id, text, url, note}]` | link pills, shown only after "I'll be there!" (see [Replying](#replying)) |
| `replies` `[{id, user_id, body}]` | the user's own "I'll be there!" replies, for the reply button (see [Replying](#replying)). Replies aren't listed. |

Replies come from `include=replies`. Other fields (`allowed_roles`, `secret`, `tags`, …) are ignored.

## What the user sees

- **Loading:** the list loads every time the tab is opened, and can be pulled down to refresh.
- **Order:** cards are sorted by `pin_rank`.
- **A card shows:**
  - **When:** "Today, 8:30 PM – 9:30 PM", "Tomorrow, …" or "Thu, Nov 26, …", in the phone's time zone and locale. A window that spans days names both days. While the window is under way, a green **Now** tag appears before it.
  - **Body:** lines starting with `#` become bold headings (`#`/`##` at 20 pt, `###` and smaller at 17 pt), and other lines are normal text. Blank lines are dropped. No other markdown is interpreted.
  - **Who:** the poster's `display_name`.
  - **The "I'll be there!" button:** only on messages with a time window (see [Replying](#replying)).
- **Ended messages:** once `pinned_range.end` has passed, the message is hidden, checked against the time of the last load. A message without `pinned_range` always shows.
- **Links show only after "I'll be there!"** See [Replying](#replying).
- **Other states:**
  - **Signed out:** "Sign in to see pinned messages."
  - **Empty:** "No pinned messages right now."
  - **Offline or error:** "You're offline. Pull down to try again." or "Couldn't load pinned messages. Pull down to try again.", with a **Try again** button. If a reload fails after an earlier success, the earlier list stays, with the message on top.
- **Online only:** nothing is cached on the phone.

## Replying

A message with a time window (`pinned_range`) has an **"I'll be there!"** toggle under its text.

```
POST   /messages/{message_id}/replies      {"user_id": "<clerk id>", "body": "I'll be there!"}
DELETE /replies/{reply_id}?user_id=<clerk id>
```

Both use the same Basic credentials as the list.

- **Off:** outlined blue "I'll be there!". A tap sends the reply right away, with no confirmation.
- **On:** filled green "✓ I'll be there!". A tap removes the reply right away.
- **What counts as "on":** the message has at least one reply **by this user** whose text is "I'll be there!". Case, spacing and straight vs curly apostrophes (`'` / `’`) are ignored, so a reply made elsewhere as "I’ll be there!" counts.
- **What a remove deletes:** **every** such reply, so accidental duplicates go too, and **nothing else**. The user's other replies, perhaps written in another app, and other people's replies are never touched. A `404` counts as already deleted.
- **After a tap:**
  - **The button:** while the request runs, it shows a spinner and ignores taps, so a double tap never sends twice.
  - **On success:** the button changes at once, a toast says "Reply sent" or "Reply removed", and the list reloads quietly to get the server's state. That state includes the new reply's id, which a later remove needs.
  - **Removing a reply sent moments ago:** the list reloads first to learn its id.
- **On failure:**
  - **The button:** it keeps its state.
  - **The toast:** "You're offline. Try again when you're connected." when offline, otherwise "Couldn't send your reply. Try again." or "Couldn't remove your reply. Try again."
  - **A partial remove:** if some of several deletes fail, the reload shows what's left.
- **Links:** while the button is green, the message's links appear under it as blue pills, labelled "Zoom · 20:30" (`text`, plus ` · note` when there is one). They appear as soon as the button turns green and disappear when the reply is removed.
  - **Opening:** a tap opens the URL with the phone, in the Zoom app or the browser.
  - **Why not `canOpenURL`:** on Android 11+ it says no for apps not declared in `<queries>`, so it isn't used.
  - **Bad links:** a malformed URL, or one that fails to open, shows "Couldn't open this link."
- **Reminder:** saying "I'll be there!" also schedules a notification 30 minutes before the event starts, and removing the reply cancels it. See [event-reminders.md](event-reminders.md).

## How it's built

| File | What it does |
| --- | --- |
| `src/app/(tabs)/pinned.tsx` | The tab: loads on focus (`useFocusEffect`), pull to refresh, aborts stale requests, and handles the states above. It also runs the reply toggle, with per-message busy flags and local "on/off" overrides that are dropped once a reload agrees. |
| `src/components/PinnedCard.tsx` | One card: the time label, Now tag, markdown headings and text, the name, the "I'll be there!" toggle, and the link pills. |
| `src/data/pinnedMessages.ts` | `fetchPinnedMessages` with loose validation, `visiblePinned` for filtering and sorting, and `formatPinnedRange` and `isHappeningNow`. Also `attendingReplyIds`, `sendReply` and `deleteReply`. |
| `src/data/api.ts` | `COMMONVOCAB_BASE_URL` and `commonvocabAuthHeader()`. |
| `src/app/(tabs)/_layout.tsx` | The Pinned tab, between Sessions and Settings. |
