import type { KnownAssetCode } from '../../lib/assets'
import { KNOWN_ASSETS } from '../../lib/assets'

export function AssetLogo({
  code,
  className = 'h-7 w-7',
  title,
}: {
  code: string
  className?: string
  title?: string
}) {
  const normalized = code.toUpperCase() === 'NATIVE' ? 'XLM' : code.toUpperCase()
  const label = title ?? normalized
  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${className}`}
      role="img"
      aria-label={label}
    >
      {normalized === 'USDC' ? (
        <UsdcMark />
      ) : normalized === 'EURC' ? (
        <EurcMark />
      ) : (
        <XlmMark />
      )}
    </span>
  )
}

export function AssetChips({
  value,
  onChange,
  tone = 'light',
}: {
  value: KnownAssetCode
  onChange: (code: KnownAssetCode) => void
  tone?: 'light' | 'dark'
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Elegir moneda">
      {KNOWN_ASSETS.map((asset) => {
        const selected = asset.code === value
        const palette =
          tone === 'dark'
            ? selected
              ? 'bg-yellow text-ink'
              : 'bg-white/10 text-white hover:bg-white/16'
            : selected
              ? 'bg-purple text-white'
              : 'border border-purple/20 bg-white/50 text-ink hover:border-purple/45 hover:bg-white/80'
        return (
          <button
            key={asset.code}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(asset.code)}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-base font-semibold transition ${palette}`}
          >
            <AssetLogo code={asset.code} className="h-5 w-5" title={asset.name} />
            {asset.code}
          </button>
        )
      })}
    </div>
  )
}

export function AcceptedAssets({
  tone = 'light',
}: {
  tone?: 'light' | 'dark'
}) {
  const muted = tone === 'dark' ? 'text-white/70' : 'text-muted'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {KNOWN_ASSETS.map((asset) => (
        <span key={asset.code} className="inline-flex items-center gap-2 text-sm font-semibold">
          <AssetLogo code={asset.code} className="h-6 w-6" title={asset.name} />
          <span>
            <span className="text-current">{asset.code}</span>
            <span className={`ml-1 font-normal ${muted}`}>{asset.name}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

function XlmMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#0A0A0A" />
      <path
        fill="#F5D000"
        d="M16 4.2 18.55 13.45 28 16 18.55 18.55 16 27.8 13.45 18.55 4 16 13.45 13.45Z"
      />
    </svg>
  )
}

function UsdcMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        fill="#fff"
        d="M16.75 7.6v1.55c2.05.22 3.4 1.28 3.7 3.05h-1.9c-.28-.92-1.05-1.48-2.4-1.48-1.4 0-2.32.66-2.32 1.68 0 .86.6 1.35 2.22 1.68l1.24.27c2.32.5 3.48 1.58 3.48 3.48 0 2.12-1.64 3.52-4.62 3.78V23.4h-1.7v-1.52c-2.28-.26-3.82-1.46-4.24-3.4h1.96c.38 1.12 1.32 1.78 2.76 1.78 1.62 0 2.6-.74 2.6-1.88 0-.92-.64-1.42-2.32-1.78l-1.24-.27c-2.18-.48-3.32-1.62-3.32-3.46 0-2 1.52-3.38 4.3-3.64V7.6h1.7z"
      />
    </svg>
  )
}

function EurcMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#1B4DCE" />
      <path
        fill="#fff"
        d="M22.05 10.85c-1-1.5-2.65-2.45-4.85-2.45-3.9 0-6.7 2.85-6.7 7.6s2.8 7.6 6.7 7.6c2.2 0 3.85-.95 4.85-2.45l-1.78-1.2c-.62.95-1.55 1.5-2.9 1.5-2.15 0-3.62-1.75-3.62-5.45s1.47-5.45 3.62-5.45c1.35 0 2.28.55 2.9 1.5l1.78-1.2z"
      />
      <path fill="#fff" d="M8.9 14.45h12.4v1.55H8.9zm.7 2.2h10.7v1.55H9.6z" />
    </svg>
  )
}
