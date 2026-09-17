export const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
export const STELLAR_PUBKEY_REGEX = /^G[A-Z2-7]{55}$/
export const STELLAR_AMOUNT_REGEX = /^\d+(\.\d{1,7})?$/

export function isStellarPublicKey(value: string): boolean {
  return STELLAR_PUBKEY_REGEX.test(value.trim())
}

export function isStellarAmount(value: string): boolean {
  return STELLAR_AMOUNT_REGEX.test(value.trim()) && Number(value) > 0
}

export function truncateKey(value: string, edge = 4): string {
  if (value.length <= edge * 2 + 1) return value
  return `${value.slice(0, edge)}…${value.slice(-edge)}`
}

export function formatAssetAmount(
  value: string | number,
  asset = '',
  digits = 4,
): string {
  const amount = Number(value)
  const suffix = asset.trim()
  if (!Number.isFinite(amount)) {
    return suffix ? `${value} ${suffix}` : String(value)
  }
  const formatted = amount.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
  return suffix ? `${formatted} ${suffix}` : formatted
}

export function formatAmount(value: string, asset = 'XLM'): string {
  return formatAssetAmount(value, asset, 4)
}

export function fullAmountTitle(value: string | number, asset = 'XLM'): string {
  const amount = Number(value)
  const suffix = asset.trim()
  if (!Number.isFinite(amount)) {
    return suffix ? `${value} ${suffix}` : String(value)
  }
  const formatted = amount.toLocaleString('es-AR', {
    maximumFractionDigits: 7,
  })
  return suffix ? `${formatted} ${suffix}` : formatted
}

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`
}

export function explorerAccountUrl(publicKey: string): string {
  return `https://stellar.expert/explorer/testnet/account/${publicKey}`
}

export function assetLabel(code?: string, type?: string): string {
  if (type === 'native' || !code || code === 'native') return 'XLM'
  return code
}

export function receiveUri(publicKey: string): string {
  return `web+stellar:pay?${new URLSearchParams({ destination: publicKey }).toString()}`
}

export function sumAmounts(values: string[]): number {
  return values.reduce((total, value) => {
    const parsed = Number(value)
    return total + (Number.isFinite(parsed) ? parsed : 0)
  }, 0)
}
