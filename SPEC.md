# FitCheck — Offline Virtual Wardrobe PWA (Build Spec for Claude Code)

> Paste this file into the root of a new repo as `SPEC.md` and tell Claude Code:
> "Read SPEC.md and build the app phase by phase. After each phase, stop, summarize what's done and how to test it on an iPhone."

---

## 0. Role & working rules for Claude Code

You are a senior frontend engineer building a production-quality, offline-first PWA for iPhone (Safari / installed to Home Screen).

- Work **phase by phase** (section 12). Do not start the next phase until the current one builds, passes its acceptance criteria and is committed.
- Before choosing any library or ML model, **verify the current version, license, size and iOS Safari compatibility** (docs / npm / Hugging Face). Prefer well-maintained, permissive-license options. If something in this spec is outdated, propose the better current alternative and explain why.
- Keep the code typed (strict TypeScript), modular, and small files. No backend. No analytics. No external requests at runtime except the one-time download of ML models (which must then be cached for offline use).
- All UI text is in **English**.
- Mobile-first, designed for iPhone screen sizes (375–430 px wide), safe-area aware (notch, home indicator).
- When in doubt about a UX detail, choose the simplest option that works well one-handed on a phone, and note the decision in `DECISIONS.md`.

---

## 1. Product summary

A personal virtual try-on wardrobe. Each user is their own model: they take a **base photo set of themselves** (front, back, side) wearing tight thermal clothing. Every clothing item is photographed **while worn**, from the same three angles, and the app cuts out just the garment as a transparent layer. Outfits are built by stacking garment layers on top of the user's base model, and can be rotated between **front / side / back** views.

- One user per phone, one wardrobe per install. No accounts, no profiles, no sync.
- Fully offline after first load (and first model download).
- Distributed as a static site on **GitHub Pages**; each person (user, girlfriend, sister — all on iPhone) opens the link, installs to Home Screen, and creates their own base model and wardrobe on their own device.

Goal: open the app, see your outfits on your own body, pick one, and stop improvising when getting dressed.

---

## 2. Tech stack (verify versions before installing)

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript (strict) |
| Styling | Tailwind CSS |
| State | Zustand (UI state) + Dexie live queries (data) |
| Storage | IndexedDB via **Dexie**; images stored as **Blobs** (never base64) |
| PWA | `vite-plugin-pwa` (Workbox), precache app shell, runtime-cache ML model files |
| Routing | React Router (hash router or base-path aware for GitHub Pages) |
| Segmentation ML | `@huggingface/transformers` (Transformers.js) running on **WebGPU with WASM fallback** |
| Clothing parsing model | A SegFormer clothes-parsing model (e.g. `segformer_b2_clothes` ONNX, quantized) — verify availability/size |
| Tap-to-select fallback | A lightweight SAM variant usable in Transformers.js (e.g. SlimSAM / similar) — verify |
| Pose / alignment | MediaPipe Tasks Vision **Pose Landmarker** (lite), on-device |
| Image encoding | Canvas → **WebP** (alpha), with PNG fallback if WebP encoding unsupported |
| Backup | `fflate` (zip) for export/import |
| Dates | `date-fns` |
| Deploy | GitHub Actions → GitHub Pages (HTTPS required for camera) |

Configure Vite `base` for the GitHub Pages repo path. Include a `.github/workflows/deploy.yml`.

---

## 3. Core concepts

- **Base model**: 3 photos of the user (front, back, side) in tight thermals, background removed. Stored once, can be retaken. Pose landmarks are computed and stored for each view.
- **Item**: a clothing piece (incl. shoes, socks, accessories) with 3 garment layers (front, back, side): transparent cut-outs plus position/scale relative to the base model.
- **Outfit**: a list of item references + per-item adjustments (offset, scale, layer order) per view. **Outfits store no images**; they are composed at render time.
- **Wear log**: a calendar entry saying "I wore outfit X on date D". Drives the usage counters and unused-item alerts.

---

## 4. Categories & styles

### Categories (fixed, English)
Each has a default **layer order** (lower = drawn first, i.e. closer to the body):

| Category | Default layer |
|---|---|
| Socks | 10 |
| Pants | 20 |
| Shorts | 20 |
| T-Shirts | 30 |
| Shirts | 35 |
| Sweaters & Hoodies | 40 |
| Jackets & Coats | 50 |
| Shoes | 60 |
| Accessories | 70 |

**Accessories** have a required subtype: `Cap / Hat`, `Necklace`, `Scarf`, `Other` (custom label allowed).

