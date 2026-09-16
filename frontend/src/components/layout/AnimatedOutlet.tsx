import { animate } from 'animejs'
import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const layerRef = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLSpanElement>(null)
  const outletRef = useRef(outlet)
  const pathRef = useRef(location.pathname)
  const genRef = useRef(0)
  const enterAnim = useRef<ReturnType<typeof animate> | null>(null)
  const exitAnim = useRef<ReturnType<typeof animate> | null>(null)

  outletRef.current = outlet

  const [view, setView] = useState(outlet)

  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer || reducedMotion()) return

    enterAnim.current?.cancel()
    enterAnim.current = animate(layer, {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 320,
      ease: 'out(3)',
    })
  }, [view])

  useLayoutEffect(() => {
    if (location.pathname === pathRef.current) return

    const gen = ++genRef.current
    pathRef.current = location.pathname

    const swap = () => {
      if (gen !== genRef.current) return
      setView(outletRef.current)
      window.scrollTo(0, 0)
    }

    const sweep = sweepRef.current
    if (sweep && !reducedMotion()) {
      void animate(sweep, {
        scaleX: [0, 1],
        opacity: [1, 1],
        duration: 240,
        ease: 'out(3)',
      }).then(() =>
        animate(sweep, {
          opacity: [1, 0],
          duration: 140,
          ease: 'in(2)',
          onComplete: () => {
            sweep.style.transform = 'scaleX(0)'
          },
        }),
      )
    }

    if (reducedMotion()) {
      swap()
      return
    }

    const layer = layerRef.current
    if (!layer) {
      swap()
      return
    }

    enterAnim.current?.cancel()
    exitAnim.current?.cancel()
    exitAnim.current = animate(layer, {
      opacity: [1, 0],
      translateY: [0, 10],
      duration: 90,
      ease: 'in(2)',
      onComplete: swap,
    })

    return () => {
      exitAnim.current?.cancel()
    }
  }, [location.pathname])

  return (
    <div className="relative">
      <span ref={sweepRef} className="page-sweep" aria-hidden="true" />
      <div ref={layerRef} className="page-view">
        {view}
      </div>
    </div>
  )
}
