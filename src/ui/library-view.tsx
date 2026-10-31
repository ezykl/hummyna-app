import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Library, LibraryStore, Song } from "../library/store";

export function LibrariesView({
  libraries,
  onImport,
  onOpen,
}: {
  libraries: Library[];
  onImport: () => void;
  onOpen?: (library: Library) => void;
}) {
  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={onImport} accessibilityRole="button">
        <Text style={styles.buttonText}>Import library</Text>
      </Pressable>
      <FlatList
        data={libraries}
        keyExtractor={(l) => String(l.id)}
        ListEmptyComponent={<Text style={styles.empty}>No libraries yet. Import a folder of .hmp files.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onOpen?.(item)}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.sub}>{item.songCount} songs</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export function LibraryDetailView({ library, store }: { library: Library; store: LibraryStore }) {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    let active = true;
    store.searchSongs(query).then((rows) => {
      if (active) setSongs(rows);
    });
    return () => {
      active = false;
    };
  }, [query, store]);

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
          <View style={styles.row}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>{item.singer}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 24, fontWeight: "700" },
  button: { backgroundColor: "#2b6cb0", padding: 12, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd" },
  title: { fontSize: 16, fontWeight: "600" },
  sub: { opacity: 0.6 },
  empty: { opacity: 0.6, paddingVertical: 24, textAlign: "center" },
});
