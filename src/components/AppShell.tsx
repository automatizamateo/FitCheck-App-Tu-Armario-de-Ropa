import { Outlet, useLocation } from 'react-router'
import { MlNotice } from '../features/ml/MlNotice'
import { AddItemFab } from './AddItemFab'
import { InstallBanner } from './InstallBanner'
import { TabBar } from './TabBar'

const FAB_ROUTES = ['/wardrobe', '/outfits']

export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="pt-safe min-h-dvh pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <InstallBanner />
      <div className="px-safe empty:hidden pt-2">
        <MlNotice />
      </div>
      <main className="mx-auto max-w-lg">
        <Outlet />
      </main>
      {FAB_ROUTES.includes(pathname) && <AddItemFab />}
      <TabBar />
    </div>
  )
}
