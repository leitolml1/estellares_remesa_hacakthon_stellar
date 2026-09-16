import { animate, stagger } from 'animejs'
import { useLayoutEffect, useRef } from 'react'

const DEFAULT_SELECTOR = '.unfold-down, .form-panel, .form-aside, .stage-card'

export function useUnfoldDown(
  resetKey: string | number = '',
  selector = DEFAULT_SELECTOR,
) {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return

    const items = [...node.querySelectorAll<HTMLElement>(selector)]
    if (items.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const item of items) {
        item.style.opacity = '1'
        item.style.clipPath = 'none'
        item.style.transform = ''
      }
      return
    }

    // El estado inicial oculto lo setea el hook (via inline styles) y NO el
    // CSS base: si por cualquier razon este efecto no llega a correr para
    // un elemento (montaje tardio tras un fetch, HMR stale, refactor
    // futuro), el contenido queda VISIBLE en vez de invisible para siempre.
    // useLayoutEffect corre antes del paint, asi que no hay flash.
    for (const item of items) {
      item.style.opacity = '0'
      item.style.clipPath = 'inset(0% 0% 100% 0% round 28px)'
      item.style.transform = 'translateY(-18px)'
    }

    const animation = animate(items, {
      clipPath: [
        'inset(0% 0% 100% 0% round 28px)',
        'inset(0% 0% 0% 0% round 28px)',
      ],
      translateY: [-18, 0],
      opacity: [0, 1],
      delay: stagger(110, { start: 90 }),
      duration: 680,
      ease: 'out(3)',
    })

    return () => {
      animation.cancel()
      for (const item of items) {
        item.style.opacity = '1'
        item.style.clipPath = 'none'
        item.style.transform = ''
      }
    }
  }, [resetKey, selector])

  return root
}
