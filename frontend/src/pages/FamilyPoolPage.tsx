import { useEffect, useMemo, useState } from 'react'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AssetChips } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import {
  DashBoard,
  DashCard,
  DashCol,
  DashFeedItem,
  DashHero,
} from '../components/ui/Dash'
import { Field, TextInput } from '../components/ui/Field'
import { QrPanel } from '../components/ui/QrPanel'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import {
  BackendError,
  buildBlendSupply,
  buildBlendWithdraw,
  buildFamilyAddSigner,
  buildFamilyConfigureSigners,
  buildFamilyCreateAccount,
  buildFamilyTrustline,
  buildFamilyWithdrawal,
  confirmFamilyPool,
  getBlendPosition,
  humanizeApiError,
  isMissingSignaturesError,
  listMyFamilyPools,
  saveFamilyDeposit,
  getPaymentHistory,
  submitBlendTx,
  addFamilyDepositor,
  submitFamilyAddSigner,
  submitFamilyTrustline,
  submitFamilyWithdrawal,
} from '../lib/api'
import {
  buildPayUri,
  getKnownAsset,
  knownAssetBalance,
  toPaymentAsset,
  displayAssetCode,
  type KnownAssetCode,
} from '../lib/assets'
import {
  TESTNET_NETWORK_PASSPHRASE,
  explorerTxUrl,
  formatAmount,
  formatDate,
  isStellarAmount,
  isStellarPublicKey,
  truncateKey,
} from '../lib/format'
import {
  humanizeFreighterError,
  signTransactionWithFreighter,
} from '../lib/freighter'
import {
  buildPaymentXdr,
  generatePoolKeypair,
  getAccountBalance,
  nativeXlmBalance,
  signXdrWithSecret,
  submitSignedXdr,
} from '../lib/horizon'
import {
  getPendingFamilyTx,
  saveFamilyPool,
  savePendingFamilyTx,
} from '../lib/storage'
import type {
  AccountBalance,
  BlendPosition,
  FamilyPoolRecord,
  PaymentRecord,
  PendingFamilyTx,
  WalletPower,
} from '../types'

const WALLET_POWERS: { id: WalletPower; label: string }[] = [
  { id: 'deposit-withdraw', label: 'Depósito y retiro' },
  { id: 'deposit', label: 'Solo depósito' },
  { id: 'withdraw', label: 'Solo retiro' },
]

function walletPowerLabel(power: WalletPower) {
  return WALLET_POWERS.find((item) => item.id === power)?.label ?? 'Depósito y retiro'
}

function toApiRole(power: WalletPower) {
  return power.replaceAll('-', '_')
}

function memberPower(pool: FamilyPoolRecord, publicKey: string): WalletPower {
  if (pool.walletRoles[publicKey]) return pool.walletRoles[publicKey]
  if (pool.signers.some((signer) => signer.publicKey === publicKey)) {
    return 'deposit-withdraw'
  }
  return 'deposit'
}

export function FamilyPoolPage() {
  return (
    <PageStage
      className="family-pool-stage"
      layout="dashboard"
      kicker="Módulo 3"
      title="FAMILIA"
      subtitle="Caja multisig on-chain. Django arma el XDR; Freighter y la key efímera firman. La secret del pool nunca sale de este navegador."
    >
      <WalletGate
        title="Conectá para el pool familiar"
        description="Hace falta Freighter para fondear la caja y firmar depósitos o retiros."
      >
        <FamilyContent />
      </WalletGate>
    </PageStage>
  )
}

