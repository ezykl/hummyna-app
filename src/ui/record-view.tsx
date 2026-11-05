import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecorderStatus } from "../audio/use-recorder";

export function formatElapsed(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function RecordView({
  title,
  singer,
  status,
  elapsedSec,
  level,
  error,
  onStart,
  onStop,
}: {
  title: string;
  singer: string;
  status: RecorderStatus;
  elapsedSec: number;
  level: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = status === "recording";
  const busy = status === "preparing" || status === "saving";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{singer}</Text>
      {error ? (
        <Text testID="recorder-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.round(Math.min(1, level) * 100)}%` }]} />
      </View>
      <Text style={styles.time}>{formatElapsed(elapsedSec)}</Text>
      <Pressable
        testID="record-button"
        accessibilityRole="button"
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={recording ? onStop : onStart}
      >
        <Text style={styles.buttonText}>{recording ? "Stop" : "Record"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { opacity: 0.7 },
  error: { color: "#b00020" },
  meterTrack: { width: "80%", height: 10, borderRadius: 5, backgroundColor: "#e2e8f0", overflow: "hidden" },
  meterFill: { height: 10, backgroundColor: "#2f855a" },
  time: { fontSize: 28, fontVariant: ["tabular-nums"] },
  button: { backgroundColor: "#c53030", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
});
