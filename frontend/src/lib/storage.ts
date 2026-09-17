import type { FamilyPoolRecord, PendingFamilyTx, SavedPool } from '../types'

const POOLS_KEY = 'remesa.savedPools.v1'
const FAMILY_KEY = 'remesa.familyPools.v2'
const PENDING_KEY = 'remesa.familyPendingTx.v1'

const LABELS_KEY = 'remesa.familyLabels.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function getSavedPools(): SavedPool[] {
  return readJson<SavedPool[]>(POOLS_KEY, [])
}

export function savePool(pool: SavedPool): void {
  const current = getSavedPools().filter((item) => item.id !== pool.id)
  localStorage.setItem(POOLS_KEY, JSON.stringify([pool, ...current]))
}

export function getSavedFamilyPools(): FamilyPoolRecord[] {
  return readJson<FamilyPoolRecord[]>(FAMILY_KEY, [])
}

export function saveFamilyPool(pool: FamilyPoolRecord): void {
  const current = getSavedFamilyPools().filter(
    (item) => item.poolAccount !== pool.poolAccount,
  )
  localStorage.setItem(FAMILY_KEY, JSON.stringify([pool, ...current]))
}

export function getPendingFamilyTx(): PendingFamilyTx | null {
  return readJson<PendingFamilyTx | null>(PENDING_KEY, null)
}

export function savePendingFamilyTx(tx: PendingFamilyTx | null): void {
  if (!tx) {
    localStorage.removeItem(PENDING_KEY)
    return
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(tx))
}

export function getFamilyLabels(poolAccount: string): Record<string, string> {
  const all = readJson<Record<string, Record<string, string>>>(LABELS_KEY, {})
  return all[poolAccount] ?? {}
}

export function setFamilyLabel(poolAccount: string, publicKey: string, name: string): void {
  const all = readJson<Record<string, Record<string, string>>>(LABELS_KEY, {})
  const next = { ...(all[poolAccount] ?? {}) }
  if (name.trim()) next[publicKey] = name.trim()
  else delete next[publicKey]
  all[poolAccount] = next
  localStorage.setItem(LABELS_KEY, JSON.stringify(all))
}
