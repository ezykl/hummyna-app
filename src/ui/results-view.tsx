import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ScoreResult } from "../score/score";

export function ResultsView({
  result,
  funMode = false,
  onSingAgain,
}: {
  result: ScoreResult;
  funMode?: boolean;
  onSingAgain: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {funMode ? <Text style={styles.fun}>Fun mode — not mic-based.</Text> : null}
      <Text style={styles.grade}>{result.grade}</Text>
      <Text style={styles.percent}>{Math.round(result.accuracy * 100)}%</Text>
      <Text style={styles.sub}>
        {result.hitCount} / {result.noteCount} notes · best streak {result.bestStreak}
      </Text>
      {result.lines.length > 0 ? (
        <View style={styles.lines}>
          {result.lines.map((line, index) => (
            <View key={index} style={styles.lineRow}>
              <View style={styles.lineTrack}>
                <View style={[styles.lineFill, { width: `${Math.round(line.accuracy * 100)}%` }]} />
              </View>
              <Text style={styles.lineText}>{Math.round(line.accuracy * 100)}%</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable style={styles.button} onPress={onSingAgain} accessibilityRole="button">
        <Text style={styles.buttonText}>Sing again</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, alignItems: "center" },
  fun: { color: "#b7791f", fontWeight: "700" },
  grade: { fontSize: 72, fontWeight: "800" },
  percent: { fontSize: 28, fontWeight: "700" },
  sub: { opacity: 0.7 },
  lines: { alignSelf: "stretch", gap: 6, marginTop: 8 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#e2e8f0", overflow: "hidden" },
  lineFill: { height: 8, backgroundColor: "#2b6cb0" },
  lineText: { width: 44, textAlign: "right", fontVariant: ["tabular-nums"] },
  button: { marginTop: 16, backgroundColor: "#2b6cb0", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "white", fontWeight: "700" },
});
