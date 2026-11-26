# New pinned events (server push)

When a message is pinned on the server, users get a **"New event"** notification, even with the app closed. Tapping it opens the **Pinned** tab.

This is real **server push**. The commonvocab worker sends it through Expo's push service. It's different from the [practice reminders](practice-reminders.md) and the [event reminders](event-reminders.md), which are scheduled on the phone. The worker side is in [push-server.md](push-server.md).

## Status

**Firebase is set up** (November 26, 2026): `google-services.json` is in the project root and in `app.json`, and the FCM V1 key is on EAS. Builds from then on can get push tokens. Pushes still need the worker side ([push-server.md](push-server.md)).

## One-time setup (Firebase + EAS)

1. **Firebase project.**
   - At https://console.firebase.google.com, create a project, then **Add app → Android**.
   - Package name: **`com.speakfc.speakfcofflineandroid`**.
   - Download **`google-services.json`** into the project root. It's safe to commit.
2. **Point the app at it.** In `app.json`, under `expo.android`, add:
   ```json
   "googleServicesFile": "./google-services.json"
   ```
   Do this only once the file exists, because builds fail without it.
3. **FCM V1 key for Expo.**
   - In Firebase: **Project settings → Service accounts → Generate new private key**. This downloads a `…-firebase-adminsdk-….json`.
   - **Never commit it.** `.gitignore` already ignores `*-firebase-adminsdk-*.json`.
   - Then run `npx eas-cli@latest credentials` → **Android** → a build profile → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Set up…** → **Upload a new service account key**.
   - Or use expo.dev → project → Credentials → Android → FCM V1 service account key.
4. **New development build** (`google-services.json` is native config), then a preview build for testers.

## What the user sees

- **On the Pinned tab, a card:**
  - **Text:** "Get notified about new events", then "We'll let you know when a new event is pinned.", with **Turn on** and a ✕.
  - **When it shows:** only while the phone hasn't allowed notifications, the Settings switch is on, and the card hasn't been closed.
  - **Turn on:** asks for permission. If Android won't ask again, it offers **Open settings**.
- **Settings → Events → "New pinned events":**
  - **On means it can actually arrive:** the switch is on and notifications are allowed.
  - **Turning it on** asks for permission when needed.
  - **Turning it off** unregisters this phone from the worker.
- **The notification:** it's on its own Android channel, **"New events"** (high importance), so it can be muted without muting reminders.
- **With the app open:** a banner shows, and if the Pinned tab is open it reloads to show the new message.
- **Tapping it:** opens the Pinned tab, from the background or a cold start.

**On by default:** the switch starts on. A user who already allowed notifications, say for practice reminders or "I'll be there!", is registered automatically when they sign in.

## Registration with the worker

This phone's **Expo push token** is registered with `POST /push-tokens` and removed with `DELETE /push-tokens`. The contract is in [push-server.md](push-server.md). `syncPush` makes the worker match the phone's state:

| Signed in | Switch on | Permission | Result |
| --- | --- | --- | --- |
| yes | yes | granted | registered: `{token, user_id, provider: "expo", platform: "android"}` |
| any other combination | | | not registered: an earlier registration is removed |

**When it runs:**
- on sign-in, sign-out or an account switch (`NotificationsAuthWatcher` in `_layout.tsx`);
- when the app comes back to the front, since permission may have changed in Android settings;
- when the token changes (`addPushTokenListener`);
- after the switch or the card changes.

**How it runs:**
- **One at a time:** syncs are queued.
- **Saved registration:** what the worker has (`{token, userId}`) is saved in `push-settings.json`, so a later sync can remove it, even after sign-out.
- **Only real changes:** a request is sent only when the token or the user changed.
- **Failures:** they're logged and retried on the next trigger.

## Files

| File | What it does |
| --- | --- |
| `src/notifications/push.ts` | Settings store (`push-settings.json`), the `new-events` channel, `syncPush`, `startPush`, `turnOnPush`, `turnOffPush` and `dismissPushCard`. |
| `src/notifications/taps.ts` | `useNotificationTaps`: event reminders and new-event pushes open `/pinned`. |
| `src/components/PushPromptCard.tsx` | The "Get notified about new events" card. |
| `src/app/(tabs)/pinned.tsx` | Shows the card, and reloads on a `new-pinned` push. |
| `src/app/(tabs)/settings.tsx` | The Events → "New pinned events" switch. |
| `src/app/_layout.tsx` | `startPush()`, `useNotificationTaps()`, and `NotificationsAuthWatcher`. |

## Testing on a phone (after Firebase + a new build)

1. **Turn on:** open Pinned, tap **Turn on**, then allow. Check that the worker has a row for the token. In dev, log the token from `syncPush`.
2. **A test push:** close the app. Send from https://expo.dev/notifications with that token, channel `new-events`, and data `{"type":"new-pinned","messageId":114}`. It arrives. Tap it, and the Pinned tab opens.
3. **App open on Pinned:** send again. A banner appears, and the list reloads.
4. **The Settings switch:** turn it off, and the worker row is gone. Turn it on, and it's back.
5. **Sign-out:** sign out, and the row is gone. Sign in as another account, and the row has the new `user_id`.
6. **Muting:** mute **New events** in Android settings. Practice and event reminders still arrive.

## Known limitations

- **Android only for now.** iOS needs an Apple Developer account and an APNs key on EAS. The same code then works.
- **Battery savers** on some phones can delay pushes while the app is closed.
- **Sign-out while offline:** the token removal fails and is retried on the next app start. Until then, that phone can still receive pushes for the old account.
