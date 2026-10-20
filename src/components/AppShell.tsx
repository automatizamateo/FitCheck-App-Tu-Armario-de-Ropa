import { Outlet, useLocation } from 'react-router'
import { MlNotice } from '../features/ml/MlNotice'
import { Fab } from './Fab'
import { InstallBanner } from './InstallBanner'
import { TabBar } from './TabBar'

const FABS: Record<string, { to: string; label: string } | undefined> = {
  '/wardrobe': { to: '/items/new', label: 'Add item' },
  '/outfits': { to: '/outfits/new', label: 'New outfit' },
}

export function AppShell() {
  const { pathname } = useLocation()
  const fab = FABS[pathname]
  return (
    <div className="pt-safe min-h-dvh pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <InstallBanner />
      <div className="px-safe empty:hidden pt-2">
        <MlNotice />
      </div>
      <main className="mx-auto max-w-lg">
        <Outlet />
      </main>
      {fab && <Fab {...fab} />}
      <TabBar />
    </div>
  )
}
