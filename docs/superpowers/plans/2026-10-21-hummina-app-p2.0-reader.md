# HumMyna App — P2.0 Shared `.hmp` Reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Phase-1 `.hmp` reader into a framework-agnostic, random-access TypeScript package (`packages/hmp`) with injectable crypto/inflate adapters, tested in Node against the existing golden `.hmp` fixtures.

**Architecture:** A `packages/hmp` workspace package. The reader does **random-access** reads over a `ByteSource` (footer → index → verify → unwrap key → lazy per-song decrypt). Crypto and deflate sit behind `CryptoAdapter`/`InflateAdapter` seams; the default implementations use WebCrypto + `CompressionStream` (Node/browser/tests), and React Native will supply `react-native-quick-crypto` + `fflate` later.

**Tech Stack:** TypeScript 5 · vitest 3 (Node env) · npm workspaces. No runtime deps (WebCrypto + `CompressionStream` are Node globals).

**Spec:** `docs/superpowers/specs/2026-10-21-hummina-app-phase2-design.md` (§5)
**Format:** `docs/FORMAT.md` (normative)

## Global Constraints

- **No runtime dependencies** in `packages/hmp`. WebCrypto + `CompressionStream('deflate-raw')` are used only by the *default* adapters; the reader core touches neither directly.
- **Random access only** — the reader must never require the whole file in memory; it reads byte ranges via `ByteSource`.
- **Exact format values** (from `docs/FORMAT.md`): magic `HMP1`/`HMPE`; HEADER 16 bytes; KEY BLOCK = `u32LE wrappedLen ‖ wrapped`; song block = `nonce12 ‖ ct ‖ tag16`; **AAD = `number u32LE ‖ offset u64LE ‖ length u32LE`**; INDEX = `u32LE count ‖ [number u32, titleLen u8+utf8, singerLen u8+utf8, offset u64, length u32, nonce12]*`; FOOTER 76 = `indexOffset u64LE ‖ sigP1363(64) ‖ "HMPE"`; AES-256-GCM; RSA-OAEP-SHA256 wrap; ECDSA-P256 P1363.
- **Source repo for the port:** `C:\Users\Janre\Documents\HumMyna` (private Studio). Copy the framework-agnostic modules verbatim, then refactor behind the seams.
- **Do NOT copy the writer** (`writer.ts`) or any signing code; this package is reader-only. Tests use the committed golden `.hmp` fixture instead of a writer.
- Every task: `npm run lint` (tsc) + `npm test` (vitest) green in the app repo; explicit `git add <paths>`; commit per task.

---

### Task 1: Scaffold the `packages/hmp` workspace

**Files:**
- Create: `package.json` (root, workspaces), `tsconfig.base.json`, `.gitignore` (append)
- Create: `packages/hmp/package.json`, `packages/hmp/tsconfig.json`, `packages/hmp/vitest.config.ts`, `packages/hmp/src/index.ts`
- Create: `packages/hmp/tests/smoke.test.ts`

**Interfaces:**
- Produces: workspace root + `@hummina/hmp` package with `test`/`lint` scripts.

- [ ] **Step 1: Root workspace `package.json`**

