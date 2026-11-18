import { Stack } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";

function BrandHeader() {
  return (
    <View style={styles.brand}>
      <Image
        source={require("../../assets/images/mascot-header.png")}
        style={styles.logo}
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.wordmark}>HumMyna</Text>
    </View>
  );
}

export default function RootLayout() {
  return <Stack screenOptions={{ headerTitle: BrandHeader, headerTitleAlign: "left" }} />;
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 28, height: 28 },
  wordmark: { fontWeight: "700", fontSize: 18 },
});
