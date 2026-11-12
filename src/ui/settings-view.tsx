import { Pressable, StyleSheet, Text, View } from "react-native";

export function SettingsView({
  soundFontName,
  onSelect,
  onClear,
}: {
  soundFontName: string | null;
  onSelect: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>SoundFont</Text>
      <Text style={styles.status}>{soundFontName ?? "None selected."}</Text>
      <Pressable style={styles.button} onPress={onSelect} accessibilityRole="button">
        <Text style={styles.buttonText}>Select SoundFont</Text>
      </Pressable>
      {soundFontName ? (
        <Pressable onPress={onClear} accessibilityRole="button">
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      ) : null}
      <Text style={styles.hint}>
        Pick a General MIDI SoundFont (.sf2/.sf3). It is copied into the app so playback has sound.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: "700" },
  status: { fontSize: 16 },
  button: { backgroundColor: "#2b6cb0", padding: 12, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "600" },
  clear: { color: "#b00020", fontWeight: "600", textAlign: "center", paddingVertical: 8 },
  hint: { opacity: 0.6, marginTop: 4 },
});
