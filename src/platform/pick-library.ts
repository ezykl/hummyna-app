import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export interface PickedLibrary {
  uri: string;
  name: string;
}

/** Pure: derive a display name for an (optionally percent-encoded) SAF/file URI. */
export function hmpNameFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const last = decoded.split(/[\\/]/).pop() ?? decoded;
  return last;
}

export function isHmpName(name: string): boolean {
  return name.toLowerCase().endsWith(".hmp");
}

/**
 * Lets the user point the app at a folder of `.hmp` libraries and returns the
 * ones found. Android uses a persisted SAF folder grant (read in place);
 * iOS lists the Files-visible app Documents folder (`UIFileSharingEnabled`).
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
  const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(permission.directoryUri);
  const picked: PickedLibrary[] = [];
  for (const uri of uris) {
    const name = hmpNameFromUri(uri);
    if (isHmpName(name)) picked.push({ uri, name });
  }
  return picked;
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
