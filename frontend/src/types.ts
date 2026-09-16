export type PaymentAsset = {
  code: string
  issuer?: string
}

export type PaymentRecord = {
  id: string
  from: string
  to: string
  amount: string
  assetCode: string
  assetIssuer?: string
  memo?: string
  note?: string
  category?: string
  createdAt: string
  transactionHash: string
}

export type PaginatedPayments = {
  records: PaymentRecord[]
  nextCursor: string | null
}

export type AssetBalance = {
  assetType: string
  assetCode?: string
  assetIssuer?: string
  balance: string
  limit?: string
  liquidityPoolId?: string
}

export type AccountBalance = {
  publicKey: string
  balances: AssetBalance[]
}

export type CommunityPool = {
  id: string
  shortCode: string
  walletPublicKey: string
  title: string
  goalAmount?: string
  creator: string
  vaultRegistered: boolean
  createdAt: string
}

export type PoolProgress = {
  donationCount: number
  totalByAsset: {
    assetCode: string
    assetIssuer: string | null
    total: string
  }[]
  xlmEquivalentTotal: string | null
  completed: boolean
}

export type PoolWithPaymentUri = {
  pool: CommunityPool
  paymentUri: string
}

export type PoolDetail = PoolWithPaymentUri & {
  progress: PoolProgress
}

export type VaultAssetState = {
  assetCode: string
  sac: string
  donated: string
  withdrawn: string
  available: string
}

export type VaultState = {
  registered: boolean
  owner?: string
  goal?: string
  initialEquivalent?: string
  equivalentTotal?: string
  complete?: boolean
  assets: VaultAssetState[]
}

export type CreatePoolRequest = {
  walletPublicKey: string
  title: string
  goalAmount?: string
  creator: string
}

export type ApiError = {
  status: number
  message: string
}

export type SavedPool = {
  id: string
  shortCode: string
  title: string
  createdAt: string
}

export type WalletPower = 'deposit-withdraw' | 'deposit' | 'withdraw'

export type FamilySigner = {
  publicKey: string
  weight: number
}

export type FamilyPoolRecord = {
  id: string
  poolAccount: string
  title: string
  creator: string
  signers: FamilySigner[]
  depositors: string[]
  walletRoles: Record<string, WalletPower>
  medThreshold: number
  highThreshold: number
  withdrawalLimit: string
  assetWithdrawalLimits?: Partial<Record<'USDC' | 'EURC', string>>
  createdAt: string
}

export type BlendPosition = {
  capital: string
  interestEarned: string
  currentValue: string
  bTokens: string
  bRate: string
}

export type PendingFamilyTx = {
  poolAccount: string
  kind: 'withdraw' | 'blend-supply' | 'blend-withdraw' | 'trustline' | 'add-signer'
  xdr: string
  signedBy: string[]
  amount?: string
  destination?: string
  asset?: string
  role?: WalletPower
}

export type TrustScoreBreakdown = {
  frequency: number
  volume: number
  pools: number
  seniority: number
}
