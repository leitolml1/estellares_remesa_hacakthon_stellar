import type { ReactNode } from 'react'

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-yellow px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
      {children}
    </span>
  )
}
