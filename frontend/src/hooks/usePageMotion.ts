import { animate, stagger } from 'animejs'
import { useLayoutEffect, useRef } from 'react'

export function usePageMotion(resetKey = '') {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return

    const enters = [...node.querySelectorAll<HTMLElement>('.anim-enter')]
    if (enters.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const item of enters) {
        item.style.opacity = '1'
        item.style.transform = ''
      }
      return
    }

    const animation = animate(enters, {
      opacity: [0, 1],
      translateY: [22, 0],
      delay: stagger(75, { start: 40 }),
      duration: 560,
      ease: 'out(3)',
    })

    return () => {
      animation.cancel()
      for (const item of enters) {
        item.style.opacity = '1'
        item.style.transform = ''
      }
    }
  }, [resetKey])

  return root
}
