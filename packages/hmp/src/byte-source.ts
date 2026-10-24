export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function memoryByteSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(offset: number, length: number): Promise<Uint8Array> {
      if (offset >= bytes.length) return new Uint8Array(0);
      return bytes.subarray(offset, Math.min(offset + length, bytes.length));
    },
  };
}
