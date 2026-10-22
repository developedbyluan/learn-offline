import { StyleSheet } from "react-native";

export const colors = {
  primary: "#FFFFFF",
  secondary: "#F5F5F5",
  text: "#000000",
};

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
  },
});
