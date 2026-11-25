# Push for new pinned events: what the worker does

This is the server side of [push-notifications.md](push-notifications.md). The commonvocab worker keeps each phone's push token, and when a message is pinned it sends a notification through **Expo's push service**. Expo forwards it to Google (FCM) for Android, and to Apple (APNs) for iOS later on.

All app → worker requests use the existing commonvocab **Basic** credentials.

## 1. Store tokens

A table like:

| column | example | notes |
| --- | --- | --- |
| `token` | `ExponentPushToken[xxxxxxxx]` | **unique**: one row per phone |
| `user_id` | `user_32kRIJ5bCMhzrG1bI9dnMWPDzR7` | the Clerk user id |
| `provider` | `expo` | `apns`/`fcm` reserved for a future native app |
| `platform` | `android` | `ios` later |
| `created_at`, `updated_at` | Unix seconds | |

The `provider` column keeps the design open. A native iOS app could register raw Apple tokens with `provider: "apns"`, and the worker would send those directly to Apple. The rest stays the same.

## 2. Endpoints the app calls

```
POST /push-tokens
Content-Type: application/json
{"user_id": "<clerk id>", "token": "ExponentPushToken[…]", "provider": "expo", "platform": "android"}
```
- **Upsert by `token`.** If the token exists under another user, **move it** to this user, because a phone can switch accounts.
- **Reply** `200` or `201`. The body is ignored.

```
DELETE /push-tokens?token=<token>&user_id=<clerk id>
```
- **Delete** the row when both match. Reply `200`/`204`, or `404` if it's not there. The app treats `404` as success.

**When the app calls them:**
- **Sign-in:** register.
- **Sign-out:** remove.
- **Account switch:** remove, then register.
- **"New pinned events" switch:** turning it off removes, and turning it on registers.
- **Token change:** register.
- **Each time the app comes to the front:** it checks again, but only sends a request when something changed.

## 3. Send when a message is pinned

**Trigger:** a message goes from *not pinned* to *pinned*.

**Don't send for:**
- edits or rank changes on an already pinned message;
- re-saving;
- a message whose `pinned_range.end` has already passed.

**Who gets it** is the worker's decision: every user, or only users whose roles match `allowed_roles` (e.g. `vvip`). Then take their `provider = "expo"` tokens.

```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json
Accept: application/json

[
  {
    "to": "ExponentPushToken[…]",
    "title": "New event",
    "body": "One on One Coaching with Tố Trinh",
    "data": { "type": "new-pinned", "messageId": 114 },
    "channelId": "new-events",
    "priority": "high"
  }
]
```

**The fields:**

| Field | What it must be |
| --- | --- |
| `body` | The message's **first line without the `#` marks**, the same title the app shows. Optionally add the time, e.g. "… · Today 8:30 PM". |
| `data.type` | **`"new-pinned"`**. Tapping the notification then opens the Pinned tab, and an open Pinned tab reloads. |
| `channelId` | **`"new-events"`**. It's the channel the app creates. A wrong channel id means Android doesn't show it. |
| `priority` | `"high"`, so it shows promptly. |

**Sending rules:**
- **Batch size:** up to **100 messages per request**. Expo allows 600 notifications per second.
- **Total size:** the payload must be **4 KiB** at most.
- **Retries:** on HTTP **429 or 5xx**, retry with exponential backoff.
- **Authentication:** none is needed, unless "enhanced push security" is turned on in the Expo dashboard. Then send `Authorization: Bearer <Expo access token>`.

## 4. Clean up dead tokens

- **Tickets:** the response `data` array matches your messages in order.
  - `status: "ok"` has an `id`, the receipt id.
  - `status: "error"` with `details.error: "DeviceNotRegistered"` means **delete that token**.
- **Receipts:** about 15 minutes later, `POST https://exp.host/--/api/v2/push/getReceipts` with `{"ids": [...]}` (up to 1000 ids). Delete tokens whose receipt says `DeviceNotRegistered` too. Receipts expire after 24 hours.
- **Cloudflare:** a Cron Trigger is a simple place for the receipt check. If you skip receipts, dead tokens are still caught by the next ticket error.

## 5. Testing without the worker

Use https://expo.dev/notifications:
1. Paste a token from the app's dev log.
2. Set **Android channel ID** to `new-events`.
3. Set **data** to `{"type":"new-pinned","messageId":114}`.
4. Send.
