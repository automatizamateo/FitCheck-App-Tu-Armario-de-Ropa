import { Link } from 'react-router'
import { PlusIcon } from './Icons'

/** Floating "+": Add item on Wardrobe, New outfit on Outfits (outfits are never made from photos). */
export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="bg-ink text-canvas fixed right-[max(1.25rem,env(safe-area-inset-right))] bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 flex size-14 items-center justify-center rounded-full shadow-lg shadow-black/20 transition active:scale-90"
    >
      <PlusIcon className="size-7" />
    </Link>
  )
}
