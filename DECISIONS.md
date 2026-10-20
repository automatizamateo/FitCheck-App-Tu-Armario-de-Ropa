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