function FamilyContent() {
  const { publicKey, refreshBalances } = useWallet()
  const [pools, setPools] = useState<FamilyPoolRecord[]>([])
  const [activeAccount, setActiveAccount] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const pool = pools.find((item) => item.poolAccount === activeAccount) ?? null

  useEffect(() => {
    if (!publicKey) return
    const viewer = publicKey
    let cancelled = false
    async function load() {
      setLoading(true)
      setListError(null)
      try {
        const list = await listMyFamilyPools(viewer)
        if (cancelled) return
        for (const item of list) saveFamilyPool(item)
        setPools(list)
        setActiveAccount((current) => {
          if (current && list.some((item) => item.poolAccount === current)) return current
          return list[0]?.poolAccount ?? null
        })
        setCreating(list.length === 0)
      } catch (caught) {
        if (!cancelled) setListError(humanizeApiError(caught))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [publicKey])

  function remember(next: FamilyPoolRecord) {
    saveFamilyPool(next)
    setPools((current) => {
      const rest = current.filter((item) => item.poolAccount !== next.poolAccount)
      return [next, ...rest]
    })
    setActiveAccount(next.poolAccount)
    setCreating(false)
  }

  if (!publicKey) return null
  if (loading) return <Spinner label="Cargando tus cajas familiares…" />
  if (listError) return <Alert tone="error">{listError}</Alert>

  if (creating || !pool) {
    return (
      <CreateFamilyForm
        publicKey={publicKey}
        onCreated={remember}
        onCancel={pools.length > 0 ? () => setCreating(false) : undefined}
      />
    )
  }

  return (
    <FamilyDashboard
      publicKey={publicKey}
      pool={pool}
      pools={pools}
      onSelect={setActiveAccount}
      onCreateAnother={() => setCreating(true)}
      onRefreshWallet={() => void refreshBalances()}
      onPoolUpdated={remember}
    />
  )
}

function CreateFamilyForm({
  publicKey,
  onCreated,
  onCancel,
}: {
  publicKey: string
  onCreated: (pool: FamilyPoolRecord) => void
  onCancel?: () => void
}) {
  const [title, setTitle] = useState('Pozo de la casa')
  const [withdrawalLimit, setWithdrawalLimit] = useState('50')
  const [usdcLimit, setUsdcLimit] = useState('')
  const [eurcLimit, setEurcLimit] = useState('')
  const [extraBalance, setExtraBalance] = useState('')
  const [medThreshold, setMedThreshold] = useState('1')
  const [extraMembers, setExtraMembers] = useState<
    { publicKey: string; power: WalletPower }[]
  >([])
  const [memberKey, setMemberKey] = useState('')
  const [memberPowerChoice, setMemberPowerChoice] =
    useState<WalletPower>('deposit-withdraw')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reveal = useUnfoldDown('family-create')

  const members = useMemo(() => {
    const base = [{ publicKey, power: 'deposit-withdraw' as const }]
    return [...base, ...extraMembers]
  }, [extraMembers, publicKey])

  function addMember() {
    if (!isStellarPublicKey(memberKey)) {
      setError('La wallet tiene que ser una public key G…')
      return
    }
    if (members.some((item) => item.publicKey === memberKey.trim())) {
      setError('Esa wallet ya está en la lista.')
      return
    }
    setError(null)
    setExtraMembers((current) => [
      ...current,
      { publicKey: memberKey.trim(), power: memberPowerChoice },
    ])
    setMemberKey('')
    setMemberPowerChoice('deposit-withdraw')
  }

  async function createPool() {
    if (title.trim().length < 3) {
      setError('El nombre tiene que tener al menos 3 caracteres.')
      return
    }
    if (!isStellarAmount(withdrawalLimit)) {
      setError('El límite de retiro tiene que ser un monto válido.')
      return
    }
    for (const [code, value] of [
      ['USDC', usdcLimit],
      ['EURC', eurcLimit],
    ] as const) {
      if (value.trim() && !isStellarAmount(value)) {
        setError(`El tope de retiro de ${code} tiene que ser un monto válido, o quedar vacío.`)
        return
      }
    }
    if (extraBalance.trim() && extraBalance.trim() !== '0' && !isStellarAmount(extraBalance)) {
      setError('El saldo extra tiene que ser un monto válido, o quedar vacío.')
      return
    }
    const onchainSigners = members
      .filter((member) => member.power !== 'deposit')
      .map((member) => ({
        public_key: member.publicKey,
        weight: 1,
      }))
    const depositors = members
      .filter((member) => member.power === 'deposit')
      .map((member) => member.publicKey)
    const walletRoles = Object.fromEntries(
      members.map((member) => [member.publicKey, toApiRole(member.power)]),
    )
    const payload = onchainSigners
    const threshold = Number(medThreshold)
    const totalWeight = payload.reduce((sum, signer) => sum + signer.weight, 0)
    if (!Number.isInteger(threshold) || threshold < 1) {
      setError('El umbral medio tiene que ser un entero mayor a 0.')
      return
    }
    if (threshold > totalWeight) {
      setError('El umbral no puede superar la cantidad de wallets con retiro.')
      return
    }

    const keys = generatePoolKeypair()
    try {
      setError(null)
      setBusy('Armando CreateAccount…')
      let createXdr: string
      try {
        const created = await buildFamilyCreateAccount({
          creator_public_key: publicKey,
          pool_public_key: keys.publicKey,
          signers: payload,
          med_threshold: threshold,
          extra_starting_balance: extraBalance.trim() || '0',
        })
        createXdr = created.xdr
      } catch (caught) {
        if (caught instanceof BackendError && caught.status === 409) {
          throw new Error('Esa cuenta del pool ya existe. Recargá e intentá de nuevo.')
        }
        throw caught
      }

      setBusy('Firmá CreateAccount en Freighter…')
      const signedCreate = await signTransactionWithFreighter(
        createXdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      setBusy('Enviando CreateAccount a Horizon…')
      await submitSignedXdr(signedCreate.signedXdr)

      setBusy('Armando SetOptions…')
      const configure = await retryNotFound(() =>
        buildFamilyConfigureSigners({
          pool_public_key: keys.publicKey,
          signers: payload,
          med_threshold: threshold,
        }),
      )

      setBusy('Firmando con la key efímera del pool…')
      const signedConfig = signXdrWithSecret(configure.xdr, keys.secret)
      setBusy('Enviando SetOptions a Horizon…')
      await submitSignedXdr(signedConfig)

      setBusy('Confirmando la caja en Django…')
      const assetWithdrawalLimits: Partial<Record<'USDC' | 'EURC', string>> = {}
      if (usdcLimit.trim()) assetWithdrawalLimits.USDC = usdcLimit.trim()
      if (eurcLimit.trim()) assetWithdrawalLimits.EURC = eurcLimit.trim()
      const pool = await retryNotFound(() =>
        confirmFamilyPool({
          pool_public_key: keys.publicKey,
          title: title.trim(),
          creator_public_key: publicKey,
          withdrawal_limit: withdrawalLimit.trim(),
          asset_withdrawal_limits: assetWithdrawalLimits,
          depositors,
          wallet_roles: walletRoles,
        }),
      )
      onCreated(pool)
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={reveal}>
    <FormPanel className="mx-auto max-w-2xl md:mx-0">
      <h2 className="text-xl font-black tracking-tight sm:text-2xl">Crear pool familiar</h2>
      <p className="mt-1.5 text-sm leading-5 text-purple-deep/75">
        Se genera una cuenta nueva en este navegador. Django nunca ve la
        secret: solo arma los XDR y después lee el ledger.
      </p>
      <div className="mt-3.5 space-y-2.5">
        <Field label="Nombre">
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Field label="Límite de retiro (XLM)">
            <TextInput
              value={withdrawalLimit}
              onChange={(event) => setWithdrawalLimit(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Tope retiro USDC">
            <TextInput
              value={usdcLimit}
              onChange={(event) => setUsdcLimit(event.target.value)}
              placeholder="opcional · vacío = deshabilitado"
              inputMode="decimal"
            />
          </Field>
          <Field label="Tope retiro EURC">
            <TextInput
              value={eurcLimit}
              onChange={(event) => setEurcLimit(event.target.value)}
              placeholder="opcional · vacío = deshabilitado"
              inputMode="decimal"
            />
          </Field>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Field label="Umbral medio">
            <TextInput
              value={medThreshold}
              onChange={(event) => setMedThreshold(event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Saldo extra">
            <TextInput
              value={extraBalance}
              onChange={(event) => setExtraBalance(event.target.value)}
              placeholder="0 · opcional"
              inputMode="decimal"
            />
          </Field>
        </div>
        <p className="form-hint">
          Umbral: cuántas wallets con retiro tienen que firmar para sacar
          fondos. El saldo extra se suma al mínimo que pide Stellar. Sin tope
          propio, un asset no se puede retirar (nunca se reusa el tope de XLM).
        </p>
        <div className="family-signers">
          <p className="form-label">Wallets</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {members.map((member) => (
              <li key={member.publicKey} className="flex justify-between gap-3">
                <span className="font-mono text-xs">
                  {member.publicKey === publicKey ? 'Vos · ' : ''}
                  {truncateKey(member.publicKey, 5)}
                </span>
                <span className="text-muted">{walletPowerLabel(member.power)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-2">
            <Field label="Nueva wallet">
              <TextInput
                value={memberKey}
                onChange={(event) => setMemberKey(event.target.value)}
                placeholder="G..."
              />
            </Field>
            <Field label="Puede" hint="Elegí si aporta, retira, o las dos cosas.">
              <WalletPowerChips
                value={memberPowerChoice}
                onChange={setMemberPowerChoice}
              />
            </Field>
            <Button type="button" variant="ghost" onClick={addMember}>
              Agregar
            </Button>
          </div>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {busy ? <Spinner label={busy} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={Boolean(busy)} onClick={() => void createPool()}>
            Crear on-chain →
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>
    </FormPanel>
    </div>
  )
}

function FamilyDashboard({
  publicKey,
  pool,
  pools,
  onSelect,
  onCreateAnother,
  onRefreshWallet,
  onPoolUpdated,
}: {
  publicKey: string
  pool: FamilyPoolRecord
  pools: FamilyPoolRecord[]
  onSelect: (account: string) => void
  onCreateAnother: () => void
  onRefreshWallet: () => void
  onPoolUpdated: (pool: FamilyPoolRecord) => void
}) {
  const [poolAccount, setPoolAccount] = useState<AccountBalance | null>(null)
  const [blend, setBlend] = useState<BlendPosition | null>(null)
  const [assetCode, setAssetCode] = useState<KnownAssetCode>('XLM')
  const [newSignerKey, setNewSignerKey] = useState('')
  const [newSignerPower, setNewSignerPower] =
    useState<WalletPower>('deposit-withdraw')
  const [pending, setPending] = useState<PendingFamilyTx | null>(() => {
    const stored = getPendingFamilyTx()
    return stored?.poolAccount === pool.poolAccount ? stored : null
  })
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState(publicKey)
  const [note, setNote] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<PaymentRecord[]>([])
  const reveal = useUnfoldDown(pool.poolAccount)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const account = await getAccountBalance(pool.poolAccount)
        if (!cancelled) setPoolAccount(account)
      } catch {
        if (!cancelled) setPoolAccount(null)
      }
      try {
        const position = await getBlendPosition(pool.poolAccount, publicKey)
        if (!cancelled) setBlend(position)
      } catch {
        if (!cancelled) setBlend(null)
      }
      try {
        const history = await getPaymentHistory(pool.poolAccount, { limit: 20 })
        if (!cancelled) setIncoming(history.records)
      } catch {
        if (!cancelled) setIncoming([])
      }
    }
    void load()
    const stored = getPendingFamilyTx()
    setPending(stored?.poolAccount === pool.poolAccount ? stored : null)
    return () => {
      cancelled = true
    }
  }, [pool.poolAccount])

  async function refreshPoolMoney() {
    try {
      const account = await getAccountBalance(pool.poolAccount)
      setPoolAccount(account)
    } catch {
      setPoolAccount(null)
    }
    try {
      setBlend(await getBlendPosition(pool.poolAccount, publicKey))
    } catch {
      setBlend(null)
    }
    onRefreshWallet()
  }

  const selectedAsset = getKnownAsset(assetCode) ?? getKnownAsset('XLM')!
  const poolHasAsset = Boolean(knownAssetBalance(poolAccount?.balances, selectedAsset))
  const idleXlm = poolAccount ? nativeXlmBalance(poolAccount) : null
  const maxWithdrawal = selectedAsset.issuer
    ? pool.assetWithdrawalLimits?.[selectedAsset.code as 'USDC' | 'EURC'] ?? null
    : pool.withdrawalLimit

  async function deposit() {
    if (!canDeposit) {
      setError('Tu rol en esta caja no incluye depósitos.')
      return
    }
    if (!isStellarAmount(depositAmount)) {
      setError('Ingresá un monto válido.')
      return
    }
    if (selectedAsset.issuer && !poolHasAsset) {
      setError(`La caja todavía no acepta ${selectedAsset.code}. Primero abrí la trustline.`)
      return
    }
    try {
      setError(null)
      setOk(null)
      setBusy('Armando depósito…')
      const asset = toPaymentAsset(selectedAsset)
      const { xdr } = await buildPaymentXdr({
        sourcePublicKey: publicKey,
        destinationPublicKey: pool.poolAccount,
        sendAsset: asset,
        sendAmount: depositAmount.trim(),
        destAsset: asset,
        destMin: depositAmount.trim(),
        memo: depositNote.trim().slice(0, 28) || undefined,
      })
      setBusy('Firmá el depósito en Freighter…')
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      setBusy('Enviando a Horizon…')
      const result = await submitSignedXdr(signed.signedXdr)
      if (depositNote.trim()) {
        try {
          await saveFamilyDeposit(pool.poolAccount, {
            tx_hash: result.hash,
            note: depositNote.trim(),
          })
        } catch {
          // El depósito ya está on-chain.
        }
      }
      setOk(`Depósito confirmado. ${truncateKey(result.hash, 4)}`)
      setDepositAmount('')
      setDepositNote('')
      await refreshPoolMoney()
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function startSignedFlow(kind: PendingFamilyTx['kind']) {
    if (kind === 'trustline' || kind === 'add-signer') return
    if (!canWithdraw) {
      setError('Tu rol en esta caja no incluye retiros.')
      return
    }
    if (kind === 'withdraw' && !isStellarPublicKey(destination)) {
      setError('El destino del retiro tiene que ser una public key G…')
      return
    }
    if (!isStellarAmount(amount)) {
      setError('Ingresá un monto válido.')
      return
    }
    if (kind === 'withdraw' && selectedAsset.issuer && !poolHasAsset) {
      setError(`La caja no tiene trustline para ${selectedAsset.code}.`)
      return
    }
    if (kind === 'withdraw' && maxWithdrawal == null) {
      setError(
        `Los retiros en ${selectedAsset.code} no están habilitados: esta caja no tiene tope configurado para ese asset.`,
      )
      return
    }
    if (kind === 'withdraw' && Number(amount) > Number(maxWithdrawal)) {
      setError(`El monto supera el tope de retiro (${maxWithdrawal} ${selectedAsset.code}).`)
      return
    }
    if ((kind === 'blend-supply' || kind === 'blend-withdraw') && assetCode !== 'XLM') {
      setError('Blend en esta demo solo mueve XLM.')
      return
    }
    try {
      setError(null)
      setOk(null)
      setBusy('Armando la transacción…')
      let xdr: string
      if (kind === 'withdraw') {
        const built = await buildFamilyWithdrawal(pool.poolAccount, {
          destination_public_key: destination.trim(),
          amount: amount.trim(),
          memo: note.trim().slice(0, 28) || undefined,
          asset_code: selectedAsset.code,
          requester_public_key: publicKey,
        })
        xdr = built.xdr
      } else if (kind === 'blend-supply') {
        xdr = (await buildBlendSupply(pool.poolAccount, amount.trim(), publicKey)).xdr
      } else {
        xdr = (await buildBlendWithdraw(pool.poolAccount, amount.trim(), publicKey)).xdr
      }

      setBusy('Firmá con Freighter…')
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      const next: PendingFamilyTx = {
        poolAccount: pool.poolAccount,
        kind,
        xdr: signed.signedXdr,
        signedBy: [publicKey],
        amount: amount.trim(),
        destination: kind === 'withdraw' ? destination.trim() : undefined,
        asset: selectedAsset.code,
      }
      await submitOrKeep(next)
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function startTrustline() {
    if (!selectedAsset.issuer) {
      setError('XLM no necesita trustline.')
      return
    }
    try {
      setError(null)
      setOk(null)
      setBusy(`Armando trustline ${selectedAsset.code}…`)
      const built = await buildFamilyTrustline(pool.poolAccount, {
        asset_code: selectedAsset.code,
        requester_public_key: publicKey,
      })
      const signed = await signTransactionWithFreighter(
        built.xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      await submitOrKeep({
        poolAccount: pool.poolAccount,
        kind: 'trustline',
        xdr: signed.signedXdr,
        signedBy: [publicKey],
        asset: selectedAsset.code,
      })
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function startAddSigner() {
    if (!isStellarPublicKey(newSignerKey)) {
      setError('La wallet nueva tiene que ser una public key G…')
      return
    }
    const key = newSignerKey.trim()
    if (
      pool.signers.some((signer) => signer.publicKey === key) ||
      (pool.depositors ?? []).includes(key)
    ) {
      setError('Esa wallet ya está en esta caja.')
      return
    }
    try {
      setError(null)
      setOk(null)
      if (newSignerPower === 'deposit') {
        setBusy('Asociando wallet para depósito…')
        const updated = await addFamilyDepositor(pool.poolAccount, {
          public_key: key,
          requester_public_key: publicKey,
        })
        onPoolUpdated(updated)
        setNewSignerKey('')
        setNewSignerPower('deposit-withdraw')
        setOk('Wallet asociada: puede ver la caja y depositar.')
        return
      }
      setBusy('Armando alta de wallet…')
      const built = await buildFamilyAddSigner(pool.poolAccount, {
        signer_public_key: key,
        weight: 1,
        requester_public_key: publicKey,
        role: toApiRole(newSignerPower),
      })
      const signed = await signTransactionWithFreighter(
        built.xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      await submitOrKeep({
        poolAccount: pool.poolAccount,
        kind: 'add-signer',
        xdr: signed.signedXdr,
        signedBy: [publicKey],
        destination: key,
        role: newSignerPower,
      })
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function submitOrKeep(next: PendingFamilyTx) {
    setBusy('Enviando a Django / Horizon…')
    try {
      let hash: string | undefined
      if (next.kind === 'withdraw') {
        const result = await submitFamilyWithdrawal(next.poolAccount, next.xdr, publicKey)
        hash = result.hash
      } else if (next.kind === 'trustline') {
        const result = await submitFamilyTrustline(
          next.poolAccount,
          next.xdr,
          publicKey,
        )
        hash = result.hash
      } else if (next.kind === 'add-signer') {
        const result = await submitFamilyAddSigner(
          next.poolAccount,
          next.xdr,
          publicKey,
          next.role ? toApiRole(next.role) : undefined,
        )
        hash = result.hash
        onPoolUpdated(result.pool)
        setNewSignerKey('')
        setNewSignerPower('deposit-withdraw')
        if (!result.resynced) {
          setOk('Alta enviada, pero no pudimos releer la caja: refrescá en un momento.')
          savePendingFamilyTx(null)
          setPending(null)
          return
        }
      } else {
        const result = await submitBlendTx(next.poolAccount, next.xdr, publicKey)
        hash = result.hash
      }
      savePendingFamilyTx(null)
      setPending(null)
      if (next.kind !== 'trustline' && next.kind !== 'add-signer') {
        setAmount('')
        setNote('')
      }
      setOk(
        hash
          ? `Listo. Tx ${truncateKey(hash, 4)}`
          : 'La transacción se envió.',
      )
      await refreshPoolMoney()
    } catch (caught) {
      if (isMissingSignaturesError(caught)) {
        savePendingFamilyTx(next)
        setPending(next)
        setOk(
          next.kind === 'add-signer'
            ? 'Faltan firmas. Agregar una wallet pide el umbral alto: tiene que firmar toda la familia.'
            : 'Faltan firmas. Que otro familiar conecte Freighter y firme acá.',
        )
        return
      }
      throw caught
    }
  }

  async function addPendingSignature() {
    if (!pending) return
    try {
      setError(null)
      setBusy('Firmá con Freighter…')
      const signed = await signTransactionWithFreighter(
        pending.xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      const next: PendingFamilyTx = {
        ...pending,
        xdr: signed.signedXdr,
        signedBy: pending.signedBy.includes(publicKey)
          ? pending.signedBy
          : [...pending.signedBy, publicKey],
      }
      await submitOrKeep(next)
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  function discardPending() {
    savePendingFamilyTx(null)
    setPending(null)
  }

  const youAreSigner = pool.signers.some((signer) => signer.publicKey === publicKey)
  const youAreCreator = pool.creator === publicKey
  // Rol de la wallet conectada en esta caja: define qué ve en la UI. El
  // rol es a nivel app; on-chain la realidad es multisig (solo los
  // firmantes pueden mover fondos, y eso no cambia).
  const myPower = memberPower(pool, publicKey)
  const canDeposit = myPower === 'deposit' || myPower === 'deposit-withdraw'
  const canWithdraw = myPower === 'withdraw' || myPower === 'deposit-withdraw'
  const poolMembers = [
    ...pool.signers.map((signer) => ({
      publicKey: signer.publicKey,
      power: memberPower(pool, signer.publicKey),
    })),
    ...(pool.depositors ?? [])
      .filter((key) => !pool.signers.some((signer) => signer.publicKey === key))
      .map((publicKey) => ({ publicKey, power: 'deposit' as const })),
  ]

  return (
    <div ref={reveal} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {pools.map((item) => (
          <button
            key={item.poolAccount}
            type="button"
            onClick={() => onSelect(item.poolAccount)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              item.poolAccount === pool.poolAccount
                ? 'bg-yellow font-semibold text-ink'
                : 'bg-white/70 text-purple-deep'
            }`}
          >
            {item.title}
          </button>
        ))}
        <Button variant="white" onClick={onCreateAnother}>
          Nueva caja
        </Button>
      </div>

      {pending ? (
        <Alert tone="error">
          Hay un {pendingLabel(pending.kind)} esperando más firmas
          {pending.amount
            ? ` (${pending.amount} ${pending.asset ?? 'XLM'})`
            : pending.asset
              ? ` (${pending.asset})`
              : ''}
          . Ya firmaron {pending.signedBy.length} wallet(s).
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="purple"
              disabled={
                Boolean(busy) ||
                pending.signedBy.includes(publicKey) ||
                !youAreSigner
              }
              onClick={() => void addPendingSignature()}
            >
              Firmar con Freighter
            </Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={discardPending}>
              Descartar
            </Button>
          </div>
        </Alert>
      ) : null}

      <DashBoard>
        <DashCol>
          <DashHero
            kicker="Patrimonio de la caja"
            value={
              idleXlm != null
                ? formatAmount(String(Number(idleXlm) + Number(blend?.currentValue ?? 0)), 'XLM')
                : '—'
            }
            fiat={`tope de retiro ${formatAmount(pool.withdrawalLimit, 'XLM')}`}
            extraLabel="Tu rol"
            extra={<span className="dash-hero-chip">{walletPowerLabel(myPower)}</span>}
            action={
              canWithdraw ? (
                <Button disabled={Boolean(busy)} onClick={() => void startSignedFlow('withdraw')}>
                  Pedir retiro
                </Button>
              ) : canDeposit ? (
                <Button disabled={Boolean(busy)} onClick={() => void deposit()}>
                  Depositar
                </Button>
              ) : null
            }
          />
        </DashCol>
        <DashCol feed>
          <DashCard
            title="Movimientos"
            hint="Todo lo que llegó a la cuenta de la caja."
          >
            {incoming.length === 0 ? (
              <p className="dash-empty">Todavía no hay depósitos on-chain en esta caja.</p>
            ) : (
              <div className="dash-feed">
                {incoming.map((item) => (
                  <DashFeedItem
                    key={item.id}
                    from={truncateKey(item.from, 4)}
                    date={formatDate(item.createdAt)}
                    amount={formatAmount(item.amount, '')}
                    code={displayAssetCode(item.assetCode)}
                    href={explorerTxUrl(item.transactionHash)}
                  />
                ))}
              </div>
            )}
          </DashCard>
        </DashCol>
      </DashBoard>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="ok">{ok}</Alert> : null}
      {busy ? <Spinner label={busy} /> : null}

      <DashBoard>
        <DashCol>
          {canDeposit ? (
            <DashCard
              title="Aportar"
              hint="La caja acepta XLM, USDC y EURC. Compartí el QR para que depositen con cualquier wallet."
            >
              <div className="dash-qr-row">
                <div className="dash-qr-frame">
                  <QrPanel
                    value={buildPayUri({
                      destination: pool.poolAccount,
                      asset: selectedAsset,
                    })}
                    size={148}
                    framed={false}
                  />
                </div>
                <div className="dash-addr">
                  <p className="dash-addr-label">Address de la caja</p>
                  <p className="dash-addr-value">{truncateKey(pool.poolAccount, 6)}</p>
                  <div className="dash-copy">
                    <Button
                      variant="white"
                      onClick={() => void navigator.clipboard.writeText(pool.poolAccount)}
                    >
                      Copiar address
                    </Button>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <AssetChips value={assetCode} onChange={setAssetCode} tone="dark" />
              </div>
              {selectedAsset.issuer && !poolHasAsset ? (
                <div className="mt-4">
                  <Alert tone="error">
                    La caja no acepta {selectedAsset.code} todavía.
                    {canWithdraw
                      ? ' Alguien con retiro puede abrir la trustline acá mismo.'
                      : ' Un wallet con retiro tiene que abrir la trustline.'}
                  </Alert>
                </div>
              ) : null}
              <div className="mt-4 space-y-2.5">
                <Field label={`Monto (${selectedAsset.code})`}>
                  <TextInput
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Nota" hint="Opcional. Hasta 28 caracteres.">
                  <TextInput
                    value={depositNote}
                    onChange={(event) => setDepositNote(event.target.value)}
                  />
                </Field>
                <Button disabled={Boolean(busy)} onClick={() => void deposit()}>
                  Depositar
                </Button>
              </div>
            </DashCard>
          ) : null}
          {canWithdraw ? (
            <DashCard
              title="Operar"
              hint="Django valida el tope de retiro antes de armar la tx. Blend es solo XLM."
            >
              <div className="mt-3 space-y-2.5">
                {selectedAsset.issuer && !poolHasAsset ? (
                  <Alert tone="error">
                    La caja no acepta {selectedAsset.code} todavía: pedí la
                    trustline (usa el mismo umbral que un retiro).
                  </Alert>
                ) : null}
                <Field label={`Monto (${selectedAsset.code})`}>
                  <TextInput
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={
                      maxWithdrawal != null
                        ? `máx retiro ${maxWithdrawal} ${selectedAsset.code}`
                        : `retiros ${selectedAsset.code} no habilitados`
                    }
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Destino del retiro">
                  <TextInput
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    spellCheck={false}
                  />
                </Field>
                <Field label="Nota" hint="Opcional. Hasta 28 caracteres.">
                  <TextInput
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="black"
                  disabled={Boolean(busy)}
                  onClick={() => void startSignedFlow('withdraw')}
                >
                  Pedir retiro
                </Button>
                {selectedAsset.issuer && !poolHasAsset ? (
                  <Button
                    variant="black"
                    disabled={Boolean(busy)}
                    onClick={() => void startTrustline()}
                  >
                    Abrir trustline {selectedAsset.code}
                  </Button>
                ) : null}
                <Button
                  variant="white"
                  disabled={Boolean(busy)}
                  onClick={() => void startSignedFlow('blend-supply')}
                >
                  Poner en Blend
                </Button>
                <Button
                  variant="white"
                  disabled={Boolean(busy)}
                  onClick={() => void startSignedFlow('blend-withdraw')}
                >
                  Sacar de Blend
                </Button>
              </div>
            </DashCard>
          ) : null}
        </DashCol>
        <DashCol>
          <DashCard title="Wallets" hint="Quién puede depositar y quién firma retiros.">
            <div className="dash-feed">
              {poolMembers.map((member) => (
                <DashFeedItem
                  key={member.publicKey}
                  from={member.publicKey === publicKey ? 'Vos' : 'Wallet'}
                  date={truncateKey(member.publicKey, 5)}
                  amount={walletPowerLabel(member.power)}
                />
              ))}
            </div>
            {youAreCreator ? (
              <div className="mt-4 space-y-2.5">
                <Field label="Agregar wallet">
                  <TextInput
                    value={newSignerKey}
                    onChange={(event) => setNewSignerKey(event.target.value)}
                    placeholder="G…"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Puede">
                  <WalletPowerChips
                    value={newSignerPower}
                    onChange={setNewSignerPower}
                  />
                </Field>
                <Button
                  variant="black"
                  disabled={Boolean(busy)}
                  onClick={() => void startAddSigner()}
                >
                  {newSignerPower === 'deposit' ? 'Asociar depósito' : 'Pedir alta de wallet'}
                </Button>
              </div>
            ) : (
              <p className="dash-empty">
                Solo quien creó la caja puede agregar wallets.
              </p>
            )}
          </DashCard>
        </DashCol>
      </DashBoard>
    </div>
  )
}

function pendingLabel(kind: PendingFamilyTx['kind']): string {
  if (kind === 'withdraw') return 'retiro'
  if (kind === 'blend-supply') return 'aporte a Blend'
  if (kind === 'trustline') return 'trustline'
  if (kind === 'add-signer') return 'alta de wallet'
  return 'rescate de Blend'
}

async function retryNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
      return await fn()
    }
    throw error
  }
}

function humanizeFlowError(error: unknown): string {
  if (error instanceof Error && error.name.startsWith('Freighter')) {
    return humanizeFreighterError(error)
  }
  return humanizeApiError(error)
}

function WalletPowerChips({
  value,
  onChange,
}: {
  value: WalletPower
  onChange: (power: WalletPower) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Qué puede hacer esta wallet">
      {WALLET_POWERS.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
              selected
                ? 'bg-purple text-white'
                : 'border border-purple/20 bg-white/50 text-ink hover:border-purple/45 hover:bg-white/80'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

