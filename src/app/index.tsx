import { useAuth } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native-components";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Button,
  Modal,
} from "react-native";

export default function MainScreen() {
  const { isSignedIn, isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  if (!isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.container}>
      <Button title="Sign In" onPress={() => setIsAuthOpen(true)} />
      <Modal
        animationType="slide"
        visible={isAuthOpen}
        presentationStyle="pageSheet"
        onRequestClose={() => setIsAuthOpen(false)}
      >
        <AuthView onDismiss={() => setIsAuthOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
