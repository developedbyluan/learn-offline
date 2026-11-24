# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

# How to run this project on a real android phone

This project uses native Clerk components, so I’ll check whether it can run in Expo Go or needs a development build on the phone.

Use a development build on the phone, then start the project from this Mac. Expo Go cannot run this app, because it depends on `@clerk/expo-native-components` and `expo-dev-client`.

1. On the phone, turn on Developer options and USB debugging. You only need USB debugging if you install over a cable. For the steps below, downloading the APK is enough.
2. Build an installable development APK:

```bash
eas build -p android --profile development
```

The `development` profile in `eas.json` includes the dev client and uses internal distribution, so the result is an APK. 

When the build finishes, open the build page on the phone, download the APK, and install it. 

The file should be tens of megabytes. 

If Android says the package is invalid, delete that download 

and get it again from the build page while logged into the `speakfc` Expo account.

3. Connect the phone and this Mac to the same Wi-Fi. 

In the project folder, start the dev server:

```bash
npx expo start
```

4. Open the installed development app on the phone. 

It will show a screen for connecting to the dev server. 

Scan the QR code from the terminal, or enter the `exp://` URL shown there.

The phone loads the JavaScript from your Mac, so edits reload on the device. 

`.env` is read by that dev server, including `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

If the phone cannot reach the Mac, stop the server and run `npx expo start --tunnel`.

A preview or production APK is a separate thing: it already contains the JavaScript and does not connect to this dev server. 

Use the development build while you are changing the app.

# Handle MP4 File with Unusual Header
which causes the player to unable to read the mp4's duration.

Check this specific favorite item for me:
```json
{
    "id": 365,
    "mediaId": 191,
    "createdAt": 1794938598,
    "fileName": "Macy's Thanksgiving Day Parade turns 100",
    "fileSlug": "macy-s-thanksgiving-day-parade-turns-100",
    "fileStatus": "pending",
    "fileAuthor": "Luan T.",
    "fileAuthorUrl": "https://www.speakfc.com",
    "fileType": "vocab",
    "fileThumbnailUrl": "https://cdn.britannica.com/40/263240-050-7B90362B/Turkey-float-Macys-Thanksgiving-Day-Parade-November-2023-New-York.jpg",
    "fileProjectId": 10,
    "fileFolderId": 59,
    "fileOrder": 0.2,
    "fileUrl": "https://media.speakfc.com/lict-chapter2/macy-s-thanksgiving-day-parade-turns-100.mp4",
    "fileJsonId": 185
  },
```
it looks like the app is unable to calculate the duration because the end time on the seek bar show "00:00" so users can seek, they must play from start to finish.

This issue doesn't happen to other videos, like this one:
```
{
    "id": 314,
    "mediaId": 157,
    "createdAt": 1790088932,
    "fileName": "The X Sound (3/3)",
    "fileSlug": "the-x-sound-3-of-3",
    "fileStatus": "processing",
    "fileAuthor": "Paul Gruber",
    "fileAuthorUrl": "https://www.miraclepronunciation.com",
    "fileType": "video",
    "fileThumbnailUrl": "https://media.speakfc.com/u11-the-x-sound-thumbnail.png",
    "fileProjectId": 3,
    "fileFolderId": 49,
    "fileOrder": 2,
    "fileUrl": "https://media.speakfc.com/unit-11-part-3-of-3.mp4",
    "fileJsonId": 148
  }
```

or this one:
```
{
    "id": 369,
    "mediaId": 187,
    "createdAt": 1795333884,
    "fileName": "Will Arrives at Monica's Apartment for Thanksgiving",
    "fileSlug": "will-arrives-at-monica-s-apartment-for-thanksgiving",
    "fileStatus": "completed",
    "fileAuthor": "Luan T.",
    "fileAuthorUrl": "https://www.speakfc.com",
    "fileType": "vocab",
    "fileThumbnailUrl": "https://media.speakfc.com/lict-chapter2/will-arrives-at-monica-s-house-on-thanksgiving-sm.png",
    "fileProjectId": 10,
    "fileFolderId": 59,
    "fileOrder": 0,
    "fileUrl": "https://media.speakfc.com/lict-chapter2/will-arrives-at-monica-home-on-thanksgiving-sm.mp4",
    "fileJsonId": 181
  },
```
This isn't an app bug. That one MP4 is saved in a format that doesn't record its own length.

**What's different about the file.** I read the internal layout of the broken video and of one that works:

| | Macy's Parade (broken) | Will Arrives… (works) |
|---|---|---|
| Layout | **Fragmented MP4**: a near-empty header, followed by hundreds of small pieces | Regular MP4: one block of video, then a full index |
| Stated length | **0** in the main header, **0** in the video track, **0** in the audio track | 122.25 s |
| Seek index | None. There's only a fragment table at the very end of the file | Full sample table |
| Made by | ffmpeg (`Lavf62.3.100`), with fragmented output turned on | — |

The player reads the length from the file's header, where it's 0, so the seek bar shows 00:00. The seek bar only allows seeking once it knows the length. The video's own player on Android also usually treats a fragmented file without a seek index as one you can't seek. So even if the app worked out the length some other way, seeking would probably still fail.

**The fix is on the server: rewrite the file without re-encoding it.** It takes a few seconds and the quality doesn't change:

```bash
ffmpeg -i macy-s-thanksgiving-day-parade-turns-100.mp4 -c copy -movflags +faststart fixed.mp4
```

Upload `fixed.mp4` to the same URL. `+faststart` also moves the index to the front, which helps when someone plays the video online.

**Then on the phone:** the app keeps the copy it already downloaded, so tap the checkmark to remove it, then download it again.

**Why it happened:** something in the pipeline ran ffmpeg with fragmented output, for example `-movflags frag_keyframe+empty_moov`. Recording or streaming tools often do this. Other new uploads made the same way will have the same problem, so it's worth finding that step. The `vocab` items in `lict-chapter2` are the likely place, since this is one of them.

If you want, I can write a small script that checks every `fileUrl` in your favorites for this problem without downloading the whole files.