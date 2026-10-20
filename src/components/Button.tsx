import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-canvas',
  secondary: 'bg-surface text-ink border border-line',
  ghost: 'text-muted',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition active:scale-[0.97] active:opacity-80 disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
