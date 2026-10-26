import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HumMyna</Text>
      <Text style={styles.sub}>Your MIDI. Your karaoke. Anywhere.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  title: { fontSize: 32, fontWeight: "700" },
  sub: { opacity: 0.7, textAlign: "center" },
});
