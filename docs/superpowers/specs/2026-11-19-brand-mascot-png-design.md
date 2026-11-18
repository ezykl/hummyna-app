# HumMyna Player — Brand Identity, Mascot & PNG Assets — Design

Status: approved (design), pending written-spec review  
Date: 2026-11-19  
Repo: `HumMynaApp`  
Related specs: `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md`, `docs/superpowers/specs/2026-11-05-hummyna-app-p2.5-release-design.md`

---

## 1. Goal

Establish HumMyna's official visual brand identity and mascot system, produce all required store and in-app PNG graphics, and integrate them across the app UI (empty states, header branding, recording view, and score celebration screens) as well as the Expo app configuration.

---

## 2. Character & Visual Brand Identity

### 2.1 The Mascot: "Myna"
The mascot is a cute, stylized Common Myna bird (*Acridotheres tristis*) celebrating the core karaoke experience:
- **Design Style**: Cute Kawaii Vector (clean 2D lines, smooth vector curves, chubby friendly anatomy, big expressive eyes).
- **Core Motifs**: Royal blue studio DJ/karaoke headphones, joyful singing expression, floating musical notes and soundwaves.

### 2.2 Brand Palette
- **Brand Primary Blue**: `#2b6cb0` (matches current app theme)
- **Feathers / Body**: `#1e293b` (slate midnight navy) with `#334155` soft highlights
- **Eye Crest & Beak**: `#f59e0b` / `#fbbf24` (vibrant golden amber)
- **Belly Accent**: Soft cream / pale slate `#f1f5f9`
- **Musical Accents**: `#38bdf8` (electric sky blue) & `#f43f5e` (warm coral)

---

## 3. Asset Manifest (`assets/images/`)

All assets will be stored in `assets/images/`. In-app images are exported as 32-bit transparent PNGs:

| Asset File | Target Size | Format | Placement / Purpose |
| :--- | :--- | :--- | :--- |
| `icon.png` | 1024×1024 | PNG | App Store, Google Play, home screen launcher icon |
| `adaptive-icon.png` | 1024×1024 | Transparent PNG | Android 8.0+ adaptive icon foreground |
| `splash-icon.png` | 512×512 | Transparent PNG | Centered icon for Expo splash screen |
| `favicon.png` | 192×192 | PNG | Browser tab icon for static web export |
| `mascot-header.png` | 64×64 (display 28×28) | Transparent PNG | Navigation header logo icon next to title |
| `mascot-empty.png` | 320×320 | Transparent PNG | Empty libraries list state (`LibrariesView`) |
| `mascot-search.png` | 240×240 | Transparent PNG | No songs matching search (`LibraryDetailView`) |
| `mascot-singing.png` | 300×300 | Transparent PNG | Singing companion illustration on `RecordView` |
| `mascot-celebrate.png`| 320×320 | Transparent PNG | High score (S / A) & Fun Mode celebration on `ResultsView` |
| `mascot-cheer.png` | 320×320 | Transparent PNG | Encouraging pose for lower scores (B / C / D) on `ResultsView` |

---

## 4. App & UI Integration

### 4.1 `app.json` Configuration
Update `app.json` to configure the system icons and splash screen:
```jsonc
{
  "expo": {
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#2b6cb0"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#2b6cb0"
      }
    },
    "web": {
      "favicon": "./assets/images/favicon.png"
    }
  }
}
```

### 4.2 Navigation Header (`src/app/_layout.tsx`)
Update `headerTitle` in `RootLayout` to render a brand header component containing:
- `mascot-header.png` (28×28)
- "HumMyna" wordmark text (`fontWeight: "700"`, `fontSize: 18`)

### 4.3 Library & Search Empty States (`src/ui/library-view.tsx`)
- **`LibrariesView` empty state**:
  - Replace raw text with a centered empty card featuring `mascot-empty.png` (120×120 display), "No libraries yet", and subtext instructing the user to import `.hmp` files.
- **`LibraryDetailView` search empty state**:
  - Replace raw text with `mascot-search.png` (100×100 display) and "No matching songs" text.

### 4.4 Recording View (`src/ui/record-view.tsx`)
- Display `mascot-singing.png` (140×140 display) centered above the volume level meter to provide a lively, friendly visual anchor while the microphone is armed and recording.

### 4.5 Results & Score Screen (`src/ui/results-view.tsx`)
- Replace or augment the plain grade letter with:
  - `mascot-celebrate.png` for grades `S` or `A`, or when `funMode` is active.
  - `mascot-cheer.png` for grades `B`, `C`, or `D` with encouraging copy ("Great effort! Sing again to beat your score").

---

## 5. Verification & Testing

1. **Asset Validation**: Verify all 10 PNG files exist in `assets/images/`, match required dimensions, have valid PNG headers, and use transparency where specified.
2. **Configuration Validation**: Verify `app.json` passes Expo validation (`npx expo config`).
3. **Jest Unit & Component Tests**:
   - Ensure all existing Jest tests continue to pass (`npm test`).
   - Add/update UI tests covering the empty state rendering and image rendering branches in `LibrariesView`, `LibraryDetailView`, `RecordView`, and `ResultsView`.
