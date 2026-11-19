import { ClerkProvider } from "@clerk/expo";
import { resourceCache } from "@clerk/expo/resource-cache";
import { tokenCache } from "@clerk/expo/token-cache";
import { Slot } from "expo-router";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error("Add your clerk publishable key to your .env file");
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      // Experimental: saves Clerk's session data on the device so a signed-in
      // user can open the app with no internet connection.
      __experimental_resourceCache={resourceCache}
    >
      <Slot />
    </ClerkProvider>
  );
}
