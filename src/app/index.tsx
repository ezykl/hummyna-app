import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import type { PickedLibrary } from "../platform/pick-library";
import type { Library, LibraryStore } from "../library/db";
import { openLibraryDb } from "../library/db";
import { importLibrary } from "../library/import";
import { libraryKeys } from "../library/keys";
import { deleteLibraryFile, formatUsage, libraryUsage } from "../library/storage";
import { fileByteSource } from "../platform/file-byte-source";
import { getPersistedLibraryFolder, pickHmpFiles, rescanLibraryFolder } from "../platform/pick-library";
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
  const [canRescan, setCanRescan] = useState(false);

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
      setCanRescan(Platform.OS === "android" && (await getPersistedLibraryFolder()) !== null);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const importFiles = useCallback(
    async (picked: PickedLibrary[], keys: ReturnType<typeof libraryKeys>) => {
      if (!store || picked.length === 0) {
        if (Platform.OS !== "android") Alert.alert("Import", "No .hmp files found.");
        return;
      }
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
      setCanRescan(Platform.OS === "android" && (await getPersistedLibraryFolder()) !== null);
      Alert.alert("Import", importSummary(imported, failed));
    },
    [store, refresh],
  );

  const onImport = useCallback(async () => {
    try {
      libraryKeys(); // surface a missing key config before the picker opens
      await importFiles(await pickHmpFiles(), libraryKeys());
    } catch (err) {
      Alert.alert("Import failed", err instanceof Error ? err.message : String(err));
    }
  }, [importFiles]);

  const onRescan = useCallback(async () => {
    try {
      await importFiles(await rescanLibraryFolder(), libraryKeys());
    } catch (err) {
      Alert.alert("Re-scan failed", err instanceof Error ? err.message : String(err));
    }
  }, [importFiles]);

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
      onRescan={canRescan ? () => void onRescan() : undefined}
      onSettings={() => router.push("/settings")}
      onOpen={(lib) => router.push({ pathname: "/library/[id]", params: { id: String(lib.id) } })}
    />
  );
}