### Styles
Default set: `Casual`, `Streetwear`, `Smart Casual`, `Formal`, `Elegant`, `Sporty`.
Users can **add, rename and delete** custom styles. An item or outfit can have **multiple styles**.

### Other item attributes
- Name (required)
- Category (required) + subtype for accessories
- Styles (multi)
- Seasons (multi): `Spring`, `Summer`, `Autumn`, `Winter`
- Colors (multi, from a fixed palette of ~16 named swatches; auto-suggested from the cut-out's dominant colors, editable)
- Brand (optional)
- Notes (optional)
- Favorite (bool)
- Date added (auto)

---

## 5. Data model (Dexie schema)

```ts
type View = 'front' | 'back' | 'side';

interface BaseModel {
  id: 'base';                       // singleton
  views: Record<View, {
    image: Blob;                    // WebP, background removed, max 1200px tall
    width: number; height: number;
    landmarks: PoseLandmarks;       // normalized keypoints (shoulders, hips, knees, ankles, etc.)
  }>;
  createdAt: number; updatedAt: number;
}

interface Item {
  id: string;
  name: string;
  category: Category;
  accessoryType?: string;
  styleIds: string[];
  seasons: Season[];
  colors: string[];
  brand?: string;
  notes?: string;
  favorite: boolean;
  layer: number;                    // defaults from category, editable
  views: Partial<Record<View, GarmentLayer>>; // all 3 expected; allow saving with fewer and show a warning badge
  thumbnail: Blob;                  // small WebP (~240px) for grids
  createdAt: number;
  wearCount: number;                // denormalized, recomputed from wear log
  lastWornAt?: number;              // denormalized
}

interface GarmentLayer {
  image: Blob;                      // WebP with alpha, cropped to bounding box
  bbox: { x: number; y: number; w: number; h: number }; // in base-model view coords
  transform: { dx: number; dy: number; scale: number; rotation: number }; // default fine-tune
}

interface Outfit {
  id: string;
  name: string;
  itemIds: string[];
  overrides: Record<string /*itemId*/, Partial<Record<View, {
    dx: number; dy: number; scale: number; rotation: number; layer?: number;
  }>>>;
  styleIds: string[];
  seasons: Season[];
  occasion?: string;                // free text with suggestions: Work, Weekend, Date, Party, Sport, Travel
  favorite: boolean;
  thumbnail: Blob;                  // composed front view, small WebP, regenerated on save
  createdAt: number; updatedAt: number;
}

interface WearLogEntry {
  id: string;
  date: string;                     // 'YYYY-MM-DD'
  outfitId: string;
  note?: string;
}

interface Style { id: string; name: string; builtIn: boolean; }

interface Settings {
  id: 'settings';
  unusedThresholdDays: number;      // default 60
  keepOriginalPhotos: boolean;      // default false
  onboardingDone: boolean;
  lastBackupAt?: number;
}
```

Indexes: items by `category`, `*styleIds`, `favorite`, `lastWornAt`; outfits by `*styleIds`, `*itemIds`, `favorite`; wearLog by `date`, `outfitId`.

When an item is deleted: remove it from every outfit. If an outfit ends up empty, delete it (after confirmation listing affected outfits). Wear log entries for deleted outfits stay, shown as "Deleted outfit".

---

## 6. Photo capture & cut-out pipeline (the critical part)

### 6.1 Capture
- Use `getUserMedia` with the rear camera when available in the installed PWA; fall back to `<input type="file" accept="image/*" capture="environment">`.
- Show a **semi-transparent overlay of the user's base model silhouette** (same view) on the live camera so they match pose and distance.
- **Self-timer** (3 / 5 / 10 s) with countdown + sound/haptic where available, so the phone can be propped up or on a tripod.
- Guided order: Front → Side → Back. Each step shows a short tip.
- Capture tips screen (shown once, re-openable): plain wall, even light, phone at chest height, same spot every time, arms slightly away from body, hair tied back if it covers the garment.
- Allow importing a photo from the gallery instead of live capture.

### 6.2 Base model creation
1. Capture 3 views in thermals.
2. Remove background with the person segmentation (the clothes-parsing model gives a full-body foreground mask: everything not `Background`).
3. Run Pose Landmarker; store landmarks per view.
4. User reviews each view, can refine with the brush tool, and confirms.

### 6.3 Garment cut-out
1. Run the **clothes-parsing model** on the photo. Pre-select the mask classes that match the item category:
   - T-Shirts / Shirts / Sweaters / Jackets → `Upper-clothes` (+ `Dress` if present)
   - Pants / Shorts → `Pants` (+ `Skirt`)
   - Shoes → `Left-shoe` + `Right-shoe`
   - Cap / Hat → `Hat`; Scarf → `Scarf`
   - Socks, Necklace, Other → no reliable class → go straight to **tap-to-select** (step 3)
2. Show the mask as a colored overlay on the photo.
3. **Tap-to-select** (SAM-style): user taps points on the garment (positive) or long-press/toggle for negative points to add or carve regions. Use this for socks, necklaces and to fix parsing errors.
4. **Brush tool**: add / erase modes, adjustable size, pinch-zoom & pan, undo/redo (at least 20 steps).
5. **Edge refinement**: slight feather (1–2 px) and small morphological cleanup to remove halos.
6. **Auto-alignment** to the base model: run Pose Landmarker on the garment photo, compute a similarity transform (scale + translation, optional small rotation) from relevant landmarks (shoulders for tops, hips/knees for bottoms, ankles for shoes/socks, head/neck for caps/necklaces/scarves) to the base model's landmarks of the same view. Store the result in `bbox` + `transform`.
7. Preview the garment layered on the base model; user can nudge/scale/rotate before saving.
8. Crop to bounding box, encode WebP, generate thumbnail, discard original photo (unless `keepOriginalPhotos`).

### 6.4 Model loading & performance
- ML models download **only when first needed**, with a progress bar and size shown ("One-time download, ~XX MB, then works offline").
- Cache model files via Cache Storage (Transformers.js cache + Workbox runtime caching). Verify they survive offline reload on iOS.
- Run inference in a **Web Worker**. Downscale input to the model's expected size; upscale masks back.
- Use WebGPU when available, otherwise WASM. Show a spinner and never freeze the UI.
- Watch iOS memory limits: release tensors, process one view at a time, prefer quantized models.

---

## 7. Storage optimization (iPhone)

- Max image height **1200 px**; garment layers cropped to their bounding box.
- WebP quality ~0.8 with alpha; PNG fallback only if encoding unsupported.
- Thumbnails ~240 px, WebP ~0.7.
- Originals discarded by default.
- Outfits store only references + transforms; thumbnails regenerated on save.
- Call `navigator.storage.persist()` after onboarding and show the result in Settings.
- Settings shows **storage used** (`navigator.storage.estimate()`) and a breakdown: base model, items, outfits.
- Target: ~300–500 KB per item across 3 views.

---

## 8. Screens

Bottom tab bar (5 tabs) + a persistent floating **"+" Add item** button visible on Wardrobe and Outfits.

### 8.1 Onboarding (first launch)
1. Welcome + what the app does.
2. **Install to Home Screen** instructions for iOS Safari (Share → Add to Home Screen), with an explanation that this keeps data safe. Detect standalone mode; if not installed, show a persistent soft banner.
3. **Privacy**: all photos stay on this device; nothing is uploaded; backups contain body photos, store them safely.
4. Photo tips.
5. Create base model (section 6.2).

### 8.2 Wardrobe (tab)
- Grid of item thumbnails, grouped or filtered by category (horizontal category chips).
- Filters: style, season, color, favorites, unused. Sort: newest, most worn, least worn, last worn.
- Search by name / brand.
- Badges: favorite ★, unused alert, missing views.
- Tap → **Item detail**: 3-view viewer (front/side/back toggle) on the base model, attributes, wear count, last worn, "Used in N outfits" (tap to list), edit, retake a view, delete.

### 8.3 Add / Edit item flow
Category → (accessory subtype) → capture 3 views (6.3) → details form (name, styles, seasons, colors auto-suggested, brand, notes) → save. Must be fast to repeat for every new purchase.

### 8.4 Outfit builder
- Large canvas showing the base model with layered items, **view switcher Front / Side / Back** (buttons + horizontal swipe).
- Bottom sheet with category tabs to pick items (one per category by default; allow multiple for accessories and layering tops, e.g. shirt + jacket).
- Tap an item on the canvas → select it → drag to move, pinch to scale, two-finger rotate, buttons for "bring forward / send backward", "reset", "remove". Adjustments are saved as per-view overrides.
- Save: name, styles, seasons, occasion, favorite.

### 8.5 Outfits (tab)
- Grid of outfit thumbnails.
- **Search & filters, with style as the primary filter** (style chips at the top), plus season, occasion, favorites, and "contains item" (pick an item → outfits that use it).
- Tap → **Outfit detail**: full-size composed view with Front/Side/Back toggle, item list, times worn, last worn, actions: "Wear today", "Wear on…" (date), edit, duplicate, favorite, delete.

### 8.6 Calendar (tab)
- Month view; days with a logged outfit show its thumbnail.
- Tap a day → assign/change/remove the outfit (and optional note); can log past days and plan future days. Only past/today entries count as "worn".
- Recomputes `wearCount` / `lastWornAt` for all items in that outfit.

### 8.7 Insights (tab)
- **Unused items**: not worn in > `unusedThresholdDays` (or never worn and added more than that many days ago). List with "create outfit with this" shortcut.
- **Usage counters**: most worn items, least worn items, most worn outfits, wears per category.
- Items not used in any outfit.

### 8.8 Settings (tab, or gear icon)
- Retake base model (per view), with a warning that existing items may need re-alignment.
- Manage styles.
- Unused threshold (days).
- Keep original photos (toggle).
- Storage usage + persistent storage status.
- **Export backup** (.zip: JSON data + image files) with filename `fitcheck-backup-YYYY-MM-DD.zip`; uses the iOS share sheet / download.
- **Import backup**: replace all or merge, with confirmation.
- Backup reminder if last backup > 30 days.
- Privacy notice, photo tips, about.
- Delete all data (double confirmation).

---

## 9. Alerts / notices (in-app, no push)
- Unused items count badge on the Insights tab and a card on Wardrobe.
- Backup reminder card when overdue.
- "Not installed to Home Screen" banner.
- Low storage warning when estimate shows < 10% quota left.
- Missing view badge on items saved without all 3 views.

---

## 10. Rendering
- Compose on `<canvas>`: base model image, then each item layer sorted by layer (outfit override → item → category default), drawn at `bbox` + item transform + outfit override.
- Device-pixel-ratio aware, crisp on Retina.
- View switch should feel instant: cache decoded `ImageBitmap`s per outfit session.
- Smooth crossfade between views.

---

## 11. Design
- Clean, fashion-app feel: lots of white space, neutral palette, one accent color, large imagery, rounded cards, subtle shadows. Dark mode following system setting.
- Typography: system font stack (SF Pro on iPhone).
- Haptic-feeling interactions (short transitions, tactile press states). Respect `prefers-reduced-motion`.
- Empty states with clear calls to action ("Add your first item").
- App name **FitCheck** (placeholder, easy to rename in one config file), proper icons for iOS (`apple-touch-icon`), splash/background color, `display: standalone`.

---

## 12. Build phases & acceptance criteria

### Phase 1 — Foundation
Vite/React/TS/Tailwind, routing, tab bar, Dexie schema with migrations, PWA manifest + service worker, GitHub Pages deploy workflow, onboarding screens (without ML yet).
✅ Installs to iPhone Home Screen from GitHub Pages, opens offline, navigates all tabs.

### Phase 2 — Base model & capture
Camera with overlay + timer, gallery import, background removal for the base model, pose landmarks, review + brush refinement.
✅ User can create and retake a base model fully offline after the first model download.

### Phase 3 — Items
Add item flow with clothes parsing, tap-to-select, brush, auto-alignment, preview, save; wardrobe grid, filters, search, item detail, edit, delete.
✅ A T-shirt, pants, shoes, socks and a necklace can each be added with 3 views and look correctly placed on the base model.

### Phase 4 — Outfits
Builder with view switcher, gestures, per-view overrides, layer order; outfits gallery with style-first search and filters; outfit detail, duplicate, delete.
✅ Create an outfit, rotate front/side/back smoothly, find it by style.

### Phase 5 — Calendar, counters & insights
Calendar logging/planning, wear counts, last worn, unused alerts, insights tab, favorites everywhere.
✅ Logging an outfit updates counters; unused items appear after the threshold.

### Phase 6 — Backup, storage & polish
Export/import zip, storage dashboard, persistent storage request, all notices, dark mode, empty states, performance pass, accessibility pass.
✅ Export on one iPhone, import on another → identical wardrobe. 100 items load smoothly.

After every phase: run type-check + lint + build, update `README.md` (setup, deploy, how to test on iPhone) and `DECISIONS.md`.

---

## 13. Testing
- Unit tests (Vitest) for: layer ordering, transform math / landmark alignment, wear count recomputation, unused logic, backup round-trip.
- Manual iPhone test checklist in `TESTING.md` (install, offline, camera, model download, storage persistence, backup round-trip).
- Seed script with sample data (generated placeholder images) for local UI development, removable before release.

---

## 14. Out of scope (do not build)
Accounts, cloud sync, sharing wardrobes between users, laundry status, wishlist, "surprise me" / random outfit suggestions, AI outfit recommendations, weather integration, push notifications, Android-specific work.
