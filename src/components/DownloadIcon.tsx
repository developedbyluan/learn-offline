import { Platform, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useFonts } from "expo-font";
import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols/400Regular";
import { MaterialSymbols_400Regular_Filled } from "@expo-google-fonts/material-symbols/400Regular_Filled";
import { colors } from "@/styles/global";

// iOS: SF Symbols names. Android and web: Material Symbols codepoints
// (shown as "Code point" on the icon's page at fonts.google.com/icons).
const ICONS = {
  // Outlined circle with a down arrow inside (`arrow_circle_down`).
  download: { ios: "arrow.down.circle", material: 0xf181 },
  // Filled blue circle with a white checkmark (`check_circle`, filled style).
  downloaded: { ios: "checkmark.circle.fill", material: 0xe86c },
} as const;

const CHECK_CIRCLE_COLOR = colors.accent;
const CHECKMARK_COLOR = "#FFFFFF";

type DownloadIconProps = {
  size?: number;
  // Color of the download icon. The downloaded icon always uses the blue and white above.
  color?: string;
  downloaded?: boolean;
};

export default function DownloadIcon(props: DownloadIconProps) {
  return Platform.OS === "ios" ? <IosIcon {...props} /> : <MaterialIcon {...props} />;
}

function IosIcon({ size = 24, color = "#000000", downloaded = false }: DownloadIconProps) {
  if (downloaded) {
    // Palette colors go to the symbol's layers in order: the checkmark, then the circle.
    return (
      <SymbolView
        name={ICONS.downloaded.ios}
        size={size}
        type="palette"
        colors={[CHECKMARK_COLOR, CHECK_CIRCLE_COLOR]}
      />
    );
  }
  return <SymbolView name={ICONS.download.ios} size={size} tintColor={color} />;
}

// SymbolView on Android draws the glyph in a Text whose line height equals the font size.
// This font needs about 1.2x that height, so the bottom of the icon gets cut off.
// Here the Text keeps its natural height and ignores the system font scale, so the glyph fits.
function MaterialIcon({ size = 24, color = "#000000", downloaded = false }: DownloadIconProps) {
  const [loaded] = useFonts({ MaterialSymbols_400Regular, MaterialSymbols_400Regular_Filled });

  if (!downloaded) {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        {loaded && (
          <Text
            allowFontScaling={false}
            style={[styles.glyph, { fontSize: size, color }]}
          >
            {String.fromCodePoint(ICONS.download.material)}
          </Text>
        )}
      </View>
    );
  }

  // The filled check_circle's checkmark is a see-through cutout, so a white disc behind it
  // makes the checkmark white on any background.
  const discSize = Math.round(size * 0.6);
  const discOffset = (size - discSize) / 2;

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {loaded && (
        <>
          <View
            style={[
              styles.disc,
              {
                width: discSize,
                height: discSize,
                borderRadius: discSize / 2,
                top: discOffset,
                left: discOffset,
              },
            ]}
          />
          <Text
            allowFontScaling={false}
            style={[styles.glyphFilled, { fontSize: size, color: CHECK_CIRCLE_COLOR }]}
          >
            {String.fromCodePoint(ICONS.downloaded.material)}
          </Text>
        </>
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
  disc: {
    position: "absolute",
    backgroundColor: CHECKMARK_COLOR,
  },
});
