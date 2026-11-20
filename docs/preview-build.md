# Building a preview build

Steps 1–4 cover Android. For iPhone, see [iOS preview build](#ios-preview-build-iphone).

A preview build is an installable app (an APK on Android) that contains the app's JavaScript. Unlike the development build, it doesn't connect to the dev server on the Mac, so it is the build to use for testing the app as users get it, including with no internet connection.

| | Development build | Preview build |
| --- | --- | --- |
| EAS profile | `development` | `preview` |
| JavaScript | Loaded from `npx expo start` on the Mac | Built into the APK |
| Picks up code changes | Instantly, on reload | Only after a new build |
| Reads `.env` | Yes, through the dev server | No, uses EAS environment variables |
| Works with no internet | No (needs the Mac) | Yes |

Both profiles use `"distribution": "internal"` in `eas.json`, so both produce an APK you can install directly.

This project uses npm, so EAS CLI is run as `npx eas-cli@latest` (see `AGENTS.md`). Run every command from the project folder, logged in to the `speakfc` Expo account.

## 1. Check the environment variables on EAS

EAS skips files listed in `.gitignore`, and `.env` is one of them. So a cloud build does not see `.env`, and the app reads `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from the EAS environment for the build profile instead. Without it, the app crashes on launch with "Add your clerk publishable key to your .env file".

Check that the `preview` environment has the key:

```bash
npx eas-cli@latest env:list preview
```

The key is already set for `preview`. If it is missing, or if the key changes, set it again:

```bash
npx eas-cli@latest env:set preview --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value <key from .env> --visibility plaintext
```

A Clerk publishable key is designed to be public, so `plaintext` is fine. You can also manage variables in the EAS dashboard under Environment variables.

If the app needs a new `EXPO_PUBLIC_*` variable later, add it to `.env` for development **and** to the EAS environment for builds.

## 2. Start the build

```bash
npx eas-cli@latest build -p android --profile preview
```

Check the start of the output for this line, which confirms EAS found the key:

```
Environment variables with visibility "Plain text" and "Sensitive" loaded from the "preview" environment on EAS: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.
```

If it says `No environment variables ... found for the "preview" environment`, cancel the build (step 3) and go back to step 1.

The build uploads the working folder, including uncommitted changes. It doesn't need to be committed first.

Without extra flags, the command waits until the build finishes. To start the build and get your terminal back, add `--no-wait`. The output ends with a link to the build page:

```
See logs: https://expo.dev/accounts/speakfc/projects/speakfcofflineandroid/builds/<build id>
```

## 3. Follow or cancel the build

The build usually takes 15–20 minutes. Follow it on the build page, or check its status from the terminal:

```bash
npx eas-cli@latest build:view <build id>
```

The status goes from `IN_QUEUE` to `IN_PROGRESS`, then `FINISHED`, `ERRORED` or `CANCELED`. With `--json`, the APK link is in `artifacts.buildUrl` once the build has finished.

To stop a build, for example if the environment variable was missing:

```bash
npx eas-cli@latest build:cancel <build id>
```

## 4. Install and test

1. Open the build page on the phone, or the APK link (`https://expo.dev/artifacts/eas/....apk`), and download the APK.
2. Install it. Android may ask you to allow installs from the browser.
3. If Android says the package is invalid, delete the download and get it again from the build page while logged in to the `speakfc` Expo account.

A preview build and the development build are separate apps on the phone, so installing one doesn't replace the other.

To test offline behavior, see [remote-favorites.md](remote-favorites.md#testing-offline).

## When you need a new build

- **Preview:** every time you want to test JavaScript changes in the preview APK, because the code is built into it.
- **Development:** only when native code changes, such as adding a library with native code or changing `app.json` plugins. JavaScript changes reach it through the dev server.

## iOS preview build (iPhone)

The same `preview` profile and EAS environment work for iOS, so the Clerk key from step 1 is already in place. The bundle ID is `com.speakfc.speakfcofflineandroid`, set in `app.json` under `ios.bundleIdentifier`.

iOS only installs an app outside the App Store if it is signed for that specific device. EAS calls this internal distribution (Apple calls it ad hoc), and it needs a **paid Apple Developer Program account**. For an option without one, see [Free option: build with Xcode](#free-option-build-with-xcode).

Run these commands yourself in a terminal: Apple asks you to log in, which a non-interactive session can't do.

### 1. Register the iPhone (once per device)

```bash
npx eas-cli@latest device:create
```

Choose the website option and open the link or QR code on the iPhone in Safari. Install the profile it offers in **Settings → General → VPN & Device Management**. This sends the iPhone's device ID (UDID) to EAS.

Register the iPhone **before** building. The provisioning profile only includes devices that are registered when the build is made. If you add a device later, run a new build so the profile includes it. To see registered devices, run `npx eas-cli@latest device:list`.

### 2. Start the build

```bash
npx eas-cli@latest build -p ios --profile preview
```

The first time, log in with the Apple Developer account and let EAS create the distribution certificate and provisioning profile. EAS stores them, so later builds reuse them.

As with Android, check that the output says `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` was loaded from the `preview` environment. Then follow or cancel the build with the same `build:view` and `build:cancel` commands as in step 3 above.

### 3. Turn on Developer Mode (once per device)

On the iPhone, go to **Settings → Privacy & Security → Developer Mode**, turn it on and restart. iOS 16 and later won't open an internally distributed app without it. The option only appears once an app like this is installed, so you may need to install first (step 4) and then come back here.

### 4. Install and test

Open the build page on the iPhone in Safari and tap **Install**. Then run the same test as on Android (see [remote-favorites.md](remote-favorites.md#testing-offline)).

If sign-in fails on iOS but works on Android, check whether the iOS app also needs to be added in the Clerk dashboard. The app uses Clerk's native sign-in components.

### Free option: build with Xcode

Without a paid account, build and install directly from Xcode on the Mac with a free Apple ID:

1. Connect the iPhone with a USB cable and trust the Mac when asked.
2. Run:
   ```bash
   npx expo run:ios --device --configuration Release
   ```
   Pick the iPhone from the list. `Release` builds the JavaScript into the app, so it works without the dev server and can be tested offline.
3. If Xcode asks for a signing team, choose your free Apple ID's personal team.
4. Turn on Developer Mode on the iPhone, as in step 3 above.

Notes:

- With a free Apple ID, the app stops opening after 7 days. Run the command again to reinstall it.
- This is a local build, so it reads `.env` on the Mac, not the EAS environment.
- The command generates an `ios/` folder. It is git-ignored and generated from `app.json`, so don't edit it by hand.

## Production builds

The `production` environment on EAS does not have `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` yet. Set it before the first production build:

```bash
npx eas-cli@latest env:set production --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value <key> --visibility plaintext
```

The `production` profile also has no `"distribution": "internal"`, so it builds an app bundle for the Play Store rather than an APK you can install directly.
