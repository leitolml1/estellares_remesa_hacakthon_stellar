import type {
  BlendPosition,
  CommunityPool,
  CreatePoolRequest,
  FamilyPoolRecord,
  PaginatedPayments,
  PaymentRecord,
  PoolDetail,
  PoolWithPaymentUri,
  VaultState,
  WalletPower,
} from '../types'
import { type ApiError } from '../types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class BackendError extends Error {
  readonly status: number

  constructor({ status, message }: ApiError) {
    super(message)
    this.name = 'BackendError'
    this.status = status
  }
}

function djangoMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const data = body as Record<string, unknown>
  if (typeof data.detail === 'string' && data.detail.length > 0) {
    return data.detail
  }
  const parts: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      parts.push(value.map(String).join(' · '))
    } else if (typeof value === 'string') {
      parts.push(key === 'detail' ? value : `${key}: ${value}`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

async function parseError(response: Response): Promise<BackendError> {
  let message = `Error ${response.status}`
  try {
    const body: unknown = await response.json()
    message = djangoMessage(body) ?? message
  } catch {
    const text = await response.text().catch(() => '')
    if (text) message = text
  }
  return new BackendError({ status: response.status, message })
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(20_000),
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

type DjangoPaymentRecord = {
  operation_id: string
  sender: string
  receiver: string
  amount: string
  asset_code: string
  asset_issuer?: string | null
  transaction_hash: string
  created_at: string
  note?: string | null
  category?: string | null
}

function mapPayment(record: DjangoPaymentRecord): PaymentRecord {
  return {
    id: record.operation_id,
    from: record.sender,
    to: record.receiver,
    amount: record.amount,
    assetCode: record.asset_code,
    assetIssuer: record.asset_issuer ?? undefined,
    memo: record.note ?? undefined,
    note: record.note ?? undefined,
    category: record.category ?? undefined,
    createdAt: record.created_at,
    transactionHash: record.transaction_hash,
  }
}

export function savePaymentMetadata(body: {
  tx_hash: string
  note?: string
  category?: string
}) {
  return request<unknown>('/api/payments/', {
    method: 'POST',
    body: JSON.stringify({
      tx_hash: body.tx_hash.toLowerCase(),
      note: body.note,
      category: body.category,
    }),
  })
}

export async function getPaymentHistory(
  publicKey: string,
  query: { limit?: number; cursor?: string } = {},
): Promise<PaginatedPayments> {
  const params = new URLSearchParams()
  if (query.limit) params.set('limit', String(query.limit))
  if (query.cursor) params.set('cursor', query.cursor)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const page = await request<{
    records: DjangoPaymentRecord[]
    next_cursor: string | null
  }>(`/api/payments/history/${publicKey}/${suffix}`)
  return {
    records: page.records.map(mapPayment),
    nextCursor: page.next_cursor,
  }
}

type DjangoPool = {
  id: number
  short_code: string
  wallet_address: string
  title: string
  goal_amount?: string | null
  creator: string
  vault_registered: boolean
  created_at: string
}

function mapPool(pool: DjangoPool) {
  return {
    id: String(pool.id),
    shortCode: pool.short_code,
    walletPublicKey: pool.wallet_address,
    title: pool.title,
    goalAmount: pool.goal_amount ?? undefined,
    creator: pool.creator,
    vaultRegistered: pool.vault_registered,
    createdAt: pool.created_at,
  }
}

export async function createCommunityPool(
  body: CreatePoolRequest,
): Promise<PoolWithPaymentUri> {
  const created = await request<{ pool: DjangoPool; payment_uri: string }>(
    '/api/pools/',
    {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: body.walletPublicKey,
        title: body.title,
        goal_amount: body.goalAmount || null,
        creator: body.creator,
      }),
    },
  )
  return {
    pool: mapPool(created.pool),
    paymentUri: created.payment_uri,
  }
}

export async function listMyCommunityPools(publicKey: string): Promise<CommunityPool[]> {
  const params = new URLSearchParams({ public_key: publicKey })
  const payload = await request<{ pools: DjangoPool[] }>(`/api/pools/?${params.toString()}`)
  return payload.pools.map(mapPool)
}

export async function getCommunityPool(
  shortCode: string,
  query: { amount?: string; publicKey?: string } = {},
): Promise<PoolDetail> {
  const params = new URLSearchParams()
  if (query.publicKey) params.set('public_key', query.publicKey)
  if (query.amount) params.set('amount', query.amount)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const detail = await request<{
    pool: DjangoPool
    progress: {
      donation_count: number
      total_by_asset: {
        asset_code: string
        asset_issuer: string | null
        total: string
      }[]
      xlm_equivalent_total: string | null
      completed: boolean
    }
    payment_uri: string
  }>(`/api/pools/${shortCode}/${suffix}`)
  return {
    pool: mapPool(detail.pool),
    paymentUri: detail.payment_uri,
    progress: {
      donationCount: detail.progress.donation_count,
      totalByAsset: detail.progress.total_by_asset.map((item) => ({
        assetCode: item.asset_code,
        assetIssuer: item.asset_issuer,
        total: item.total,
      })),
      xlmEquivalentTotal: detail.progress.xlm_equivalent_total ?? null,
      completed: detail.progress.completed,
    },
  }
}

export async function getPoolDonations(
  shortCode: string,
  limit = 20,
): Promise<PaymentRecord[]> {
  const payload = await request<{ records: DjangoPaymentRecord[] }>(
    `/api/pools/${shortCode}/donations/?limit=${limit}`,
  )
  return payload.records.map(mapPayment)
}

export function buildVaultRegister(shortCode: string, ownerPublicKey: string) {
  return request<{ xdr: string }>(
    `/api/pools/${shortCode}/vault/register-build/`,
    { method: 'POST', body: JSON.stringify({ owner_public_key: ownerPublicKey }) },
  )
}

export function buildVaultDeposit(
  shortCode: string,
  body: { donor_public_key: string; asset_code: string; amount: string },
) {
  return request<{ xdr: string }>(
    `/api/pools/${shortCode}/vault/deposit-build/`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function buildVaultWithdraw(
  shortCode: string,
  body: {
    owner_public_key: string
    asset_code: string
    destination_public_key: string
    amount: string
  },
) {
  return request<{ xdr: string }>(
    `/api/pools/${shortCode}/vault/withdraw-build/`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function submitVaultTx(shortCode: string, signedXdr: string) {
  return request<{ hash: string }>(
    `/api/pools/${shortCode}/vault/submit/`,
    { method: 'POST', body: JSON.stringify({ signed_xdr: signedXdr }) },
  )
}

export async function getVaultState(shortCode: string): Promise<VaultState> {
  const state = await request<{
    registered: boolean
    owner?: string
    goal?: string
    initial_equivalent?: string
    equivalent_total?: string
    complete?: boolean
    assets?: {
      asset_code: string
      sac: string
      donated: string
      withdrawn: string
      available: string
    }[]
  }>(`/api/pools/${shortCode}/vault/state/`)
  return {
    registered: state.registered,
    owner: state.owner,
    goal: state.goal,
    initialEquivalent: state.initial_equivalent,
    equivalentTotal: state.equivalent_total,
    complete: state.complete,
    assets: (state.assets ?? []).map((item) => ({
      assetCode: item.asset_code,
      sac: item.sac,
      donated: item.donated,
      withdrawn: item.withdrawn,
      available: item.available,
    })),
  }
}

type DjangoFamilyPool = {
  id: number
  pool_account: string
  title: string
  creator: string
  signers: { public_key: string; weight: number }[]
  depositors?: string[]
  wallet_roles?: Record<string, string>
  med_threshold: number
  high_threshold: number
  withdrawal_limit: string
  asset_withdrawal_limits?: Record<string, string> | null
  created_at: string
}

function mapWalletPower(role?: string): WalletPower {
  const normalized = (role ?? '').replace(/_/g, '-')
  if (normalized === 'deposit') return 'deposit'
  if (normalized === 'withdraw') return 'withdraw'
  return 'deposit-withdraw'
}

export function mapFamilyPool(pool: DjangoFamilyPool): FamilyPoolRecord {
  const walletRoles: Record<string, WalletPower> = {}
  for (const [key, role] of Object.entries(pool.wallet_roles ?? {})) {
    walletRoles[key] = mapWalletPower(role)
  }
  return {
    id: String(pool.id),
    poolAccount: pool.pool_account,
    title: pool.title,
    creator: pool.creator,
    signers: pool.signers.map((signer) => ({
      publicKey: signer.public_key,
      weight: signer.weight,
    })),
    depositors: pool.depositors ?? [],
    walletRoles,
    medThreshold: pool.med_threshold,
    highThreshold: pool.high_threshold,
    withdrawalLimit: pool.withdrawal_limit,
    assetWithdrawalLimits: pool.asset_withdrawal_limits ?? undefined,
    createdAt: pool.created_at,
  }
}

export function buildFamilyCreateAccount(body: {
  creator_public_key: string
  pool_public_key: string
  signers: { public_key: string; weight: number }[]
  med_threshold: number
  extra_starting_balance?: string
}) {
  return request<{ xdr: string; starting_balance: string }>(
    '/api/family-pools/build-create-account/',
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function buildFamilyConfigureSigners(body: {
  pool_public_key: string
  signers: { public_key: string; weight: number }[]
  med_threshold: number
}) {
  return request<{ xdr: string }>('/api/family-pools/build-configure-signers/', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function confirmFamilyPool(body: {
  pool_public_key: string
  title: string
  creator_public_key: string
  withdrawal_limit: string
  asset_withdrawal_limits?: Partial<Record<'USDC' | 'EURC', string>>
  depositors?: string[]
  wallet_roles?: Record<string, string>
}): Promise<FamilyPoolRecord> {
  const pool = await request<DjangoFamilyPool>('/api/family-pools/confirm/', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return mapFamilyPool(pool)
}

export function saveFamilyDeposit(
  poolAccount: string,
  body: { tx_hash: string; note?: string },
) {
  return request(`/api/family-pools/${poolAccount}/deposits/`, {
    method: 'POST',
    body: JSON.stringify({
      tx_hash: body.tx_hash.toLowerCase(),
      note: body.note,
    }),
  })
}

export async function listMyFamilyPools(publicKey: string): Promise<FamilyPoolRecord[]> {
  const params = new URLSearchParams({ public_key: publicKey })
  const payload = await request<{ pools: DjangoFamilyPool[] }>(
    `/api/family-pools/?${params.toString()}`,
  )
  return payload.pools.map(mapFamilyPool)
}

export function buildFamilyWithdrawal(
  poolAccount: string,
  body: {
    destination_public_key: string
    amount: string
    memo?: string
    asset_code?: string
    requester_public_key: string
  },
) {
  return request<{ xdr: string }>(
    `/api/family-pools/${poolAccount}/withdrawals/build/`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function submitFamilyWithdrawal(
  poolAccount: string,
  signedXdr: string,
  requesterPublicKey: string,
) {
  return request<{ hash: string; ledger: number }>(
    `/api/family-pools/${poolAccount}/withdrawals/submit/`,
    {
      method: 'POST',
      body: JSON.stringify({
        signed_xdr: signedXdr,
        requester_public_key: requesterPublicKey,
      }),
    },
  )
}

export function buildFamilyTrustline(
  poolAccount: string,
  body: { asset_code: string; requester_public_key: string },
) {
  return request<{ xdr: string }>(
    `/api/family-pools/${poolAccount}/trustlines/build/`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function submitFamilyTrustline(
  poolAccount: string,
  signedXdr: string,
  requesterPublicKey: string,
) {
  return request<{ hash: string; ledger: number }>(
    `/api/family-pools/${poolAccount}/trustlines/submit/`,
    {
      method: 'POST',
      body: JSON.stringify({
        signed_xdr: signedXdr,
        requester_public_key: requesterPublicKey,
      }),
    },
  )
}

export function buildFamilyAddSigner(
  poolAccount: string,
  body: {
    signer_public_key: string
    weight: number
    requester_public_key: string
    role?: string
  },
) {
  return request<{ xdr: string }>(
    `/api/family-pools/${poolAccount}/signers/build/`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export async function submitFamilyAddSigner(
  poolAccount: string,
  signedXdr: string,
  requesterPublicKey: string,
  role?: string,
): Promise<{ hash: string; ledger: number; pool: FamilyPoolRecord; resynced: boolean }> {
  const result = await request<{
    hash: string
    ledger: number
    pool: DjangoFamilyPool
    resynced: boolean
  }>(`/api/family-pools/${poolAccount}/signers/submit/`, {
    method: 'POST',
    body: JSON.stringify({
      signed_xdr: signedXdr,
      requester_public_key: requesterPublicKey,
      role,
    }),
  })
  return { ...result, pool: mapFamilyPool(result.pool) }
}

export async function addFamilyDepositor(
  poolAccount: string,
  body: { public_key: string; requester_public_key: string },
): Promise<FamilyPoolRecord> {
  const pool = await request<DjangoFamilyPool>(
    `/api/family-pools/${poolAccount}/depositors/`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return mapFamilyPool(pool)
}

export function buildBlendSupply(poolAccount: string, amount: string, requesterPublicKey: string) {
  return request<{ xdr: string }>(
    `/api/family-pools/${poolAccount}/blend/supply/build/`,
    {
      method: 'POST',
      body: JSON.stringify({ amount, requester_public_key: requesterPublicKey }),
    },
  )
}

export function buildBlendWithdraw(poolAccount: string, amount: string, requesterPublicKey: string) {
  return request<{ xdr: string }>(
    `/api/family-pools/${poolAccount}/blend/withdraw/build/`,
    {
      method: 'POST',
      body: JSON.stringify({ amount, requester_public_key: requesterPublicKey }),
    },
  )
}

export function submitBlendTx(poolAccount: string, signedXdr: string, requesterPublicKey: string) {
  return request<{ hash?: string }>(
    `/api/family-pools/${poolAccount}/blend/submit/`,
    {
      method: 'POST',
      body: JSON.stringify({
        signed_xdr: signedXdr,
        requester_public_key: requesterPublicKey,
      }),
    },
  )
}

export async function getBlendPosition(
  poolAccount: string,
  publicKey: string,
): Promise<BlendPosition> {
  const params = new URLSearchParams({ public_key: publicKey })
  const position = await request<{
    capital: string
    interest_earned: string
    current_value: string
    b_tokens: string
    b_rate: string
  }>(`/api/family-pools/${poolAccount}/blend/position/?${params.toString()}`)
  return {
    capital: position.capital,
    interestEarned: position.interest_earned,
    currentValue: position.current_value,
    bTokens: position.b_tokens,
    bRate: position.b_rate,
  }
}

export function isMissingSignaturesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    message.includes('faltan firmas') ||
    message.includes('medthreshold') ||
    message.includes('highthreshold') ||
    message.includes('umbral requerido') ||
    message.includes('peso combinado')
  )
}

export function humanizeApiError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'El backend Django no responde. Levantalo en :8000 e intentá de nuevo.'
  }
  if (error instanceof TypeError) {
    return 'No pudimos hablar con Django. ¿Está corriendo en localhost:8000?'
  }
  if (error instanceof BackendError) {
    if (error.status === 403) return error.message
    if (error.status === 404) return error.message
    if (error.status === 409) return error.message
    if (error.status === 422) return error.message
    if (error.status >= 500) {
      return 'Django o Horizon no responden. Levantá Django en :8000 e intentá de nuevo.'
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Pasó un error inesperado.'
}
