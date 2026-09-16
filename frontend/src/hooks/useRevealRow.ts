import { animate, stagger } from 'animejs'
import { useLayoutEffect, useRef } from 'react'

export function useRevealRow() {
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const section = root.current
    if (!section) return

    const items = [...section.querySelectorAll<HTMLElement>('.feature-card')]
    if (items.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const item of items) {
        item.style.opacity = '1'
        item.style.transform = ''
      }
      return
    }

    const animation = animate(items, {
      opacity: [0, 1],
      translateY: [22, 0],
      delay: stagger(90),
      duration: 520,
      ease: 'out(3)',
    })

    return () => {
      animation.cancel()
      for (const item of items) {
        item.style.opacity = '1'
        item.style.transform = ''
      }
    }
  }, [])

  return root
}
