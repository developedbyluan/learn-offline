import { Platform, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useFonts } from "expo-font";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols/400Regular";

// iOS: SF Symbols names. Android and web: Material Symbols codepoints
// (shown as "Code point" on the icon's page at fonts.google.com/icons).
const ICONS = {
  // Circle with a down arrow inside (`arrow_circle_down`).
  download: { ios: "arrow.down.circle", material: 0xf181 },
  // Circle with a checkmark inside (`check_circle`).
  downloaded: { ios: "checkmark.circle", material: 0xe86c },
} as const;

type DownloadIconProps = {
  size?: number;
  color?: string;
  downloaded?: boolean;
};

export default function DownloadIcon(props: DownloadIconProps) {
  return Platform.OS === "ios" ? <IosIcon {...props} /> : <MaterialIcon {...props} />;
}

function IosIcon({ size = 24, color = "#000000", downloaded = false }: DownloadIconProps) {
  const icon = downloaded ? ICONS.downloaded : ICONS.download;
  return <SymbolView name={icon.ios} size={size} tintColor={color} />;
}

// SymbolView on Android draws the glyph in a Text whose line height equals the font size.
// This font needs about 1.2x that height, so the bottom of the icon gets cut off.
// Here the Text keeps its natural height and ignores the system font scale, so the glyph fits.
function MaterialIcon({ size = 24, color = "#000000", downloaded = false }: DownloadIconProps) {
  const [loaded] = useFonts({ MaterialSymbols_400Regular });
  const icon = downloaded ? ICONS.downloaded : ICONS.download;

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {loaded && (
        <Text
          allowFontScaling={false}
          style={[styles.glyph, { fontSize: size, color }]}
        >
          {String.fromCodePoint(icon.material)}
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
