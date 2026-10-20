import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from './components/AppShell'
import { OnboardingGate } from './components/OnboardingGate'
import { BaseModelFlow } from './features/baseModel/BaseModelFlow'
import { AddItemFlow } from './features/items/AddItemFlow'
import { OutfitBuilder } from './features/outfits/OutfitBuilder'
import { SegmentationLab } from './lab/SegmentationLab'
import { OnboardingFlow } from './onboarding/OnboardingFlow'
import { CalendarPage } from './pages/CalendarPage'
import { InsightsPage } from './pages/InsightsPage'
import { ItemDetailPage } from './pages/ItemDetailPage'
import { ItemEditPage } from './pages/ItemEditPage'
import { OutfitDetailPage } from './pages/OutfitDetailPage'
import { OutfitsPage } from './pages/OutfitsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WardrobePage } from './pages/WardrobePage'

// Hash routing: GitHub Pages has no SPA fallback, and it keeps the service worker scope simple.
export const router = createHashRouter([
  {
    element: <OnboardingGate />,
    children: [
      { path: '/welcome', element: <OnboardingFlow /> },
      // ?view=front|side|back retakes one view; ?onboarding=1 finishes onboarding when done.
      { path: '/base-model', element: <BaseModelFlow /> },
      // Hidden ML spike screen: tap the version line in Settings 5 times.
      { path: '/lab/segmentation', element: <SegmentationLab /> },
      // ?retake=<itemId>&view=<view> retakes (or adds) one view of an existing item.
      { path: '/items/new', element: <AddItemFlow /> },
      { path: '/wardrobe/:id/edit', element: <ItemEditPage /> },
      // Outfits are built from wardrobe items only (?item=<id> starts with that item).
      { path: '/outfits/new', element: <OutfitBuilder /> },
      { path: '/outfits/:id/edit', element: <OutfitBuilder /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/wardrobe" replace /> },
          { path: '/wardrobe', element: <WardrobePage /> },
          { path: '/wardrobe/:id', element: <ItemDetailPage /> },
          { path: '/outfits', element: <OutfitsPage /> },
          { path: '/outfits/:id', element: <OutfitDetailPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/insights', element: <InsightsPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
