import type { CryptoAdapter } from "./adapters/crypto";
import { webCryptoAdapter } from "./adapters/crypto";
import type { InflateAdapter } from "./adapters/inflate";
import { webInflateAdapter } from "./adapters/inflate";
import { aadBytes } from "./bytes";
import type { ByteSource } from "./byte-source";
import {
  FOOTER_SIZE,
  FORMAT_VERSION,
  HEADER_SIZE,
  MAGIC_FOOTER,
  MAGIC_HEADER,
  MAX_SONGS,
} from "./constants";
import type { HmpLibrary, LibraryKeys, SongRef } from "./types";

const KEY_LEN_FIELD_SIZE = 4;
const NONCE_SIZE = 12;
const SIG_SIZE = 64;

const textDecoder = new TextDecoder();

function u32At(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, true);
}

function u64At(b: Uint8Array, off: number): number {
  return Number(new DataView(b.buffer, b.byteOffset + off, 8).getBigUint64(0, true));
}

function matches(b: Uint8Array, off: number, magic: Uint8Array): boolean {
  for (let i = 0; i < magic.length; i++) {
    if (b[off + i] !== magic[i]) return false;
  }
  return true;
}

export interface OpenHmpDeps {
  inflate?: InflateAdapter;
  crypto?: CryptoAdapter;
}

export async function openHmp(
  source: ByteSource,
  keys: LibraryKeys,
  deps: OpenHmpDeps = {},
): Promise<HmpLibrary> {
  const inflate = deps.inflate ?? webInflateAdapter;
  const crypto = deps.crypto ?? webCryptoAdapter;

  const size = source.size;
  if (size < HEADER_SIZE + FOOTER_SIZE) {
    throw new Error(`HmpReader: file truncated (${size} bytes < ${HEADER_SIZE + FOOTER_SIZE} minimum)`);
  }

  const header = await source.read(0, HEADER_SIZE);
  if (!matches(header, 0, MAGIC_HEADER)) {
    throw new Error('HmpReader: bad magic (expected "HMP1")');
  }
  if (header[4] !== FORMAT_VERSION) {
    throw new Error(`HmpReader: unsupported version ${header[4]} (expected ${FORMAT_VERSION})`);
  }
  if (header[5] !== 0) {
    throw new Error(`HmpReader: unsupported flags 0x${header[5].toString(16)} (v1 flags must be 0)`);
  }
  for (let i = 7; i < HEADER_SIZE; i++) {
    if (header[i] !== 0) throw new Error(`HmpReader: reserved header byte ${i} must be 0`);
  }

  const footerAt = size - FOOTER_SIZE;
  if (footerAt < HEADER_SIZE + KEY_LEN_FIELD_SIZE) {
    throw new Error("HmpReader: file truncated (no room for key block)");
  }
  const footer = await source.read(footerAt, FOOTER_SIZE);
  if (!matches(footer, 8 + SIG_SIZE, MAGIC_FOOTER)) {
    throw new Error('HmpReader: footer magic mismatch (expected "HMPE") — file truncated or not an HMP1 file');
  }

  const lenField = await source.read(HEADER_SIZE, KEY_LEN_FIELD_SIZE);
  const wrappedLen = u32At(lenField, 0);
  const keyBlockEnd = HEADER_SIZE + KEY_LEN_FIELD_SIZE + wrappedLen;
  if (wrappedLen < 1 || keyBlockEnd > footerAt) {
    throw new Error(`HmpReader: key block overruns file (wrapped-key length ${wrappedLen})`);
  }

  const indexOffset = u64At(footer, 0);
  if (indexOffset < keyBlockEnd || indexOffset > footerAt - 4) {
    throw new Error(`HmpReader: index offset ${indexOffset} out of range [${keyBlockEnd}, ${footerAt - 4}]`);
  }

  const indexBytes = await source.read(indexOffset, footerAt - indexOffset);
  const count = u32At(indexBytes, 0);
  if (count > MAX_SONGS) {
    throw new Error(`HmpReader: count ${count} exceeds MAX_SONGS (${MAX_SONGS})`);
  }

  let pos = 4;
  const entries: SongRef[] = [];
  for (let i = 0; i < count; i++) {
    const need = (n: number) => {
      if (pos + n > indexBytes.length) throw new Error(`HmpReader: truncated index at entry ${i}`);
    };
    need(4);
    const number = u32At(indexBytes, pos);
    pos += 4;
    need(4);
    const titleLen = u32At(indexBytes, pos);
    pos += 4;
    need(titleLen);
    const title = textDecoder.decode(indexBytes.subarray(pos, pos + titleLen));
    pos += titleLen;
    need(4);
    const singerLen = u32At(indexBytes, pos);
    pos += 4;
    need(singerLen);
    const singer = textDecoder.decode(indexBytes.subarray(pos, pos + singerLen));
    pos += singerLen;
    need(8);
    const offset = u64At(indexBytes, pos);
    pos += 8;
    need(4);
    const length = u32At(indexBytes, pos);
    pos += 4;
    need(NONCE_SIZE);
    pos += NONCE_SIZE;
    entries.push({ number, title, singer, offset, length });
  }
  if (pos !== indexBytes.length) {
    throw new Error(`HmpReader: index length mismatch (parsed to ${pos}, footer at ${footerAt})`);
  }

  const wrapped = await source.read(HEADER_SIZE + KEY_LEN_FIELD_SIZE, wrappedLen);
  let contentKeyPromise: Promise<Uint8Array> | null = null;
  const contentKey = (): Promise<Uint8Array> => {
    if (!contentKeyPromise) {
      contentKeyPromise = (async () => {
        const wrapPriv = await crypto.importWrapPrivate(keys.wrapPrivateJwk);
        try {
          return await crypto.unwrapKey(wrapped, wrapPriv);
        } catch {
          throw new Error("HmpReader: content key unwrap failed (wrong wrap key or corrupt key block)");
        }
      })();
    }
    return contentKeyPromise;
  };

  return {
    songCount: count,
    songs(): SongRef[] {
      return entries.slice();
    },
    async verify(): Promise<boolean> {
      const signPub = await crypto.importSignPublic(keys.signPublicJwk);
      const sig = footer.subarray(8, 8 + SIG_SIZE);
      return crypto.verifyIndex(indexBytes, sig, signPub);
    },
    async midiFor(ref: SongRef): Promise<Uint8Array> {
      const e = entries.find((x) => x === ref || (x.offset === ref.offset && x.number === ref.number));
      if (!e) throw new Error("HmpReader: song ref not from this library");
      if (e.offset < keyBlockEnd || e.offset + e.length > indexOffset) {
        throw new Error(`HmpReader: song ${e.number} block [${e.offset}, ${e.offset + e.length}) outside song-block region`);
      }
      const block = await source.read(e.offset, e.length);
      if (block.length !== e.length) throw new Error(`HmpReader: song ${e.number} block truncated`);
      const nonce = block.subarray(0, NONCE_SIZE);
      const ct = block.subarray(NONCE_SIZE);
      const key = await contentKey();
      let deflated: Uint8Array;
      try {
        deflated = await crypto.decrypt(aadBytes(e.number, e.offset, e.length), nonce, ct, key);
      } catch {
        throw new Error(`HmpReader: song ${e.number} decrypt failed (bit-flip, AAD mismatch, or corrupt block)`);
      }
      try {
        return await inflate.rawInflate(deflated);
      } catch {
        throw new Error(`HmpReader: song ${e.number} inflate failed (corrupt payload)`);
      }
    },
  };
}
