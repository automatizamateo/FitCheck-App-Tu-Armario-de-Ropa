/// <reference types="vitest/config" />
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_CONFIG } from './src/config/app.ts'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves the site from /<repo-name>/
const base = process.env.GITHUB_PAGES === 'true' ? `/${APP_CONFIG.repoName}/` : '/'

// Copies the ML runtimes' WASM into public/ort/ and public/mediapipe/ (both gitignored), so they are
// served from our origin. They are not precached: they download with the models on first use.
function mlRuntimes(): Plugin {
  // Resolve onnxruntime-web the way Transformers.js does, so the WASM matches its JS exactly.
  const transformersEntry = createRequire(import.meta.url).resolve('@huggingface/transformers')
  const ortEntry = createRequire(transformersEntry).resolve('onnxruntime-web')
  const ortDist = join(ortEntry.slice(0, ortEntry.lastIndexOf('onnxruntime-web') + 'onnxruntime-web'.length), 'dist')
  const mediapipeWasm = join(
    dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')),
    'wasm',
  )
  return {
    name: 'ml-runtimes',
    buildStart() {
      mkdirSync('public/ort', { recursive: true })
      for (const variant of ['', '.asyncify']) {
        for (const ext of ['mjs', 'wasm']) {
          const file = `ort-wasm-simd-threaded${variant}.${ext}`
          copyFileSync(join(ortDist, file), join('public/ort', file))
        }
      }
      // Module build: our workers are ES modules and cannot use importScripts.
      mkdirSync('public/mediapipe', { recursive: true })
      for (const file of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) {
        copyFileSync(join(mediapipeWasm, file), join('public/mediapipe', file))
      }
    },
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    {
      name: 'app-name-in-html',
      transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_CONFIG.name),
    },
    mlRuntimes(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        name: APP_CONFIG.name,
        short_name: APP_CONFIG.name,
        description: APP_CONFIG.description,
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: APP_CONFIG.backgroundColor,
        theme_color: APP_CONFIG.backgroundColor,
      },
      workbox: {
        // The plugin adds manifest.webmanifest itself; matching it here too precaches it twice.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        globIgnores: ['ort/**', 'mediapipe/**'],
        // MediaPipe's runtime is fetched from a worker on first use; keep it for offline use.
        // (Transformers.js caches the ONNX Runtime and models itself.)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/'),
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe-runtime', cacheableResponse: { statuses: [200] } },
          },
        ],
        // Take control on the very first visit, so the app works offline without a relaunch.
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
