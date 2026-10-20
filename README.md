# FitCheck

An offline-first virtual wardrobe PWA for iPhone. You photograph yourself and your clothes, and FitCheck layers the clothes on your own body so you can build outfits and see them from the front, side and back. Everything stays on your device.

See [`SPEC.md`](SPEC.md) for the full product spec, [`DECISIONS.md`](DECISIONS.md) for design and technical decisions, and [`TESTING.md`](TESTING.md) for the manual iPhone checklist.

**Status:** Phases 1 (foundation) and 2 (base model & capture) are built. You can create your base model: camera or library photos, on-device background removal (SegFormer), optional edge refinement (SlimSAM), pose landmarks (MediaPipe), and a brush editor. Adding clothing items comes in Phase 3.

### Code map
- `src/ml/`: ML behind swappable interfaces (`providers.ts`: `SegmentationProvider`, `EdgeRefiner`, `PoseProvider`), Web Workers, model catalogue, auto backend selection and crash fallback (`mlConfig.ts`).
- `src/lib/mask/`: pure mask operations (morphology, feathering, resampling, RLE). `src/lib/gesture/`: reusable Pointer Events gesture layer and transform math.
- `src/components/ViewportCanvas.tsx`: pan / pinch-zoom / rotate / double-tap canvas, reused by every interactive canvas.
- `src/features/capture/`: camera, review and brush editor. `src/features/baseModel/`: base model flow, processing pipeline, storage.

## Setup

Requires Node.js 22.22 or later (24 LTS recommended).

```sh
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | ESLint (type-aware) |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

App icons are generated at build time from `public/icon.svg`. To rename the app, edit `src/config/app.ts`.

## Deploy (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy.yml`. It type-checks, lints, tests and builds the app, then publishes it to GitHub Pages.

One-time setup: on GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The app is then live at `https://<user>.github.io/FitCheck-App-Tu-Armario-de-Ropa/`. If you rename the repo, update `repoName` in `src/config/app.ts`.

## Test on iPhone

1. Open the GitHub Pages URL in **Safari** on the iPhone.
2. Tap **Share → Add to Home Screen**.
3. Open FitCheck from the Home Screen and go through onboarding.
4. Turn on Airplane Mode, close the app and reopen it. It should still load and you should be able to move between all tabs.

The full checklist is in [`TESTING.md`](TESTING.md).
