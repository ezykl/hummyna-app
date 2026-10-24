# HumMyna Package Format (`.hmp`) — Normative Specification

**Format version:** 1 · **Status:** normative — supersedes prose summaries (including design spec §3) on conflict.

All multi-byte integers are **little-endian**. Sizes are in bytes. "u32" = unsigned 32-bit LE, "u64" = unsigned 64-bit LE.

## 1. Overall layout

```
HEADER(16) ‖ KEY BLOCK ‖ SONG BLOCKS ‖ INDEX ‖ FOOTER(76)
```

| Section | Position | Size |
|---|---|---|
| HEADER | 0 | 16 |
| KEY BLOCK | 16 | 4 + wrappedLen (256 for RSA-2048) |
| SONG BLOCKS | after key block | variable, contiguous, pack order |
| INDEX | last song block end (`indexOffset`) | 4 + entries |
| FOOTER | file end − 76 | 76 |

Song count is **not** in the header — it is the first u32 of the INDEX. `indexOffset` in the footer points at that count.

## 2. HEADER (16 bytes)

| Offset | Size | Field | Value / rules |
|---|---|---|---|
| 0 | 4 | magic | `"HMP1"` = `48 4D 50 31` |
| 4 | 1 | version | `1` (format version 1) |
| 5 | 1 | flags | first flags byte; **must be 0 in v1** |
| 6 | 1 | key-id | key-rotation id stamped by the packer (0–255); readers MUST NOT enforce its value |
| 7 | 9 | reserved | zeros; readers MUST reject non-zero |

Notes for implementers:

- A u32-LE read at offset 4 yields `version | (flags << 8) | (keyId << 16)` — e.g. `0x00030001` for version 1 with key-id 3. v1 readers MUST validate the individual bytes (4 == 1, 5 == 0, 7–15 == 0) and MUST NOT compare a raw u32 read at offset 4 against `1`.
- The packer never writes a non-zero flags byte; byte 5 is reserved as the first flags byte for future versions.

## 3. KEY BLOCK

| Offset | Size | Field | Value / rules |
|---|---|---|---|
| 0 | 4 | wrappedLen | u32 = length of the wrapped key (256 for RSA-2048) |
| 4 | wrappedLen | wrapped key | RSA-OAEP-SHA256 ciphertext of the raw 32-byte AES-256 content key, using the player's wrap-PUBLIC key |

Absolute position: 16. The first song block starts at `16 + 4 + wrappedLen`.

## 4. SONG BLOCKS

Contiguous, in pack (add) order. Per block:

| Field | Size | Notes |
|---|---|---|
| nonce | 12 | random per block (AES-GCM IV) |
| ciphertext ‖ tag | deflatedLen + 16 | AES-256-GCM over the plaintext below |

- **Plaintext:** `raw-deflate(MIDI bytes)` — raw DEFLATE (no zlib/gzip wrapper).
- **Key:** the 32-byte content key from the KEY BLOCK.

### AAD (additional authenticated data) — 16 bytes

| Field | Size |
|---|---|
| number | u32 |
| offset | u64 |
| length | u32 |

Where:

- `offset` = absolute file offset of the block start (the nonce's first byte),
- `length` = `12 + deflatedLen + 16` (the whole block: nonce + ciphertext + tag).

Both values are also recorded in the INDEX entry. The AAD binds each block to its song number **and** its file position: editing an index offset/number/length, or reordering blocks, makes GCM authentication fail.

## 5. INDEX

Starts at `indexOffset` (as recorded in the footer), immediately followed by the FOOTER.

```
count u32 | entry₀ | entry₁ | … | entryₙ₋₁     (n = count; no padding between entries)
```

Per entry, in this exact order:

| Field | Size | Notes |
|---|---|---|
| number | u32 | song number |
| titleLen | u32 | UTF-8 **byte** length of title |
| title | titleLen | UTF-8 |
| singerLen | u32 | UTF-8 **byte** length of singer |
| singer | singerLen | UTF-8 |
| offset | u64 | absolute file offset of the song block |
| length | u32 | block length (`12 + deflatedLen + 16`) |
| nonce | 12 | copy of the block's nonce |

- Entries appear in pack order; `count` must match the number of parsed entries and the index must end exactly at the footer start.
- Strings are UTF-8; lengths are byte lengths (a byte-level edit of equal length still invalidates the signature).

## 6. FOOTER (76 bytes)

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 8 | indexOffset | u64 — file offset of the INDEX count |
| 8 | 64 | signature | ECDSA P-256 / SHA-256, **raw P1363** (`r ‖ s`, 32 + 32 bytes — not DER) |
| 72 | 4 | magic | `"HMPE"` = `48 4D 50 45` |

**Signature coverage:** the exact INDEX bytes `[indexOffset, fileEnd − 76)` — count and every entry byte — signed with the packer's sign-PRIVATE key, verified against the player's sign-PUBLIC key. The signature does not cover song blocks (their integrity comes from GCM + AAD) or the header/footer themselves.

## 7. Validation rules (readers MUST reject)

| Condition | Where it surfaces |
|---|---|
| file < 92 bytes (header + footer minimum) | constructor throws (`truncated`) |
| bad header magic | constructor throws (`bad magic`) |
| version byte ≠ 1 | constructor throws (`version`) |
| flags byte ≠ 0 | constructor throws (`flags`) |
| reserved bytes 7–15 ≠ 0 | constructor throws (`reserved`) |
| footer magic ≠ `"HMPE"` (truncated/corrupt tail) | constructor throws (`footer magic`) |
| wrappedLen / indexOffset out of range, count > 100 000, index parse overrun or length mismatch | constructor throws (structural) |
| index signature invalid or signed by a foreign key | `verify()` returns `false` |
| `song(i)` outside `0..count−1` | throws (`range`) |
| block outside the song-block region | throws (structural) |
| GCM authentication fail — bit-flip, wrong nonce, or AAD mismatch | `song()` throws (`decrypt failed`) |
| inflate failure after decrypt | `song()` throws (`inflate failed`) |
| content-key unwrap failure (wrong wrap key / corrupt key block) | `song()` throws (`unwrap failed`) |

## 8. Limits and versioning

| Constant | Value |
|---|---|
| MAX_SONGS | 100 000 (count > this ⇒ reject) |
| per-song `length` | u32 — 4 GiB cap |
| block `offset` | u64 — multi-GB libraries |
| format version | `1` in header byte 4; readers reject other versions |
| flags | must be 0 in v1 (byte 5) |

**Tamper-detection matrix:** block bit-flip ⇒ GCM fail · block reorder / index offset-number-length lies ⇒ AAD fail · index byte edit ⇒ signature fail · foreign signing key or foreign signature ⇒ signature fail · truncation ⇒ structural reject.
