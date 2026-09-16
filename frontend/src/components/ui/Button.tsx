import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'yellow' | 'black' | 'ghost' | 'purple' | 'white'

const variants: Record<Variant, string> = {
  yellow:
    'bg-yellow text-ink hover:bg-yellow-hot',
  black:
    'bg-ink text-paper hover:bg-ink-soft',
  purple:
    'bg-purple text-white hover:bg-purple-deep',
  ghost:
    'bg-transparent text-ink border border-ink/15 hover:border-ink hover:bg-white',
  white:
    'bg-white text-ink border border-ink/10 hover:border-ink shadow-sm',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

export function Button({
  variant = 'yellow',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
