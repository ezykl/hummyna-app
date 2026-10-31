import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { Library, LibraryStore } from "../../library/db";
import { openLibraryDb } from "../../library/db";
import { LibraryDetailView } from "../../ui/library-view";

export default function LibraryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [store, setStore] = useState<LibraryStore | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);

  useEffect(() => {
    let active = true;
    openLibraryDb().then(async (s) => {
      if (!active) return;
      const libs = await s.listLibraries();
      setStore(s);
      setLibrary(libs.find((l) => String(l.id) === String(id)) ?? null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (!store || !library) return <Text style={{ padding: 16 }}>Loading…</Text>;
  return <LibraryDetailView library={library} store={store} />;
}
