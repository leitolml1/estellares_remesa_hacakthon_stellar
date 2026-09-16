import type { PaymentRecord, TrustScoreBreakdown } from '../types'

function clamp(value: number, max: number): number {
  return Math.min(100, Math.round((value / max) * 100))
}

export function computeTrustScore(
  records: PaymentRecord[],
  poolCount: number,
): { score: number; breakdown: TrustScoreBreakdown } {
  const now = Date.now()
  const thirtyDays = 1000 * 60 * 60 * 24 * 30
  const recent = records.filter(
    (record) => now - new Date(record.createdAt).getTime() <= thirtyDays,
  )
  const volume = records.reduce((total, record) => {
    const amount = Number(record.amount)
    return total + (Number.isFinite(amount) ? amount : 0)
  }, 0)
  const oldest = records
    .map((record) => new Date(record.createdAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b)[0]
  const ageDays = oldest ? (now - oldest) / (1000 * 60 * 60 * 24) : 0

  const breakdown: TrustScoreBreakdown = {
    frequency: clamp(recent.length, 12),
    volume: clamp(volume, 500),
    pools: clamp(poolCount, 4),
    seniority: clamp(ageDays, 90),
  }

  const score = Math.round(
    breakdown.frequency * 0.3 +
      breakdown.volume * 0.3 +
      breakdown.pools * 0.2 +
      breakdown.seniority * 0.2,
  )

  return { score, breakdown }
}
