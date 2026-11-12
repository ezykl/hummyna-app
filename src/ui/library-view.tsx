import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Library, LibraryStore, Song } from "../library/store";

export function LibrariesView({
  libraries,
  onImport,
  onOpen,
  onDelete,
  onSettings,
  summary,
}: {
  libraries: Library[];
  onImport: () => void;
  onOpen?: (library: Library) => void;
  onDelete?: (library: Library) => void;
  onSettings?: () => void;
  summary?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.grow]} onPress={onImport} accessibilityRole="button">
          <Text style={styles.buttonText}>Import library</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onSettings} accessibilityRole="button">
          <Text style={styles.secondaryText}>Settings</Text>
        </Pressable>
      </View>
      {summary ? <Text style={styles.sub}>{summary}</Text> : null}
      <FlatList
        data={libraries}
        keyExtractor={(l) => String(l.id)}
        ListEmptyComponent={<Text style={styles.empty}>No libraries yet. Import a folder of .hmp files.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => onOpen?.(item)}
            onLongPress={() => onDelete?.(item)}
          >
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.sub}>{item.songCount} songs</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export function LibraryDetailView({
  library,
  store,
  onOpenSong,
}: {
  library: Library;
  store: LibraryStore;
  onOpenSong?: (song: Song) => void;
}) {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    let active = true;
    store.searchSongs(query, { libraryId: library.id }).then((rows) => {
      if (active) setSongs(rows);
    });
    return () => {
      active = false;
    };
  }, [query, store, library.id]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{library.name}</Text>
      <TextInput
        style={styles.input}
        placeholder="Search by title, number, or singer"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <FlatList
        data={songs}
        keyExtractor={(s) => String(s.id)}
        ListEmptyComponent={<Text style={styles.empty}>No matching songs.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onOpenSong?.(item)}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>{item.singer}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 24, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  grow: { flex: 1 },
  button: { backgroundColor: "#2b6cb0", padding: 12, borderRadius: 8, alignItems: "center" },
  secondary: { borderWidth: 1, borderColor: "#2b6cb0", paddingHorizontal: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#2b6cb0", fontWeight: "600" },
  buttonText: { color: "white", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd" },
  title: { fontSize: 16, fontWeight: "600" },
  sub: { opacity: 0.6 },
  empty: { opacity: 0.6, paddingVertical: 24, textAlign: "center" },
});
