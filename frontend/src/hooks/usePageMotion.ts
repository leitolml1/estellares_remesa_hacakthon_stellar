import { animate, createScope, stagger } from 'animejs'
import { useLayoutEffect, useRef } from 'react'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePageMotion(resetKey = '') {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return

    const enters = [...node.querySelectorAll<HTMLElement>('.anim-enter')]

    if (prefersReducedMotion()) {
      for (const item of enters) {
        item.style.opacity = '1'
        item.style.transform = ''
      }
      return
    }

    const enterAnim =
      enters.length > 0
        ? animate(enters, {
            opacity: [0, 1],
            translateY: [22, 0],
            delay: stagger(75, { start: 40 }),
            duration: 560,
            ease: 'out(3)',
          })
        : null

    const scope = createScope({ root }).add(() => {
      animate('.anim-doodle', {
        rotate: 360,
        loop: true,
        ease: 'linear',
        duration: 16000,
      })

      animate('.anim-float', {
        translateY: [
          { to: -10, duration: 1800, ease: 'inOut(2)' },
          { to: 0, duration: 1800, ease: 'inOut(2)' },
        ],
        loop: true,
      })
    })

    return () => {
      enterAnim?.cancel()
      for (const item of enters) {
        item.style.opacity = '1'
        item.style.transform = ''
      }
      scope.revert()
    }
  }, [resetKey])

  return root
}
