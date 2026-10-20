import { Outlet, useLocation } from 'react-router'
import { AddItemFab } from './AddItemFab'
import { InstallBanner } from './InstallBanner'
import { TabBar } from './TabBar'

const FAB_ROUTES = ['/wardrobe', '/outfits']

export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="pt-safe min-h-dvh pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <InstallBanner />
      <main className="mx-auto max-w-lg">
        <Outlet />
      </main>
      {FAB_ROUTES.includes(pathname) && <AddItemFab />}
      <TabBar />
    </div>
  )
}
