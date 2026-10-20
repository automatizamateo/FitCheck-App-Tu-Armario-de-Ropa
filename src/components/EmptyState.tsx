import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <div className="bg-accent-soft text-accent mb-5 flex size-20 items-center justify-center rounded-full [&>svg]:size-9">
        {icon}
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-muted mt-2 max-w-xs text-[15px] leading-relaxed">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
