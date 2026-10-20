import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { debugLog } from './lib/debugLog'
import { recoverFromMlCrash } from './ml/crashRecovery'
import { router } from './router'
import './index.css'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

debugLog(`launch ${__APP_VERSION__}`, {
  route: location.hash || '#/',
  ua: navigator.userAgent,
  memoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
})

// The crash step-down must be saved before any screen reads the ML settings.
void recoverFromMlCrash()
  .catch((err: unknown) => {
    debugLog(`crash recovery failed: ${err instanceof Error ? err.message : String(err)}`)
  })
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  })
