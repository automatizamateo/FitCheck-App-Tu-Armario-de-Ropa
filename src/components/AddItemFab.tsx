import { Link } from 'react-router'
import { PlusIcon } from './Icons'

export function AddItemFab() {
  return (
    <Link
      to="/items/new"
      aria-label="Add item"
      className="bg-ink text-canvas fixed right-[max(1.25rem,env(safe-area-inset-right))] bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 flex size-14 items-center justify-center rounded-full shadow-lg shadow-black/20 transition active:scale-90"
    >
      <PlusIcon className="size-7" />
    </Link>
  )
}
