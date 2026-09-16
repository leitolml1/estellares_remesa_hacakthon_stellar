import type { ReactNode } from 'react'

type Tone = 'error' | 'ok' | 'info'

const tones: Record<Tone, string> = {
  error: 'bg-purple-soft text-purple-deep border-purple/30',
  ok: 'bg-yellow/25 text-ink border-yellow',
  info: 'bg-lilac text-purple-deep border-purple/20',
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 text-base leading-6 ${tones[tone]}`}>
      {children}
    </div>
  )
}
