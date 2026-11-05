import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TakeRecord } from "../library/takes";

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatTakeDate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function TakesView({
  takes,
  onPlay,
  onDelete,
}: {
  takes: TakeRecord[];
  onPlay: (take: TakeRecord) => void;
  onDelete: (take: TakeRecord) => void;
}) {
  if (takes.length === 0) {
    return <Text style={styles.empty}>No takes yet.</Text>;
  }
  return (
    <View style={styles.container}>
      {takes.map((take) => (
        <View key={take.id} style={styles.row}>
          <Text style={styles.meta}>
            {formatTakeDate(take.createdAt)} · {formatDuration(take.durationMs)}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => onPlay(take)}>
              <Text style={styles.action}>Play</Text>
            </Pressable>
            <Pressable onPress={() => onDelete(take)}>
              <Text style={styles.actionDanger}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd" },
  meta: { fontSize: 15 },
  actions: { flexDirection: "row", gap: 16 },
  action: { color: "#2b6cb0", fontWeight: "600" },
  actionDanger: { color: "#b00020", fontWeight: "600" },
  empty: { opacity: 0.6, padding: 16, textAlign: "center" },
});