```json
{
  "name": "hummina-app",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

- [ ] **Step 2: `packages/hmp/package.json`**

```json
{
  "name": "@hummina/hmp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 3: `tsconfig.base.json` + `packages/hmp/tsconfig.json`**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```
`packages/hmp/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node", "vitest/globals"] },
  "include": ["src", "tests"]
}
```
(Add `@types/node` to `packages/hmp` devDependencies.)

- [ ] **Step 4: `packages/hmp/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["tests/**/*.test.ts"] } });
```

- [ ] **Step 5: `packages/hmp/src/index.ts`** (placeholder export to be filled in later tasks)

```ts
export const HMP_PACKAGE = "@hummina/hmp";
```

- [ ] **Step 6: Failing-then-passing smoke test**

```ts
// packages/hmp/tests/smoke.test.ts
import { describe, expect, it } from "vitest";
import { HMP_PACKAGE } from "../src/index";

describe("hmp package", () => {
  it("is set up", () => {
    expect(HMP_PACKAGE).toBe("@hummina/hmp");
  });
});
```

- [ ] **Step 7: Install + verify**

Run: `npm install` (root) then `npm test` and `npm run lint`.
Expected: smoke test passes; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.base.json .gitignore packages/hmp
git commit -m "chore(hmp): scaffold reader workspace package"
```

---

### Task 2: Constants + types (verbatim port)

**Files:**
- Create: `packages/hmp/src/constants.ts`, `packages/hmp/src/types.ts`
- Test: `packages/hmp/tests/constants.test.ts`

**Interfaces:**
- Produces: `MAGIC_HEADER`, `MAGIC_FOOTER`, `FORMAT_VERSION`, `MAX_SONGS`, `HEADER_SIZE`, `FOOTER_SIZE`, `SECTOR_HINT`, plus `HmpSong`, `HmpLibrary`, `LibraryKeys` types.

- [ ] **Step 1: Failing test**

```ts
// packages/hmp/tests/constants.test.ts
import { describe, expect, it } from "vitest";
import { HEADER_SIZE, FOOTER_SIZE, MAGIC_HEADER, MAGIC_FOOTER, MAX_SONGS } from "../src/constants";

describe("constants", () => {
  it("pins the format's exact values", () => {
    expect(Array.from(MAGIC_HEADER)).toEqual([0x48, 0x4d, 0x50, 0x31]); // "HMP1"
    expect(Array.from(MAGIC_FOOTER)).toEqual([0x48, 0x4d, 0x50, 0x45]); // "HMPE"
    expect(HEADER_SIZE).toBe(16);
    expect(FOOTER_SIZE).toBe(76);
    expect(MAX_SONGS).toBe(100_000);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/constants.test.ts`)

- [ ] **Step 3: Implement** — copy `constants.ts` values **verbatim** from `C:\Users\Janre\Documents\HumMyna\src\format\constants.ts` (do not change any number). Add `types.ts` with the reader-facing types:

```ts
// packages/hmp/src/types.ts
export interface SongRef {
  number: number;
  title: string;
  singer: string;
  offset: number;
  length: number;
}
export interface LibraryKeys {
  wrapPrivateJwk: JsonWebKey;
  signPublicJwk: JsonWebKey;
}
export interface HmpLibrary {
  songCount: number;
  songs(): SongRef[];
  verify(): Promise<boolean>;
  midiFor(ref: SongRef): Promise<Uint8Array>;
}
```

- [ ] **Step 4: Run → PASS**, then `npm run lint`

- [ ] **Step 5: Commit**
```bash
git add packages/hmp/src/constants.ts packages/hmp/src/types.ts packages/hmp/tests/constants.test.ts
git commit -m "feat(hmp): format constants and reader types"
```

---

### Task 3: Inflate adapter (seam + web default)

**Files:**
- Create: `packages/hmp/src/adapters/inflate.ts`
- Test: `packages/hmp/tests/inflate.test.ts`

**Interfaces:**
- Produces: `interface InflateAdapter { rawInflate(data: Uint8Array): Promise<Uint8Array> }`, `webInflateAdapter: InflateAdapter`.

- [ ] **Step 1: Failing test** (roundtrip through the *web* default; RN will swap the impl)

```ts
// packages/hmp/tests/inflate.test.ts
import { describe, expect, it } from "vitest";
import { webInflateAdapter } from "../src/adapters/inflate";

async function rawDeflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

describe("webInflateAdapter", () => {
  it("inflates deflate-raw bytes", async () => {
    const src = new TextEncoder().encode("karaoke ".repeat(50));
    const deflated = await rawDeflate(src);
    const out = await webInflateAdapter.rawInflate(deflated);
    expect(new TextDecoder().decode(out)).toBe("karaoke ".repeat(50));
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement** `src/adapters/inflate.ts` — the web default must **accumulate all chunks** (a single `read()` truncates multi-chunk output):

```ts
export interface InflateAdapter {
  rawInflate(data: Uint8Array): Promise<Uint8Array>;
}

export const webInflateAdapter: InflateAdapter = {
  async rawInflate(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    void writer.write(data);
    void writer.close();
    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) throw new Error("empty inflate output");
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  },
};
```

- [ ] **Step 4: Run → PASS**, lint.

- [ ] **Step 5: Commit**
```bash
git add packages/hmp/src/adapters/inflate.ts packages/hmp/tests/inflate.test.ts
git commit -m "feat(hmp): inflate adapter seam with web default"
```

---

### Task 4: Crypto adapter (seam + web default)

**Files:**
- Create: `packages/hmp/src/adapters/crypto.ts`
- Test: `packages/hmp/tests/crypto.test.ts`

**Interfaces:**
- Produces: `interface CryptoAdapter { unwrapKey(wrapped, wrapPrivate): Promise<Uint8Array>; decrypt(aad, nonce, ct, key): Promise<Uint8Array>; verifyIndex(index, sig, signPublic): Promise<boolean> }`, `webCryptoAdapter: CryptoAdapter`.

- [ ] **Step 1: Failing test** — generate ephemeral keys, wrap→unwrap a 32-byte key, encrypt→decrypt a payload, sign→verify an index buffer (mirror Phase-1 `crypto.test.ts` patterns):

```ts
// packages/hmp/tests/crypto.test.ts
import { describe, expect, it } from "vitest";
import { webCryptoAdapter } from "../src/adapters/crypto";

async function rsaPair() {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["wrapKey", "unwrapKey"],
  );
}
async function ecPair() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

describe("webCryptoAdapter", () => {
  it("wraps and unwraps a 32-byte key", async () => {
    const pair = await rsaPair();
    const key = new Uint8Array(32).fill(7);
    const aes = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, true, ["wrapKey"]);
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", aes, pair.publicKey, { name: "RSA-OAEP" }));
    const back = await webCryptoAdapter.unwrapKey(wrapped, pair.privateKey);
    expect(Array.from(back)).toEqual(Array.from(key));
  });

  it("decrypts AES-GCM with AAD and verifies a P1363 signature", async () => {
    const pair = await ecPair();
    const index = new TextEncoder().encode("index-bytes");
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, index));
    expect(sig.length).toBe(64);
    expect(await webCryptoAdapter.verifyIndex(index, sig, pair.publicKey)).toBe(true);
    const tampered = index.slice(); tampered[0] ^= 1;
    expect(await webCryptoAdapter.verifyIndex(tampered, sig, pair.publicKey)).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement** `src/adapters/crypto.ts` (port the WebCrypto calls from `HumMyna\src\format\crypto.ts`, but operate on imported `CryptoKey`s):

```ts
export interface CryptoAdapter {
  unwrapKey(wrapped: Uint8Array, wrapPrivate: CryptoKey): Promise<Uint8Array>;
  decrypt(aad: Uint8Array, nonce: Uint8Array, ct: Uint8Array, key: CryptoKey): Promise<Uint8Array>;
  verifyIndex(index: Uint8Array, sig: Uint8Array, signPublic: CryptoKey): Promise<boolean>;
}

export const webCryptoAdapter: CryptoAdapter = {
  async unwrapKey(wrapped, wrapPrivate) {
    const key = await crypto.subtle.unwrapKey(
      "raw", wrapped, wrapPrivate, { name: "RSA-OAEP" },
      { name: "AES-GCM", length: 256 }, true, ["decrypt"],
    );
    return new Uint8Array(await crypto.subtle.exportKey("raw", key));
  },
  async decrypt(aad, nonce, ct, key) {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, key, ct),
    );
  },
  async verifyIndex(index, sig, signPublic) {
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, signPublic, sig, index);
  },
};
```

- [ ] **Step 4: Run → PASS**, lint.

- [ ] **Step 5: Commit**
```bash
git add packages/hmp/src/adapters/crypto.ts packages/hmp/tests/crypto.test.ts
git commit -m "feat(hmp): crypto adapter seam with web default"
```

---

### Task 5: `ByteSource` (random access)

**Files:**
- Create: `packages/hmp/src/byte-source.ts`
- Test: `packages/hmp/tests/byte-source.test.ts`

**Interfaces:**
- Produces: `interface ByteSource { readonly size: number; read(offset: number, length: number): Promise<Uint8Array> }`, `memoryByteSource(bytes: Uint8Array): ByteSource`.

- [ ] **Step 1: Failing test**

```ts
// packages/hmp/tests/byte-source.test.ts
import { describe, expect, it } from "vitest";
import { memoryByteSource } from "../src/byte-source";

describe("memoryByteSource", () => {
  it("returns exact ranges and clamps at EOF", async () => {
    const src = memoryByteSource(new Uint8Array([0, 1, 2, 3, 4, 5]));
    expect(src.size).toBe(6);
    expect(Array.from(await src.read(2, 3))).toEqual([2, 3, 4]);
    expect(Array.from(await src.read(4, 10))).toEqual([4, 5]); // clamped
    expect((await src.read(6, 1)).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

```ts
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function memoryByteSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(offset, length) {
      if (offset >= bytes.length) return new Uint8Array(0);
      return bytes.subarray(offset, Math.min(offset + length, bytes.length));
    },
  };
}
```

- [ ] **Step 4: Run → PASS**, lint.

- [ ] **Step 5: Commit**
```bash
git add packages/hmp/src/byte-source.ts packages/hmp/tests/byte-source.test.ts
git commit -m "feat(hmp): random-access ByteSource abstraction"
```

---

### Task 6: Port the reader over `ByteSource` + adapters

**Files:**
- Create: `packages/hmp/src/reader.ts`
- Test: `packages/hmp/tests/reader.test.ts`
- Create fixtures: copy `HumMyna\tests\golden\library.hmp`, `expected.json`, `keys.jwk` → `packages/hmp/tests/fixtures/`

**Interfaces:**
- Consumes: `constants`, `types`, `InflateAdapter`, `CryptoAdapter`, `ByteSource`.
- Produces: `openHmp(source: ByteSource, keys: LibraryKeys, deps?: { inflate?: InflateAdapter; crypto?: CryptoAdapter }): Promise<HmpLibrary>`.

- [ ] **Step 1: Copy fixtures** (reader-only tests need no writer):
```bash
mkdir -p packages/hmp/tests/fixtures
cp "C:/Users/Janre/Documents/HumMyna/tests/golden/library.hmp" packages/hmp/tests/fixtures/
cp "C:/Users/Janre/Documents/HumMyna/tests/golden/expected.json" packages/hmp/tests/fixtures/
cp "C:/Users/Janre/Documents/HumMyna/tests/golden/keys.jwk" packages/hmp/tests/fixtures/
```

- [ ] **Step 2: Failing test** — open the golden fixture, verify signature, decrypt+inflate a song, compare SHA-256 to `expected.json`:

```ts
// packages/hmp/tests/reader.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { webCryptoAdapter } from "../src/adapters/crypto";
import { webInflateAdapter } from "../src/adapters/inflate";
import { memoryByteSource } from "../src/byte-source";
import { openHmp } from "../src/reader";

const load = (p: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${p}`, import.meta.url)));
const keysFile = JSON.parse(new TextDecoder().decode(load("keys.jwk"))) as { wrapPrivateJwk: JsonWebKey; signPublicJwk: JsonWebKey };
const expected = JSON.parse(new TextDecoder().decode(load("expected.json"))) as { count: number; plaintextSha256: string[] };

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("openHmp", () => {
  it("reads the index, verifies the signature, and decrypts songs", async () => {
    const lib = await openHmp(memoryByteSource(load("library.hmp")), keysFile, { inflate: webInflateAdapter, crypto: webCryptoAdapter });
    expect(lib.songCount).toBe(expected.count);
    expect(await lib.verify()).toBe(true);
    const refs = lib.songs();
    for (let i = 0; i < refs.length; i++) {
      expect(await sha256(await lib.midiFor(refs[i]))).toBe(expected.plaintextSha256[i]);
    }
  });
});
```

- [ ] **Step 3: Run → FAIL**

- [ ] **Step 4: Implement `reader.ts`** — port the Phase-1 `HmpReader` (`HumMyna\src\format\reader.ts`) but restructure it to:
  1. `read(size - FOOTER_SIZE, FOOTER_SIZE)` → `indexOffset`, `sig`, footer magic.
  2. `read(0, HEADER_SIZE)` → validate `MAGIC_HEADER` + version.
  3. Read the key block (`u32LE len` at offset 16 → `read(20, len)`), `unwrapKey` with `importKey` of `wrapPrivateJwk` → AES `CryptoKey`.
  4. `read(indexOffset, footerAt - indexOffset)` → build `SongRef[]`; `verify()` runs `verifyIndex` over exactly those index bytes with the imported `signPublicJwk`.
  5. `midiFor(ref)`: `read(ref.offset, ref.length)` → split `nonce12‖ct` → build AAD (`number u32LE ‖ offset u64LE ‖ length u32LE`) → `decrypt` → `inflate.rawInflate`.
  Import `wrapPrivateJwk`/`signPublicJwk` via `crypto.subtle.importKey` (RSA-OAEP-SHA256 / ECDSA-P256). Reuse Phase-1's `numberToBytes`/`bigToBytes` helpers (copy them into `reader.ts` or a small `bytes.ts`).

- [ ] **Step 5: Run → PASS**, lint.

- [ ] **Step 6: Commit**
```bash
git add packages/hmp/src/reader.ts packages/hmp/src/bytes.ts packages/hmp/tests/reader.test.ts packages/hmp/tests/fixtures
git commit -m "feat(hmp): random-access reader over adapters"
```

---

### Task 7: Tamper rejection

**Files:**
- Test: `packages/hmp/tests/tamper.test.ts`

**Interfaces:** consumes `openHmp`.

- [ ] **Step 1: Failing tests** (port the spirit of `HumMyna\tests\format\tamper.test.ts`; construct tampered copies of the golden buffer):
  - flip a bit inside a song block → `midiFor` rejects (GCM fail);
  - edit an index byte (title) → `verify()` returns `false`;
  - foreign 64-byte signature overwritten → `verify()` false;
  - wrong AAD (swap a song's offset in the index and re-verify) → decrypt fails for that song.

```ts
// packages/hmp/tests/tamper.test.ts  (excerpt)
// ... load library.hmp + keys as in reader.test.ts ...
it("rejects a tampered song block", async () => {
  const bytes = load("library.hmp");
  const lib = await openHmp(memoryByteSource(bytes), keysFile);
  const ref = lib.songs()[0];
  bytes[ref.offset + 12] ^= 0x01; // first ciphertext byte after the nonce
  const lib2 = await openHmp(memoryByteSource(bytes), keysFile);
  await expect(lib2.midiFor(lib2.songs()[0])).rejects.toThrow();
});
```

- [ ] **Step 2: Run → FAIL** (until the reader surfaces distinct errors per case)

- [ ] **Step 3: Ensure `reader.ts` throws/returns the right signals:** decryption/inflate errors reject `midiFor`; signature mismatch returns `false` from `verify()`; structural problems (bad magic/footer/short reads) throw a clear `Error`.

- [ ] **Step 4: Run → PASS**, lint.

- [ ] **Step 5: Commit**
```bash
git add packages/hmp/tests/tamper.test.ts
git commit -m "test(hmp): tamper rejection (bitflip, index edit, foreign sig, AAD)"
```

---

### Task 8: MIDI lyric/tempo parsing (port)

**Files:**
- Create: `packages/hmp/src/midi.ts`
- Test: `packages/hmp/tests/midi.test.ts`

**Interfaces:**
- Produces: `parseLyrics(midi: Uint8Array): { timeMs: number; text: string }[]`, `hasLyrics(midi: Uint8Array): boolean`, `hasMidiMagic(midi: Uint8Array): boolean`.

- [ ] **Step 1: Failing tests** — port `HumMyna\tests\scan\midi.test.ts` + `tests\fixtures\midi.ts` (the VLQ-correct fixtures) into `packages/hmp/tests`, and add a tempo/timeline assertion:

```ts
// packages/hmp/tests/midi.test.ts  (excerpt)
it("emits timed lyric lines using the tempo map", () => {
  // fixture: 120 BPM (division 96), one FF05 lyric at delta 0
  const lines = parseLyrics(lyricFixture());
  expect(lines[0].timeMs).toBeCloseTo(0, 5);
  expect(lines[0].text).toContain("La");
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement** — copy `HumMyna\src\scan\midi.ts` (structural probe + lyric detection + running status), then **extend** with `parseLyrics`: parse the MIDI header `division`, walk meta events building a **tick→ms tempo map** (default 120 BPM until the first `FF 51 03` setTempo), and emit `{ timeMs, text }` for each `FF 05` (fallback `FF 01`) event.

- [ ] **Step 4: Run → PASS**, lint.

- [ ] **Step 5: Commit**
```bash
git add packages/hmp/src/midi.ts packages/hmp/tests/midi.test.ts packages/hmp/tests/fixtures
git commit -m "feat(hmp): MIDI lyric parsing with tempo map"
```

---

## Self-Review

**Spec coverage:** §5 (reader: `ByteSource`, adapters, lazy decrypt, lyrics) → Tasks 1-8 ✓. Golden-vector reuse ✓ (Task 6). Node testing ✓. RN adapters are explicitly *later* (the seams exist) — noted in §5.
**Placeholder scan:** no TBD; code steps show real code; the two "copy verbatim from `<path>`" steps name exact source files and exact values (constants; MIDI probe) — concrete, not vague.
**Type consistency:** `ByteSource`, `LibraryKeys`, `SongRef`, `HmpLibrary`, `CryptoAdapter`, `InflateAdapter` defined once (Tasks 2-5) and consumed with the same names in Tasks 6-8.
**Deliberate exclusions:** no writer/signing code copied (reader-only); RN-specific adapters (`react-native-quick-crypto`/`fflate`) are a later plan, gated behind the seams.
