import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export interface PickedLibrary {
  uri: string;
  name: string;
}

/** Pure: derive a display name for an (optionally percent-encoded) SAF/file URI. */
export function hmpNameFromUri(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // a stray '%' makes the URI undecodable — fall back to the raw string
  }
  return decoded.split(/[\\/]/).pop() ?? decoded;
}

export function isHmpName(name: string): boolean {
  return name.toLowerCase().endsWith(".hmp");
}

export interface SafLister {
  /** Lists child URIs of a SAF directory; rejects when the URI is not a directory. */
  listDirectory(dirUri: string): Promise<string[]>;
}

/**
 * Depth-first collection of `.hmp` files under a SAF folder. Non-library
 * children are probed as directories (a failed listing is a file), bounded by
 * `maxDepth` and protected against cycles.
 */
export async function collectHmpUris(
  lister: SafLister,
  rootUri: string,
  maxDepth = 3,
): Promise<PickedLibrary[]> {
  const found: PickedLibrary[] = [];
  const seen = new Set<string>([rootUri]);

  const walk = async (dirUri: string, depth: number): Promise<void> => {
    let children: string[];
    try {
      children = await lister.listDirectory(dirUri);
    } catch {
      return; // not a directory (or unreadable)
    }
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      if (isHmpName(hmpNameFromUri(child))) {
        found.push({ uri: child, name: hmpNameFromUri(child) });
      } else if (depth < maxDepth) {
        await walk(child, depth + 1);
      }
    }
  };

  await walk(rootUri, 0);
  return found;
}

const safLister: SafLister = {
  listDirectory: (dirUri: string) => FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri),
};

/**
 * Lets the user point the app at a folder of `.hmp` libraries and returns the
 * ones found (including nested folders). Android uses a SAF folder grant that
 * is persisted, so it can be re-scanned later without prompting; iOS lists the
 * Files-visible app Documents folder (`UIFileSharingEnabled`).
 *
 * Device check (manual): grant a folder on Android / drop a `.hmp` in the app
 * Documents folder on iOS and confirm the file appears.
 */
export async function pickHmpFiles(): Promise<PickedLibrary[]> {
  return Platform.OS === "android" ? pickAndroid() : pickIos();
}

async function pickAndroid(): Promise<PickedLibrary[]> {
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return [];
  await savePersistedLibraryFolder(permission.directoryUri);
  return collectHmpUris(safLister, permission.directoryUri);
}

const FOLDER_FILE = ".hmp-library-folder.json";

/** The SAF folder persisted from the last successful pick, if any. */
export async function getPersistedLibraryFolder(): Promise<string | null> {
  try {
    const file = new File(Paths.document, FOLDER_FILE);
    if (!file.exists) return null;
    const stored = (await file.json()) as { directoryUri?: string } | null;
    const uri = stored?.directoryUri;
    return typeof uri === "string" && uri.length > 0 ? uri : null;
  } catch {
    return null;
  }
}

export async function savePersistedLibraryFolder(directoryUri: string): Promise<void> {
  const file = new File(Paths.document, FOLDER_FILE);
  if (!file.exists) file.create();
  await file.write(JSON.stringify({ directoryUri }));
}

export async function clearPersistedLibraryFolder(): Promise<void> {
  const file = new File(Paths.document, FOLDER_FILE);
  if (file.exists) file.delete();
}

/** Re-scans the previously granted folder (no prompt). Android only. */
export async function rescanLibraryFolder(): Promise<PickedLibrary[]> {
  if (Platform.OS !== "android") return [];
  const dirUri = await getPersistedLibraryFolder();
  if (!dirUri) return [];
  try {
    await safLister.listDirectory(dirUri);
  } catch {
    // The grant was revoked (or the folder moved) — forget it so the user can re-pick.
    await clearPersistedLibraryFolder();
    throw new Error("Saved folder access was revoked — pick the folder again.");
  }
  return collectHmpUris(safLister, dirUri);
}

function pickIos(): PickedLibrary[] {
  const documents: Directory = Paths.document;
  if (!documents.exists) return [];
  const picked: PickedLibrary[] = [];
  for (const entry of documents.list()) {
    if (entry instanceof File && isHmpName(entry.name)) {
      picked.push({ uri: entry.uri, name: entry.name });
    }
  }
  return picked;
}
