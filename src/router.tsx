import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from './components/AppShell'
import { OnboardingGate } from './components/OnboardingGate'
import { SegmentationLab } from './lab/SegmentationLab'
import { OnboardingFlow } from './onboarding/OnboardingFlow'
import { CalendarPage } from './pages/CalendarPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { InsightsPage } from './pages/InsightsPage'
import { OutfitsPage } from './pages/OutfitsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WardrobePage } from './pages/WardrobePage'

// Hash routing: GitHub Pages has no SPA fallback, and it keeps the service worker scope simple.
export const router = createHashRouter([
  {
    element: <OnboardingGate />,
    children: [
      { path: '/welcome', element: <OnboardingFlow /> },
      // Hidden ML spike screen: tap the version line in Settings 5 times.
      { path: '/lab/segmentation', element: <SegmentationLab /> },
      {
        path: '/items/new',
        element: (
          <ComingSoonPage
            title="Adding items is coming soon"
            body="Capturing clothes and cutting them out arrives in an upcoming update."
          />
        ),
      },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/wardrobe" replace /> },
          { path: '/wardrobe', element: <WardrobePage /> },
          { path: '/outfits', element: <OutfitsPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/insights', element: <InsightsPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
