import { Platform, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useFonts } from "expo-font";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols/400Regular";

// Circle with a down arrow inside.
// iOS: SF Symbols name. Android and web: Material Symbols codepoint for `arrow_circle_down`
// (shown as "Code point" on the icon's page at fonts.google.com/icons).
const IOS_SYMBOL = "arrow.down.circle";
const MATERIAL_CODEPOINT = 0xf181;

type DownloadIconProps = {
  size?: number;
  color?: string;
};

export default function DownloadIcon(props: DownloadIconProps) {
  return Platform.OS === "ios" ? <IosIcon {...props} /> : <MaterialIcon {...props} />;
}

function IosIcon({ size = 24, color = "#000000" }: DownloadIconProps) {
  return <SymbolView name={IOS_SYMBOL} size={size} tintColor={color} />;
}

// SymbolView on Android draws the glyph in a Text whose line height equals the font size.
// This font needs about 1.2x that height, so the bottom of the icon gets cut off.
// Here the Text keeps its natural height and ignores the system font scale, so the glyph fits.
function MaterialIcon({ size = 24, color = "#000000" }: DownloadIconProps) {
  const [loaded] = useFonts({ MaterialSymbols_400Regular });

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {loaded && (
        <Text
          allowFontScaling={false}
          style={[styles.glyph, { fontSize: size, color }]}
        >
          {String.fromCodePoint(MATERIAL_CODEPOINT)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  glyph: {
    fontFamily: "MaterialSymbols_400Regular",
    includeFontPadding: false,
  },
});
