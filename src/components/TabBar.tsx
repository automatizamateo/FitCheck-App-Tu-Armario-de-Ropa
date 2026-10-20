import { NavLink } from 'react-router'
import { CalendarIcon, ChartIcon, GearIcon, HangerIcon, ShirtIcon } from './Icons'

const TABS = [
  { to: '/wardrobe', label: 'Wardrobe', Icon: HangerIcon },
  { to: '/outfits', label: 'Outfits', Icon: ShirtIcon },
  { to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { to: '/insights', label: 'Insights', Icon: ChartIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
] as const

export function TabBar() {
  return (
    <nav className="bg-surface/85 border-line pb-safe fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-xl">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition active:scale-90 ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <Icon className="size-6" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
