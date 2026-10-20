import { useState } from 'react'
import { isStandalone } from '../lib/platform'
import { useUI } from '../store/ui'
import { CloseIcon, ShareIcon } from './Icons'
import { InstallInstructions } from './InstallInstructions'

export function InstallBanner() {
  const hidden = useUI((s) => s.installBannerHidden)
  const hide = useUI((s) => s.hideInstallBanner)
  const [open, setOpen] = useState(false)

  if (hidden || isStandalone()) return null

  return (
    <div className="px-safe pt-2">
      <div className="bg-accent-soft rounded-2xl p-3 text-sm">
        <div className="flex items-center gap-3">
          <ShareIcon className="text-accent size-5 shrink-0" />
          <button
            type="button"
            className="flex-1 text-left leading-snug"
            onClick={() => {
              setOpen((o) => !o)
            }}
            aria-expanded={open}
          >
            <strong>Add to Home Screen</strong> to keep your wardrobe safe. <span className="underline">How?</span>
          </button>
          <button type="button" aria-label="Hide for now" onClick={hide} className="text-muted -m-2 p-2">
            <CloseIcon className="size-5" />
          </button>
        </div>
        {open && (
          <div className="border-accent/20 mt-3 border-t pt-3">
            <InstallInstructions />
          </div>
        )}
      </div>
    </div>
  )
}
