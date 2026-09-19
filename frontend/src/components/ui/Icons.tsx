import type { ReactNode } from 'react'

type IconProps = {
  className?: string
}

function Svg({
  className = 'h-5 w-5',
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h14M13 6l7 6-7 6" {...stroke} />
    </Svg>
  )
}

export function IconReceive(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12H6M11 6l-7 6 7 6" {...stroke} />
    </Svg>
  )
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" {...stroke} />
      <path d="M3.5 19c.6-3 2.6-4.5 5.5-4.5S14.4 16 15 19" {...stroke} />
      <circle cx="17" cy="9" r="2.2" {...stroke} />
      <path d="M16 19c.4-2 1.6-3.2 3.6-3.5" {...stroke} />
    </Svg>
  )
}

export function IconFamily(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V10l8-6 8 6v10" {...stroke} />
      <path d="M10 20v-6h4v6" {...stroke} />
    </Svg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 8v5l3 2" {...stroke} />
    </Svg>
  )
}

export function IconKey(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="14" r="3.2" {...stroke} />
      <path d="M11 14h9l-2 2 2 2" {...stroke} />
    </Svg>
  )
}

export function IconPen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 19h4l10-10-4-4L5 15v4Z" {...stroke} />
      <path d="M13 7l4 4" {...stroke} />
    </Svg>
  )
}

export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3 6 14h6l-1 7 8-12h-6l1-6Z" {...stroke} />
    </Svg>
  )
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" {...stroke} />
    </Svg>
  )
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 6H6v12h12v-4" {...stroke} />
      <path d="M14 4h6v6M20 4l-8 8" {...stroke} />
    </Svg>
  )
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5z" {...stroke} />
      <path d="M14 14h2v2h-2zM18 14h1v5h-5v-1" {...stroke} />
    </Svg>
  )
}

export function IconWallet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16v12H4z" {...stroke} />
      <path d="M4 7V6a2 2 0 0 1 2-2h10" {...stroke} />
      <circle cx="16.5" cy="13" r="1" fill="currentColor" />
    </Svg>
  )
}

export function IconVault(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="7" width="16" height="13" rx="2" {...stroke} />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" {...stroke} />
      <circle cx="12" cy="14" r="2" {...stroke} />
    </Svg>
  )
}

export function IconActivity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 14h4l2-6 4 10 2-4h4" {...stroke} />
    </Svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </Svg>
  )
}
