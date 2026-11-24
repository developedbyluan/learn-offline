import { Platform, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useFonts } from "expo-font";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols/400Regular";
import { MaterialSymbols_400Regular_Filled } from "@expo-google-fonts/material-symbols/400Regular_Filled";

// iOS: SF Symbols names. Android and web: Material Symbols codepoints
// (shown as "Code point" on the icon's page at fonts.google.com/icons).
const ICONS = {
  chevronUp: { ios: "chevron.up", material: 0xe5ce, filled: false }, // expand_less
  chevronDown: { ios: "chevron.down", material: 0xe5cf, filled: false }, // expand_more
  play: { ios: "play.fill", material: 0xe037, filled: true }, // play_arrow
  pause: { ios: "pause.fill", material: 0xe034, filled: true }, // pause
  back5: { ios: "gobackward.5", material: 0xe05b, filled: false }, // replay_5
  forward5: { ios: "goforward.5", material: 0xe058, filled: false }, // forward_5
  fullscreen: { ios: "arrow.up.left.and.arrow.down.right", material: 0xe5d0, filled: false }, // fullscreen
  star: { ios: "star", material: 0xe838, filled: false }, // star
  textSize: { ios: "textformat.size", material: 0xe245, filled: false }, // format_size
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export default function Icon(props: IconProps) {
  return Platform.OS === "ios" ? <IosIcon {...props} /> : <MaterialIcon {...props} />;
}

function IosIcon({ name, size = 24, color = "#000000" }: IconProps) {
  return <SymbolView name={ICONS[name].ios} size={size} tintColor={color} />;
}

// Drawn as a font character with its natural line height, like DownloadIcon, because
// SymbolView on Android cuts off the bottom of Material Symbols glyphs.
function MaterialIcon({ name, size = 24, color = "#000000" }: IconProps) {
  const [loaded] = useFonts({ MaterialSymbols_400Regular, MaterialSymbols_400Regular_Filled });
  const icon = ICONS[name];

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {loaded && (
        <Text
          allowFontScaling={false}
          style={[
            icon.filled ? styles.glyphFilled : styles.glyph,
            { fontSize: size, color },
          ]}
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
  glyphFilled: {
    fontFamily: "MaterialSymbols_400Regular_Filled",
    includeFontPadding: false,
  },
});
