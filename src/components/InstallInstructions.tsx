import type { ReactNode } from 'react'
import { APP_CONFIG } from '../config/app'
import { ShareIcon, PlusIcon } from './Icons'

export function InstallInstructions() {
  return (
    <ol className="space-y-4 text-[15px]">
      <Step n={1}>
        Open this page in <strong>Safari</strong>.
      </Step>
      <Step n={2}>
        Tap the <strong>Share</strong> button <ShareIcon className="inline size-5 -translate-y-0.5" /> in the toolbar.
      </Step>
      <Step n={3}>
        Scroll down and tap <strong>Add to Home Screen</strong>{' '}
        <PlusIcon className="border-ink inline size-5 -translate-y-0.5 rounded border p-0.5" />.
      </Step>
      <Step n={4}>Open {APP_CONFIG.name} from your Home Screen.</Step>
    </ol>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-ink text-canvas flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  )
}
