import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { recoverFromMlCrash } from './ml/crashRecovery'
import { router } from './router'
import './index.css'

registerSW({ immediate: true })
void recoverFromMlCrash()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
