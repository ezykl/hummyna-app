import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import type { Library, LibraryStore } from "../library/db";
import { openLibraryDb } from "../library/db";
import { importLibrary } from "../library/import";
import { libraryKeys } from "../library/keys";
import { deleteLibraryFile, formatUsage, libraryUsage } from "../library/storage";
import { fileByteSource } from "../platform/file-byte-source";
import { pickHmpFiles } from "../platform/pick-library";
import { rnCryptoAdapter } from "../platform/rn-crypto";
import { rnInflateAdapter } from "../platform/rn-inflate";
import { LibrariesView } from "../ui/library-view";

function importSummary(imported: number, failed: number): string {
  if (imported === 0 && failed === 0) return "No .hmp files found.";
  if (failed > 0) return `Imported ${imported}, skipped ${failed}.`;
  return `Imported ${imported} ${imported === 1 ? "library" : "libraries"}.`;
}

export default function LibrariesScreen() {
  const router = useRouter();
  const [store, setStore] = useState<LibraryStore | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [summary, setSummary] = useState("");

  const refresh = useCallback(async (s: LibraryStore) => {
    setLibraries(await s.listLibraries());
    setSummary(formatUsage(await libraryUsage(s)));
  }, []);

  useEffect(() => {
    let active = true;
    openLibraryDb().then(async (s) => {
      if (!active) return;
      setStore(s);
      await refresh(s);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const onImport = useCallback(async () => {
    if (!store) return;
    try {
      const keys = libraryKeys();
      const picked = await pickHmpFiles();
      let imported = 0;
      let failed = 0;
      for (const file of picked) {
        try {
          await importLibrary(file.uri, file.name, {
            sourceFor: fileByteSource,
            keys,
            store,
            crypto: rnCryptoAdapter,
            inflate: rnInflateAdapter,
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      await refresh(store);
      Alert.alert("Import", importSummary(imported, failed));
    } catch (err) {
      Alert.alert("Import failed", err instanceof Error ? err.message : String(err));
    }
  }, [store, refresh]);

  const onDelete = useCallback(
    (library: Library) => {
      if (!store) return;
      Alert.alert("Delete library", `Remove "${library.name}" and its ${library.songCount} songs?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await store.deleteLibrary(library.id);
            await deleteLibraryFile(library.path);
            await refresh(store);
          },
        },
      ]);
    },
    [store, refresh],
  );

  return (
    <LibrariesView
      libraries={libraries}
      summary={summary}
      onImport={onImport}
      onDelete={onDelete}
      onOpen={(lib) => router.push({ pathname: "/library/[id]", params: { id: String(lib.id) } })}
    />
  );
}
