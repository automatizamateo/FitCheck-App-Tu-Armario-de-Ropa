# Decisions

## Phase 1 — Foundation (2026-10-20)

### Versions (checked on npm, 2026-10-20)
- **Vite 8.3**, **React 19.3**, **React Router 8.5**, **Tailwind CSS 4.3**, **Dexie 4.4** with dexie-react-hooks 4.4, **Zustand 5.0**, **vite-plugin-pwa 2.0** (Workbox 7.4), **Vitest 5.0**, **ESLint 10** with typescript-eslint 8.72.
- **TypeScript is pinned to 6.0.3, not 7.0.** TypeScript 7 (the Go-native compiler) is out, but typescript-eslint 8.72 only supports TypeScript below 6.1. Move to 7.x once typescript-eslint supports it.
- vite-plugin-pwa 2.0's only breaking change is accepting `@vite-pwa/assets-generator` 2.x as a peer dependency.

### iOS Safari compatibility
- **Minimum is iOS/Safari 16.4.** Vite 8's default build target is `baseline-widely-available` (`safari16.4`, `ios16.4`), and Tailwind v4 also requires Safari 16.4 because it uses cascade layers, `@property` and `color-mix()`. iOS 16.4 is from March 2023, so every iPhone that can install iOS 17 or later is covered.
- Service workers, IndexedDB and the Storage API (`persist()`, `estimate()`) are all supported in Safari 16.4 and later, including in Home Screen web apps.

### Routing
- **Hash routing** (`createHashRouter`). GitHub Pages has no SPA fallback, so a deep link like `/outfits` would 404 after a reload. Hash URLs always load `index.html`, which the service worker precaches.

### Base path
- `vite.config.ts` uses the `/<repoName>/` base only when `GITHUB_PAGES=true`, which the deploy workflow sets. Local dev and preview use `/` unless that variable is set.

### Database
- Dexie `version(1)` matches the spec schema. Future schema changes add a new `version(n)` with `upgrade()` and never edit released versions.
- **`favorite` is not indexed.** IndexedDB cannot use booleans as keys, so an index on a boolean field is silently empty. Favorites are filtered in memory, which is fast enough for hundreds of items. Storing `0`/`1` instead would make the TypeScript model awkward for no real gain.
- Built-in styles have stable ids (`builtin-casual`, …) so backups merge cleanly between devices.
- Default styles and settings are seeded in Dexie's `populate` event, which runs only once on first database creation.

### PWA
- `registerType: 'autoUpdate'`: a new deploy activates on the next launch with no prompt. With one user per device and no server state, there is nothing to lose by updating silently.
- Icons are generated at build time from `public/icon.svg` by `@vite-pwa/assets-generator` (minimal 2023 preset: favicon, 192/512 PNG, maskable, 180px `apple-touch-icon`) on an opaque background, because iOS renders transparent icons on black.
- Theme color uses two `<meta name="theme-color">` tags (light and dark) instead of the plugin-injected one, so the status bar follows the system theme.

### UX
- **Settings is the 5th tab**, giving Wardrobe, Outfits, Calendar, Insights and Settings.
- The "Not installed" banner can be hidden for the current session only and comes back on the next launch, so it stays a "persistent soft banner".
- **Onboarding step 5 (base model) is a placeholder** until Phase 2. Finishing onboarding sets `onboardingDone` and calls `navigator.storage.persist()`. In Phase 2, the app will send the user to base model creation whenever no base model exists.
- The "+ Add item" button opens a "coming soon" screen until Phase 3.
- Accent color: terracotta `#b25a3c` (light) / `#d97a58` (dark) on a warm neutral background.

### Fixes found during Phase 2 spike
- The service worker now sets `clientsClaim` + `skipWaiting`. Without them, the first visit was not controlled by the service worker until the app was relaunched, so going offline straight after the first visit failed.
- `manifest.webmanifest` was precached twice (by the glob and by the plugin). The glob no longer includes it.

## Phase 2 — ML spike (2026-10-20)

### Segmentation model: `Xenova/segformer_b2_clothes` (spike default), with `segformer_b0_clothes` for comparison
Checked on Hugging Face on 2026-10-20:

| Model | q8 | fp16 | fp32 | Notes |
| --- | --- | --- | --- | --- |
| segformer_b2_clothes (Xenova ONNX of mattmdjaga) | 28.8 MB | 55.5 MB | 110 MB | ~430k downloads/month for the original; best accuracy of the ONNX options |
| segformer_b0_clothes (Xenova ONNX) | 4.4 MB | 7.9 MB | 15.2 MB | Same 18 ATR labels, much smaller, less accurate |
| segformer_b3_clothes (sayeed99) | — | — | — | No ONNX weights, so not usable without converting it ourselves |

- Both models output the 18 ATR labels the spec needs: Upper-clothes, Pants, Skirt, Dress, Left/Right-shoe, Hat, Scarf, and so on. "Everything except Background" gives the person mask for the base model.
- Input is 512×512 and output logits are 128×128. The worker upsamples the logits bilinearly to a mask of at most 512 or 1024 px on the long side, then takes the argmax.
- **License caveat:** the b2 model card says its license is NVIDIA's SegFormer license, which allows non-commercial use "for research or evaluation purposes only". The b0 card says MIT, but it is fine-tuned from the same NVIDIA pretrained weights. FitCheck is personal, non-commercial and shared only with family, so this is a judgement call for the owner. **Permissive fallback if needed:** MODNet (Apache-2.0, 6.6 MB q8) for person/background removal plus SlimSAM (Apache-2.0, ~14 MB q8) for tap-to-select garments. That loses automatic per-category pre-selection.

### Runtime
- **Transformers.js 4.3.1** (Apache-2.0), which uses onnxruntime-web 1.31.0-dev. WebGPU is on by default in Safari 26 (iOS 26). WASM is the fallback.
- Device "auto" requests a WebGPU adapter **inside the worker**. If there is none, or the model fails to load on WebGPU, it falls back to WASM and shows the reason. The spike lets you force each device and precision so we can measure on a real iPhone.
- **WASM runs single-threaded.** Multithreading needs cross-origin isolation (COOP/COEP headers), which GitHub Pages cannot send, and Safari lacks `COEP: credentialless`, so a service-worker workaround would also block the Hugging Face downloads.
- Inference runs in a module Web Worker. The photo is decoded and downscaled to at most 1200 px on the main thread (`createImageBitmap` with resize, so 48 MP photos are never decoded at full size) and transferred to the worker as an `ImageBitmap`. Tensors are disposed after each run, and "Unload" terminates the worker.

### Offline caching
- **ONNX Runtime WASM is served from our origin** (`/ort/`, copied from `node_modules` at build time) instead of jsDelivr, so the only external host is Hugging Face (`huggingface.co` plus its CDN `*.cdn.hf.co`, CORS `*`). The spec allows only that one-time model download.
- Transformers.js stores the model files **and** the ORT WASM in Cache Storage (`transformers-cache`) on first use. Workbox does not runtime-cache them as well, because that would store every model twice. The WASM and model files are not precached, so users who never open the ML features never download them.
- The worker bundle (545 KB) is precached, so ML works offline once the model is cached.
- Verified in headless Chromium: the online run downloads from Hugging Face; after going offline and reloading, the model loads from cache in 0.5 s, segmentation still runs, and no external requests are made.
- The asyncify ORT build (26.9 MB, 6.8 MB gzipped on the wire) is needed for WebGPU. The plain build (14.3 MB) is used only where `navigator.gpu` is missing, which is the same rule Transformers.js uses.
