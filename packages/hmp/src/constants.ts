export const MAGIC_HEADER = new Uint8Array([0x48, 0x4d, 0x50, 0x31]);
export const MAGIC_FOOTER = new Uint8Array([0x48, 0x4d, 0x50, 0x45]);
export const FORMAT_VERSION = 1;
export const MAX_SONGS = 100_000;
export const HEADER_SIZE = 16;
export const FOOTER_SIZE = 76; // indexOffset u64 + signature 64 + magic 4
export const SECTOR_HINT = 2048; // reserved, unused in v1
