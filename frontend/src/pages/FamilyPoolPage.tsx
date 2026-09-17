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
  fullAmountTitle,
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
  getFamilyLabels,
  getPendingFamilyTx,
  saveFamilyPool,
  savePendingFamilyTx,
  setFamilyLabel,
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

function FamilyTabsBar({
  pools,
  activeAccount,
  creating = false,
  onSelect,
  onCreate,
}: {
  pools: FamilyPoolRecord[]
  activeAccount: string | null
  creating?: boolean
  onSelect: (account: string) => void
  onCreate: () => void
}) {
  if (pools.length === 0) return null
  return (
    <div className="family-tabs-bar">
      <div className="family-tabs" role="tablist" aria-label="Cajas familiares">
        {pools.map((item) => {
          const selected = !creating && item.poolAccount === activeAccount
          return (
            <button
              key={item.poolAccount}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`family-tab ${selected ? 'is-active' : ''}`}
              onClick={() => onSelect(item.poolAccount)}
            >
              {item.title}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className={`family-tabs-new ${creating ? 'is-active' : ''}`}
        onClick={onCreate}
      >
        Nueva caja
      </button>
    </div>
  )
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
      title="FAMILIA"
      subtitle="Caja familiar: todos pueden aportar; los retiros necesitan más de una firma. Tu clave no sale del navegador."
    >
      <WalletGate
        title="Conectá para la caja familiar"
        description="Hace falta tu billetera para aportar y firmar retiros."
        preview={<FamilyPreview />}
      >
        <FamilyContent />
      </WalletGate>
    </PageStage>
  )
}

function FamilyPreview() {
  return (
    <div className="rounded-[28px] border border-purple/15 bg-white/70 px-5 py-4 text-sm leading-6 text-purple-deep">
      <p className="font-semibold">Qué ganás al conectar</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Ver el patrimonio de la caja compartida.</li>
        <li>Aportar cuando quieras, con tu rol.</li>
        <li>Los retiros piden la firma de quien corresponde.</li>
      </ul>
    </div>
  )
}

function FamilyContent() {
  const { publicKey, refreshBalances } = useWallet()
  const [pools, setPools] = useState<FamilyPoolRecord[]>([])
  const [activeAccount, setActiveAccount] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const visiblePools = import.meta.env.DEV
    ? pools
    : pools.filter((item) => !/prueba/i.test(item.title))
  const pool =
    visiblePools.find((item) => item.poolAccount === activeAccount) ??
    visiblePools[0] ??
    null

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
      <div className="space-y-4">
        <FamilyTabsBar
          pools={visiblePools}
          activeAccount={null}
          creating
          onSelect={(account) => {
            setActiveAccount(account)
            setCreating(false)
          }}
          onCreate={() => setCreating(true)}
        />
        <CreateFamilyForm
          publicKey={publicKey}
          onCreated={remember}
          onCancel={visiblePools.length > 0 ? () => setCreating(false) : undefined}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FamilyTabsBar
        pools={visiblePools}
        activeAccount={pool.poolAccount}
        onSelect={setActiveAccount}
        onCreate={() => setCreating(true)}
      />
      <FamilyDashboard
        publicKey={publicKey}
        pool={pool}
        onRefreshWallet={() => void refreshBalances()}
        onPoolUpdated={remember}
      />
    </div>
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
    if (payload.length === 0) {
      setError('Hace falta al menos una wallet con retiro.')
      return
    }
    const threshold = 1

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
          extra_starting_balance: '0',
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

      setBusy('Firmando la alta de la caja…')
      const signedConfig = signXdrWithSecret(configure.xdr, keys.secret)
      setBusy('Enviando SetOptions a Horizon…')
      await submitSignedXdr(signedConfig)

      setBusy('Confirmando la caja en Django…')
      const pool = await retryNotFound(() =>
        confirmFamilyPool({
          pool_public_key: keys.publicKey,
          title: title.trim(),
          creator_public_key: publicKey,
          withdrawal_limit: '50',
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
      <h2 className="text-xl font-black tracking-tight sm:text-2xl">Crear caja familiar</h2>
      <p className="mt-1.5 text-sm leading-5 text-purple-deep/75">
        Se arma una cuenta nueva en este navegador. Tu clave no sale de acá.
      </p>
      <div className="mt-3.5 space-y-2.5">
        <Field label="Nombre">
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
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
            Crear caja →
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
  onRefreshWallet,
  onPoolUpdated,
}: {
  publicKey: string
  pool: FamilyPoolRecord
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
  const [showAllMoves, setShowAllMoves] = useState(false)
  const [showAllWallets, setShowAllWallets] = useState(false)
  const [labels, setLabels] = useState(() => getFamilyLabels(pool.poolAccount))
  const reveal = useUnfoldDown(pool.poolAccount)

  useEffect(() => {
    setLabels(getFamilyLabels(pool.poolAccount))
  }, [pool.poolAccount])

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
      setError(`La caja todavía no acepta ${selectedAsset.code}. Primero activá el activo.`)
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
      setError(`La caja no tiene ${selectedAsset.code} activado.`)
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
      setError('El rendimiento en esta demo solo mueve XLM.')
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

      setBusy('Firmá en tu billetera…')
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
      setError('XLM no necesita activar el activo.')
      return
    }
    try {
      setError(null)
      setOk(null)
      setBusy(`Activando ${selectedAsset.code}…`)
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
      setBusy('Firmá en tu billetera…')
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
  const withdrawers = poolMembers.filter(
    (member) => member.power === 'withdraw' || member.power === 'deposit-withdraw',
  )

  function memberLabel(key: string, index = 1) {
    if (key === publicKey) return 'Vos'
    if (labels[key]) return labels[key]
    return `Wallet ${index}`
  }

  function movementLabel(key: string) {
    if (key === publicKey) return 'Vos'
    if (key === pool.poolAccount) return 'Caja'
    const index = poolMembers.findIndex((member) => member.publicKey === key)
    if (index >= 0) return memberLabel(key, index + 1)
    if (labels[key]) return labels[key]
    return 'Desconocido'
  }

  return (
    <div ref={reveal} className="space-y-4">
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

      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="ok">{ok}</Alert> : null}
      {busy ? <Spinner label={busy} /> : null}

      <DashBoard>
        <DashCol>
          <DashHero
            compact
            kicker="Patrimonio de la caja"
            value={
              idleXlm != null
                ? formatAmount(String(Number(idleXlm) + Number(blend?.currentValue ?? 0)), 'XLM')
                : '—'
            }
            valueTitle={
              idleXlm != null
                ? fullAmountTitle(Number(idleXlm) + Number(blend?.currentValue ?? 0), 'XLM')
                : undefined
            }
            fiat={`Tope de retiro ${formatAmount(pool.withdrawalLimit, 'XLM')} · ${walletPowerLabel(myPower)}`}
            action={
              canDeposit ? (
                <Button
                  variant="white"
                  onClick={() =>
                    document.getElementById('aportar')?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  Ir a aportar
                </Button>
              ) : null
            }
          />
          {canDeposit && !canWithdraw ? (
            <div className="dash-banner">
              <p>
                Tu rol es solo depósito. Pedile firmar a quien tiene retiro
                {withdrawers.length > 0
                  ? `: ${withdrawers
                      .map((member, index) => memberLabel(member.publicKey, index + 1))
                      .join(', ')}`
                  : ''}
                .
              </p>
              <Button variant="white" disabled title="Tu rol es solo depósito">
                Retirar
              </Button>
            </div>
          ) : null}
          {canDeposit ? (
            <DashCard
              title="Aportar"
              hint="Compartí el QR o depositá con Freighter."
            >
              <div id="aportar" className="dash-qr-row">
                <div className="dash-qr-frame">
                  <QrPanel
                    value={buildPayUri({
                      destination: pool.poolAccount,
                      asset: selectedAsset,
                    })}
                    size={120}
                    framed={false}
                  />
                </div>
                <div className="dash-addr">
                  <p className="dash-addr-label">Address de la caja</p>
                  <div className="dash-addr-row">
                    <p className="dash-addr-value">{truncateKey(pool.poolAccount, 6)}</p>
                    <Button
                      variant="white"
                      onClick={() => void navigator.clipboard.writeText(pool.poolAccount)}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <AssetChips value={assetCode} onChange={setAssetCode} tone="dark" />
              </div>
              {selectedAsset.issuer && !poolHasAsset ? (
                <div className="mt-3">
                  <Alert tone="error">
                    La caja no acepta {selectedAsset.code} todavía.
                    {canWithdraw
                      ? ' Alguien con retiro puede activar el activo acá mismo.'
                      : ' Un wallet con retiro tiene que activar el activo.'}
                  </Alert>
                </div>
              ) : null}
              <div className="dash-form-grid">
                <Field label={`Monto (${selectedAsset.code})`}>
                  <TextInput
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Nota" hint="Opcional. Máx. 28.">
                  <TextInput
                    value={depositNote}
                    onChange={(event) => setDepositNote(event.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Button disabled={Boolean(busy)} onClick={() => void deposit()}>
                  Depositar
                </Button>
              </div>
            </DashCard>
          ) : null}
          {canWithdraw ? (
            <DashCard
              title="Operar"
              hint="Hay un tope de retiro. El rendimiento es solo XLM."
            >
              <div className="mt-3 space-y-2.5">
                {selectedAsset.issuer && !poolHasAsset ? (
                  <Alert tone="error">
                    La caja no acepta {selectedAsset.code} todavía: pedí
                    activar el activo (usa el mismo umbral que un retiro).
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
                <Field label="Nota" hint="Opcional. Máx. 28.">
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
                    Activar {selectedAsset.code}
                  </Button>
                ) : null}
                <Button
                  variant="white"
                  disabled={Boolean(busy)}
                  onClick={() => void startSignedFlow('blend-supply')}
                >
                  Poner a rendir
                </Button>
                <Button
                  variant="white"
                  disabled={Boolean(busy)}
                  onClick={() => void startSignedFlow('blend-withdraw')}
                >
                  Sacar del rendimiento
                </Button>
              </div>
            </DashCard>
          ) : null}
        </DashCol>
        <DashCol>
          <DashCard title="Movimientos" hint="Lo que llegó a la caja.">
            {incoming.length === 0 ? (
              <p className="dash-empty">Todavía no hay depósitos en esta caja.</p>
            ) : (
              <>
                <div className="dash-feed">
                  {(showAllMoves ? incoming : incoming.slice(0, 5)).map((item) => (
                    <DashFeedItem
                      key={item.id}
                      fromLabel="De"
                      from={movementLabel(item.from)}
                      date={truncateKey(item.from, 4)}
                      amount={formatAmount(item.amount, '')}
                      code={displayAssetCode(item.assetCode)}
                      href={explorerTxUrl(item.transactionHash)}
                    />
                  ))}
                </div>
                {incoming.length > 5 ? (
                  <button
                    type="button"
                    className="dash-more"
                    onClick={() => setShowAllMoves((open) => !open)}
                  >
                    {showAllMoves ? 'Ver menos' : 'Ver más'}
                  </button>
                ) : null}
              </>
            )}
          </DashCard>
          <DashCard title="Wallets" hint="Quién deposita y quién firma retiros.">
            <div className="dash-feed">
              {(showAllWallets ? poolMembers : poolMembers.slice(0, 5)).map((member, index) => (
                <div key={member.publicKey}>
                  <DashFeedItem
                    fromLabel="Persona"
                    from={`${memberLabel(member.publicKey, index + 1)} — ${walletPowerLabel(member.power)}`}
                    date={truncateKey(member.publicKey, 5)}
                    amount=""
                  />
                  {youAreCreator && member.publicKey !== publicKey ? (
                    <Field label="Apodo">
                      <TextInput
                        value={labels[member.publicKey] ?? ''}
                        onChange={(event) => {
                          setFamilyLabel(
                            pool.poolAccount,
                            member.publicKey,
                            event.target.value,
                          )
                          setLabels(getFamilyLabels(pool.poolAccount))
                        }}
                        placeholder={`Wallet ${index + 1}`}
                      />
                    </Field>
                  ) : null}
                </div>
              ))}
            </div>
            {poolMembers.length > 5 ? (
              <button
                type="button"
                className="dash-more"
                onClick={() => setShowAllWallets((open) => !open)}
              >
                {showAllWallets ? 'Ver menos' : 'Ver más'}
              </button>
            ) : null}
            {youAreCreator ? (
              <div className="mt-3 space-y-2.5">
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
  if (kind === 'blend-supply') return 'aporte a rendimiento'
  if (kind === 'trustline') return 'activar activo'
  if (kind === 'add-signer') return 'alta de wallet'
  return 'rescate de rendimiento'
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

