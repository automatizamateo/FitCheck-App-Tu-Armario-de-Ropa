/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_CONFIG } from './src/config/app.ts'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves the site from /<repo-name>/
const base = process.env.GITHUB_PAGES === 'true' ? `/${APP_CONFIG.repoName}/` : '/'

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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
