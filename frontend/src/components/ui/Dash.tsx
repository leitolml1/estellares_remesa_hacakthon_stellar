import type { ReactNode } from 'react'

export function DashBoard({ children }: { children: ReactNode }) {
  return <div className="dash-board unfold-down">{children}</div>
}

export function DashCol({
  children,
  feed = false,
}: {
  children: ReactNode
  feed?: boolean
}) {
  return <div className={`dash-col ${feed ? 'dash-col-feed' : ''}`}>{children}</div>
}

export function DashHero({
  kicker,
  value,
  fiat,
  extraLabel,
  extra,
  action,
  remain,
  percent,
  progress,
  valueTitle,
  compact = false,
}: {
  kicker: string
  value: string
  fiat?: string
  extraLabel?: string
  extra?: ReactNode
  action?: ReactNode
  remain?: string
  percent?: string
  progress?: number
  valueTitle?: string
  compact?: boolean
}) {
  const width =
    progress == null ? null : Math.max(0, Math.min(100, progress))
  return (
    <div className={`dash-hero ${compact ? 'is-compact' : ''}`}>
      <div className="dash-hero-head">
        <p className="dash-hero-kicker">{kicker}</p>
        {remain ? <p className="dash-hero-remain">{remain}</p> : null}
      </div>
      <div className="dash-hero-value-row">
        <p className="dash-hero-value" title={valueTitle}>
          {value}
        </p>
        {percent ? <p className="dash-hero-pct">{percent}</p> : null}
      </div>
      {fiat ? <p className="dash-hero-fiat">{fiat}</p> : null}
      {width != null ? (
        <div
          className="dash-hero-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(width)}
          aria-label="Progreso de la meta"
        >
          <span className="dash-hero-bar-fill" style={{ width: `${width}%` }} />
        </div>
      ) : null}
      {extra ? (
        <>
          {extraLabel ? <p className="dash-hero-extra">{extraLabel}</p> : null}
          <div className="dash-hero-assets">{extra}</div>
        </>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function DashCard({
  title,
  hint,
  icon,
  extra,
  lilac = false,
  children,
}: {
  title: string
  hint?: string
  icon?: ReactNode
  extra?: ReactNode
  lilac?: boolean
  children: ReactNode
}) {
  return (
    <section className={`dash-card${lilac ? ' is-lilac' : ''}`}>
      <div className="dash-card-head">
        <h2 className="dash-card-title">
          {icon ? <span className="dash-card-icon">{icon}</span> : null}
          {title}
        </h2>
        {extra}
      </div>
      {hint ? <p className="dash-card-hint">{hint}</p> : null}
      {children}
    </section>
  )
}

export function DashStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="dash-stat">
      <p className="dash-stat-label">{label}</p>
      <p className="dash-stat-value">{value}</p>
    </div>
  )
}

export function DashFeedItem({
  from,
  date,
  amount,
  code,
  href,
  fromLabel = 'Desde',
}: {
  from: string
  date?: string
  amount: string
  code?: string
  href?: string
  fromLabel?: string
}) {
  return (
    <div className="dash-feed-item">
      <div>
        <p className="dash-feed-from">{fromLabel}</p>
        <p className="dash-feed-key">{from}</p>
        {date ? <p className="dash-feed-date">{date}</p> : null}
      </div>
      <div className="dash-feed-amt">
        {code ? <p className="dash-feed-code">{code}</p> : null}
        <p className="dash-feed-value">{amount}</p>
        {href ? (
          <a className="dash-feed-link" href={href} target="_blank" rel="noreferrer">
            Ver tx
          </a>
        ) : null}
      </div>
    </div>
  )
}
