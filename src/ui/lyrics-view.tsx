import type { LyricLine } from "@hummyna/hmp";
import { ScrollView, StyleSheet, Text } from "react-native";
import { currentLineIndex } from "../lyrics/timeline";

export function LyricsView({
  lines,
  timeMs,
  offsetMs = 0,
}: {
  lines: LyricLine[];
  timeMs: number;
  offsetMs?: number;
}) {
  if (lines.length === 0) {
    return <Text style={styles.empty}>No lyrics for this song.</Text>;
  }
  const active = currentLineIndex(lines, timeMs + offsetMs);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {lines.map((line, index) => (
        <Text
          key={`${line.timeMs}-${index}`}
          testID={index === active ? "lyric-current" : undefined}
          style={[styles.line, index === active && styles.active]}
        >
          {line.text}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12, gap: 10 },
  line: { fontSize: 16, opacity: 0.5 },
  active: { fontSize: 22, fontWeight: "700", opacity: 1 },
  empty: { opacity: 0.6, padding: 16, textAlign: "center" },
});
