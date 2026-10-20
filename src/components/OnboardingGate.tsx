import { Navigate, Outlet, useLocation } from 'react-router'
import { useSettings } from '../db/settings'

/** Sends first-time users to onboarding, and returning users away from it. */
export function OnboardingGate() {
  const settings = useSettings()
  const { pathname } = useLocation()
  if (!settings) return null
  const onWelcome = pathname === '/welcome'
  const allowedDuringOnboarding = onWelcome || pathname === '/base-model'
  if (!settings.onboardingDone && !allowedDuringOnboarding) return <Navigate to="/welcome" replace />
  if (settings.onboardingDone && onWelcome) return <Navigate to="/wardrobe" replace />
  return <Outlet />
}
