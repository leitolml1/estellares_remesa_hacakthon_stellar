import { MeshGradient } from '@paper-design/shaders-react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

const colors = ['#efe8ff', '#9b86f5', '#6d4aff', '#d9cfff', '#f5d000']

export function AuroraSky() {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <div className="aurora-sky" aria-hidden="true">
      <MeshGradient
        className="aurora-mesh"
        width="100%"
        height="100%"
        colors={colors}
        distortion={0.86}
        swirl={0.38}
        grainMixer={0.16}
        grainOverlay={0.06}
        fit="cover"
        scale={1.12}
        speed={reducedMotion ? 0 : 0.38}
        frame={reducedMotion ? 48 : 0}
        minPixelRatio={1}
        maxPixelCount={1_600_000}
      />
      <div className="aurora-stars" />
      <div className="aurora-stars aurora-stars-b" />
      <span className="aurora-orb aurora-orb-a" />
      <span className="aurora-orb aurora-orb-b" />
      <span className="aurora-orb aurora-orb-c" />
      <div className="aurora-veil" />
    </div>
  )
}
