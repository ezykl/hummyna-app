import type { ByteSource } from "@hummyna/hmp";
import { File, FileMode } from "expo-file-system";

export interface Range {
  offset: number;
  length: number;
}

/**
 * Clamps a requested read to the file bounds without allocating.
 * Returns `length: 0` for offsets at or past EOF (the caller returns an empty read).
 */
export function clampRead(offset: number, length: number, size: number): Range {
  const start = Math.max(0, Math.min(offset, size));
  const end = Math.max(start, Math.min(offset + length, size));
  return { offset: start, length: end - start };
}

export interface DisposableByteSource extends ByteSource {
  /** Releases the underlying file descriptor. Call when done reading. */
  close(): void;
}

interface Handle {
  offset: number | null;
  readBytes(length: number): Promise<Uint8Array>;
}

/**
 * Builds a `ByteSource` over a positioned handle. Reads are serialized because
 * the handle shares a single mutable offset — concurrent reads would race it.
 */
export function byteSourceFromHandle(size: number, handle: Handle): ByteSource {
  let queue: Promise<unknown> = Promise.resolve();

  const readAt = async (offset: number, length: number): Promise<Uint8Array> => {
    handle.offset = offset;
    return handle.readBytes(length);
  };

  return {
    size,
    read(offset: number, length: number): Promise<Uint8Array> {
      const { offset: at, length: n } = clampRead(offset, length, size);
      if (n === 0) return Promise.resolve(new Uint8Array(0));
      const next = queue.then(() => readAt(at, n), () => readAt(at, n));
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}

/**
 * A random-access `ByteSource` over a `content://` (Android SAF) or `file://`
 * (iOS container) URI, reading `.hmp` files in place.
 *
 * Device check (manual): grant an Android SAF folder and confirm a `.hmp`
 * opens; the safe default for `content://` is `FileMode.ReadOnly`.
 */
export async function fileByteSource(uri: string): Promise<DisposableByteSource> {
  const file = new File(uri);
  const size = file.size;
  const handle = file.open(FileMode.ReadOnly);
  const source = byteSourceFromHandle(size, {
    get offset() {
      return handle.offset;
    },
    set offset(value: number | null) {
      handle.offset = value;
    },
    readBytes: (length: number) => handle.readBytes(length),
  });
  return {
    size: source.size,
    read: (offset, length) => source.read(offset, length),
    close: () => handle.close(),
  };
}
