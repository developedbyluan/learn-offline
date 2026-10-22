import { globalStyles } from "@/styles/global";
import { View, Text } from "react-native";

export default function SettingsScreen() {
  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Settings</Text>
    </View>
  );
}
