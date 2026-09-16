import type { ReactNode } from 'react'
import { usePageMotion } from '../../hooks/usePageMotion'
import { useUnfoldDown } from '../../hooks/useUnfoldDown'
import { StageAtmosphere } from './StageAtmosphere'

export function PageStage({
  kicker,
  title,
  subtitle,
  lead,
  wide,
  layout = 'default',
  className = '',
  children,
}: {
  kicker: string
  title: string
  subtitle?: string
  lead?: ReactNode
  wide?: ReactNode
  layout?: 'default' | 'stack' | 'pools' | 'dashboard'
  className?: string
  children: ReactNode
}) {
  const root = usePageMotion(title)
  const cards = useUnfoldDown(title)
  const poolsLayout = layout === 'pools' || layout === 'stack'
  const dashboardLayout = layout === 'dashboard'

  return (
    <section
      ref={root}
      className={[
        'page-stage',
        poolsLayout ? 'page-stage-pools' : '',
        dashboardLayout ? 'page-stage-dashboard' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <StageAtmosphere />
      <span className="anim-doodle page-stage-doodle page-stage-doodle-plus" aria-hidden="true">
        +
      </span>
      <span className="anim-float page-stage-doodle page-stage-doodle-star" aria-hidden="true">
        ✳
      </span>
      <span className="page-stage-doodle page-stage-doodle-orbit" aria-hidden="true" />

      <div
        ref={cards}
        className={[
          'page-stage-inner',
          lead ? 'has-lead' : '',
          wide ? 'has-wide' : '',
          poolsLayout ? 'is-pools' : '',
          dashboardLayout ? 'is-dashboard' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <header className="page-stage-head">
          <p className="anim-enter page-stage-kicker">{kicker}</p>
          <h1 className="anim-enter page-stage-title">{title}</h1>
          {subtitle ? (
            <p className="anim-enter page-stage-subtitle">{subtitle}</p>
          ) : null}
          {lead ? <div className="page-stage-lead">{lead}</div> : null}
        </header>
        <div className="page-stage-body">{children}</div>
        {wide ? <div className="page-stage-wide">{wide}</div> : null}
      </div>
    </section>
  )
}

export function FormPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`form-panel unfold-down ${className}`}>{children}</div>
}

export function DarkPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`form-aside unfold-down ${className}`}>{children}</div>
}
