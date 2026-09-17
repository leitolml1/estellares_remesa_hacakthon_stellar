import type { AssetBalance, PaymentAsset } from '../types'

export type KnownAssetCode = 'XLM' | 'USDC' | 'EURC'

export type KnownAsset = {
  code: KnownAssetCode
  name: string
  issuer?: string
}

export const USDC_TESTNET_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
export const EURC_TESTNET_ISSUER =
  'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO'

export const KNOWN_ASSETS: KnownAsset[] = [
  { code: 'XLM', name: 'Stellar' },
  { code: 'USDC', name: 'USD Coin', issuer: USDC_TESTNET_ISSUER },
  { code: 'EURC', name: 'Euro Coin', issuer: EURC_TESTNET_ISSUER },
]

const BY_CODE = Object.fromEntries(
  KNOWN_ASSETS.map((asset) => [asset.code, asset]),
) as Record<KnownAssetCode, KnownAsset>

export function getKnownAsset(code: string): KnownAsset | undefined {
  const normalized = code.trim().toUpperCase()
  if (normalized === 'NATIVE') return BY_CODE.XLM
  return BY_CODE[normalized as KnownAssetCode]
}

export function toPaymentAsset(asset: KnownAsset): PaymentAsset {
  if (!asset.issuer) return { code: 'XLM' }
  return { code: asset.code, issuer: asset.issuer }
}

export function isKnownAssetCode(value: string): value is KnownAssetCode {
  return value === 'XLM' || value === 'USDC' || value === 'EURC'
}

export function matchKnownAsset(
  code?: string,
  issuer?: string | null,
  type?: string,
): KnownAsset | undefined {
  if (type === 'native' || !code || code === 'native' || code.toUpperCase() === 'XLM') {
    return BY_CODE.XLM
  }
  const known = getKnownAsset(code)
  if (!known?.issuer) return known
  if (!issuer || issuer === known.issuer) return known
  return undefined
}

export function displayAssetCode(code?: string, type?: string): string {
  return matchKnownAsset(code, undefined, type)?.code ?? (code && code !== 'native' ? code : 'XLM')
}

export function accountHasAsset(
  balances: AssetBalance[] | undefined,
  asset: KnownAsset,
): boolean {
  if (!asset.issuer) {
    return Boolean(
      balances?.some(
        (item) => item.assetType === 'native' || item.assetCode === 'XLM',
      ),
    )
  }
  return Boolean(
    balances?.some(
      (item) => item.assetCode === asset.code && item.assetIssuer === asset.issuer,
    ),
  )
}

export function knownAssetBalance(
  balances: AssetBalance[] | undefined,
  asset: KnownAsset,
): string | null {
  if (!accountHasAsset(balances, asset)) return null
  if (!asset.issuer) {
    return (
      balances?.find((item) => item.assetType === 'native' || item.assetCode === 'XLM')
        ?.balance ?? '0'
    )
  }
  return (
    balances?.find(
      (item) => item.assetCode === asset.code && item.assetIssuer === asset.issuer,
    )?.balance ?? '0'
  )
}

// Equivalencias referenciales asset -> XLM, espejo de las tasas que usa
// el backend (stellar_common/assets.py) y el vault Soroban (constructor).
// Sirven para agregaciones client-side, ej. el leaderboard de pools clasicos.
export const XLM_REFERENCE_RATES: Partial<Record<KnownAssetCode, number>> = {
  USDC: 10,
  EURC: 11,
}

export function xlmEquivalent(amount: string, code: string): number {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed)) return 0
  const rate = code === 'XLM' ? 1 : XLM_REFERENCE_RATES[code as KnownAssetCode]
  return rate ? parsed * rate : 0
}

export function buildPayUri(input: {
  destination: string
  memo?: string
  amount?: string
  asset?: KnownAsset
}): string {
  const params = new URLSearchParams({ destination: input.destination })
  if (input.memo) {
    params.set('memo', input.memo)
    params.set('memo_type', 'MEMO_TEXT')
  }
  if (input.amount) params.set('amount', input.amount)
  if (input.asset?.issuer) {
    params.set('asset_code', input.asset.code)
    params.set('asset_issuer', input.asset.issuer)
  }
  return `web+stellar:pay?${params.toString()}`
}
