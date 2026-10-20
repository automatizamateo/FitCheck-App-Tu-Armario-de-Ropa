import { updateMlSettings, useSettings } from '../../db/settings'

/** Shows a one-time message about an automatic ML change (e.g. after an out-of-memory crash). */
export function MlNotice({ dark = false }: { dark?: boolean }) {
  const notice = useSettings()?.ml.pendingNotice
  if (!notice) return null
  return (
    <div
      role="status"
      className={`rounded-2xl p-4 text-sm leading-relaxed shadow-lg ${dark ? 'bg-amber-300 text-black' : 'border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50'}`}
    >
      <p>{notice}</p>
      <button
        type="button"
        className="mt-1 h-11 font-semibold underline"
        onClick={() => void updateMlSettings({ pendingNotice: undefined })}
      >
        Got it
      </button>
    </div>
  )
}
