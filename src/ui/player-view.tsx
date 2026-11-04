import type { LyricLine } from "@hummyna/hmp";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlayerController } from "../audio/use-player";
import { LyricsView } from "./lyrics-view";

const SEEK_STEP_SEC = 10;

export function PlayerView({
  title,
  singer,
  lines,
  controller,
}: {
  title: string;
  singer: string;
  lines: LyricLine[];
  controller: PlayerController;
}) {
  const { status, positionSec, durationSec, error } = controller;
  const fraction = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const playing = status === "playing";
  const disabled = status === "idle" || status === "loading" || status === "error";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{singer}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable disabled={disabled} onPress={() => controller.seek(Math.max(0, positionSec - SEEK_STEP_SEC))}>
          <Text style={styles.button}>-10s</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={controller.toggle}>
          <Text style={styles.button}>{playing ? "Pause" : "Play"}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={controller.stop}>
          <Text style={styles.button}>Stop</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={() => controller.seek(positionSec + SEEK_STEP_SEC)}>
          <Text style={styles.button}>+10s</Text>
        </Pressable>
      </View>
      <LyricsView lines={lines} timeMs={positionSec * 1000} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { opacity: 0.7 },
  error: { color: "#b00020" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#e2e8f0", overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#2b6cb0" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  button: { color: "#2b6cb0", fontWeight: "700", fontSize: 16 },
});
