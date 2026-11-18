import { globalStyles } from "@/styles/global";
import { UserButton } from "@clerk/expo/native-components";
import { View, Text } from "react-native";

export default function SettingsScreen() {
  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Settings</Text>
      <UserButton />
    </View>
  );
}
