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
| `links` `[{id, text, url, note}]` | parsed but **not shown yet** (see below) |

`replies` are requested (`include=replies`) but not shown. Other fields (`allowed_roles`, `secret`, `tags`, …) are ignored.

## What the user sees

- **Loading:** the list loads every time the tab is opened, and can be pulled down to refresh.
- **Order:** cards are sorted by `pin_rank`.
- **A card shows:**
  - **When:** "Today, 8:30 PM – 9:30 PM", "Tomorrow, …" or "Thu, Nov 26, …", in the phone's time zone and locale. A window that spans days names both days. While the window is under way, a green **Now** tag appears before it.
  - **Body:** lines starting with `#` become bold headings (`#`/`##` at 20 pt, `###` and smaller at 17 pt), and other lines are normal text. Blank lines are dropped. No other markdown is interpreted.
  - **Who:** the poster's `display_name`.
- **Ended messages:** once `pinned_range.end` has passed, the message is hidden, checked against the time of the last load. A message without `pinned_range` always shows.
- **Links are hidden for now.** They'll be shown only under conditions still to be decided. They're kept on `PinnedMessage.links` for that.
- **Other states:**
  - **Signed out:** "Sign in to see pinned messages."
  - **Empty:** "No pinned messages right now."
  - **Offline or error:** "You're offline. Pull down to try again." or "Couldn't load pinned messages. Pull down to try again.", with a **Try again** button. If a reload fails after an earlier success, the earlier list stays, with the message on top.
- **Online only:** nothing is cached on the phone.

## How it's built

| File | What it does |
| --- | --- |
| `src/app/(tabs)/pinned.tsx` | The tab: loads on focus (`useFocusEffect`), pull to refresh, aborts stale requests, and handles the states above. |
| `src/components/PinnedCard.tsx` | One card: the time label, Now tag, markdown headings and text, and the name. |
| `src/data/pinnedMessages.ts` | `fetchPinnedMessages` with loose validation, `visiblePinned` for filtering and sorting, and `formatPinnedRange` and `isHappeningNow`. |
| `src/data/api.ts` | `COMMONVOCAB_BASE_URL` and `commonvocabAuthHeader()`. |
| `src/app/(tabs)/_layout.tsx` | The Pinned tab, between Sessions and Settings. |
