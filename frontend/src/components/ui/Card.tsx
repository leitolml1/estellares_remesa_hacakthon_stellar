import type { ReactNode } from 'react'

type Tone = 'white' | 'black' | 'purple'

const tones: Record<Tone, string> = {
  white: 'border-transparent bg-white text-ink',
  black: 'border-white/10 bg-white/5 text-paper',
  purple: 'bg-purple text-white border-purple-deep',
}

export function Card({
  children,
  className = '',
  tone = 'white',
}: {
  children: ReactNode
  className?: string
  tone?: Tone
}) {
  return (
    <section
      className={`rounded-[28px] border p-6 sm:p-8 ${tones[tone]} ${className}`}
    >
      {children}
    </section>
  )
}
