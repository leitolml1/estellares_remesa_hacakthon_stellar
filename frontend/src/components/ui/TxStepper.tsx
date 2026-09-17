import { animate } from 'animejs'
import { useLayoutEffect, useRef } from 'react'

const STEPS = [
  { id: 'building', label: 'Armar' },
  { id: 'signing', label: 'Firmar' },
  { id: 'submitting', label: 'Enviar' },
  { id: 'ok', label: 'Listo' },
] as const

type StepId = (typeof STEPS)[number]['id']

function stepIndex(status: string): number {
  if (status === 'idle' || status === 'error') return -1
  return STEPS.findIndex((step) => step.id === status)
}

export function TxStepper({
  status,
}: {
  status: 'idle' | 'building' | 'signing' | 'submitting' | 'ok' | 'error'
}) {
  const root = useRef<HTMLOListElement>(null)
  const active = stepIndex(status)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const current = node.querySelector<HTMLElement>('.tx-step-active')
    if (!current) return

    animate(current, {
      scale: [0.86, 1],
      opacity: [0.35, 1],
      duration: 420,
      ease: 'out(4)',
    })

    const pulse = current.querySelector<HTMLElement>('.tx-step-dot')
    if (!pulse || status === 'ok' || status === 'idle' || status === 'error') {
      return
    }

    const loop = animate(pulse, {
      scale: [1, 1.28, 1],
      duration: 900,
      ease: 'inOut(2)',
      loop: true,
    })

    return () => {
      loop.cancel()
    }
  }, [status])

  return (
    <ol ref={root} className="mt-5 space-y-3">
      {STEPS.map((step, index) => {
        const done = active > index || status === 'ok'
        const isActive = active === index
        const tone = done
          ? 'tx-step-done'
          : isActive
            ? 'tx-step-active'
            : 'tx-step-idle'
        return (
          <li
            key={step.id}
            className={`flex items-center gap-3 text-base ${tone}`}
            data-step={step.id as StepId}
          >
            <span
              className={`tx-step-dot grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${
                done
                  ? 'bg-yellow text-ink'
                  : isActive
                    ? 'bg-purple text-white'
                    : 'bg-white/10 text-white/45'
              }`}
            >
              {done ? '✓' : index + 1}
            </span>
            <span className={done || isActive ? 'text-white' : 'text-white/45'}>
              {step.label}
              {isActive && status === 'building' ? ' · armando…' : null}
              {isActive && status === 'signing' ? ' · Freighter…' : null}
              {isActive && status === 'submitting' ? ' · enviando…' : null}
              {done && index === 3 ? ' · confirmada' : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
