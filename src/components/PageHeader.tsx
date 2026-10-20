import type { ReactNode } from 'react'

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="px-safe flex items-end justify-between pt-4 pb-3">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  )
}
