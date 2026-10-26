# HumMyna Player

The cross-platform **karaoke player** for `.hmp` libraries, built with React
Native + Expo. Open source — this repo holds the app and the shared `.hmp`
**reader** (`packages/hmp`).

## What's here

- `packages/hmp` — the `.hmp` container reader (the open half of the format).
- `docs/FORMAT.md` — the normative `.hmp` format specification.
- `docs/superpowers/specs/` — design specs.

The **writer/packer** (HumMyna Studio) lives in a separate, private repo.

## Status

Phase 2 design approved; implementation not yet started. See
`docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md`.

## The format

A `.hmp` file is a single karaoke library container:
`HEADER ‖ KEY BLOCK ‖ SONG BLOCKS ‖ INDEX ‖ FOOTER`. See `docs/FORMAT.md`.
