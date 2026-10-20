import type { ReactNode } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-muted mb-2 px-1 text-xs font-semibold tracking-wider uppercase">{title}</h2>
      <div className="bg-surface border-line divide-line divide-y overflow-hidden rounded-2xl border">{children}</div>
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 shrink-0 basis-auto">
        <p className="text-[15px]">{label}</p>
        {hint && <p className="text-muted max-w-52 text-xs">{hint}</p>}
      </div>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  )
}

export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between px-4 text-[15px] [&::-webkit-details-marker]:hidden">
        {label}
        <span className="text-muted transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        onChange(!checked)
      }}
      className={`relative h-[31px] w-[51px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  )
}
