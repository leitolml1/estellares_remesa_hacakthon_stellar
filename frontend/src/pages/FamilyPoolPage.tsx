import { useEffect, useMemo, useRef, useState } from 'react'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AssetLogo } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import {
  IconActivity,
  IconBolt,
  IconExternal,
  IconFamily,
  IconPlus,
  IconPen,
  IconQr,
  IconReceive,
  IconSend,
  IconVault,
  IconWallet,
} from '../components/ui/Icons'
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
  removeFamilyWallet,
  submitBlendTx,
  addFamilyDepositor,
  submitFamilyAddSigner,
  submitFamilyTrustline,
  submitFamilyWithdrawal,
  updateFamilyMemberRole,
  updateFamilyPoolLimits,
} from '../lib/api'
import {
  buildPayUri,
  getKnownAsset,
  KNOWN_ASSETS,
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
  { id: 'deposit', label: 'Aporte' },
  { id: 'withdraw', label: 'Operador' },
  { id: 'deposit-withdraw', label: 'Aporte/operador' },
]

function walletPowerLabel(power: WalletPower) {
  return WALLET_POWERS.find((item) => item.id === power)?.label ?? 'Depósito y retiro'
}

function LimitField({
  code,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  code: 'XLM' | 'USDC' | 'EURC'
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <div className="block space-y-1.5">
      <span className="form-label fin-limit-label">
        <AssetLogo code={code} className="h-5 w-5" />
        Tope {code}
      </span>
      <TextInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
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
        <IconPlus className="h-3.5 w-3.5" />
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
      title="Bóveda familiar"
      subtitle="Caja comunitaria multisig: todos pueden aportar; los retiros piden más de una firma. Tu clave privada nunca sale del navegador."
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

function TxExplorerLink({
  hash,
  onDark = false,
}: {
  hash: string
  onDark?: boolean
}) {
  return (
    <a
      className={`tx-link ${onDark ? 'is-on-dark' : ''}`}
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
    >
      Ver en testnet
      <IconExternal className="h-3.5 w-3.5" />
    </a>
  )
}

function FamilyPreview() {
  return (
    <div className="fin-card text-sm leading-6">
      <p className="font-semibold text-white">Qué ganás al conectar</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
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
  const [limitXlm, setLimitXlm] = useState('1000')
  const [limitUsdc, setLimitUsdc] = useState('100')
  const [limitEurc, setLimitEurc] = useState('100')
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
    const limits: [string, string, (value: string) => void][] = [
      ['XLM', limitXlm.trim(), setLimitXlm],
      ['USDC', limitUsdc.trim(), setLimitUsdc],
      ['EURC', limitEurc.trim(), setLimitEurc],
    ]
    for (const [asset, value, setter] of limits) {
      if (!isStellarAmount(value)) {
        setError(`El tope de retiro ${asset} tiene que ser un monto Stellar válido.`)
        setter('')
        return
      }
    }
    const onchainSigners = members
      .filter((member) => member.power !== 'deposit')
      .map((member) => ({
        public_key: member.publicKey,
        // El creator entra con weight 2 y highThreshold = 2: su firma sola
        // alcanza para agregar, cambiar o dar de baja firmantes, sin
        // "votacion" de la familia.
        weight: member.publicKey === publicKey ? 2 : 1,
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
          withdrawal_limit: limitXlm.trim(),
          asset_withdrawal_limits: {
            USDC: limitUsdc.trim(),
            EURC: limitEurc.trim(),
          },
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Tope XLM" hint="Máximo por retiro">
            <TextInput
              value={limitXlm}
              onChange={(event) => setLimitXlm(event.target.value)}
              inputMode="decimal"
              placeholder="1000"
            />
          </Field>
          <Field label="Tope USDC" hint="Máximo por retiro">
            <TextInput
              value={limitUsdc}
              onChange={(event) => setLimitUsdc(event.target.value)}
              inputMode="decimal"
              placeholder="100"
            />
          </Field>
          <Field label="Tope EURC" hint="Máximo por retiro">
            <TextInput
              value={limitEurc}
              onChange={(event) => setLimitEurc(event.target.value)}
              inputMode="decimal"
              placeholder="100"
            />
          </Field>
        </div>
        <p className="text-xs leading-4 text-purple-deep/60">
          Los topes limitan cuánto se puede retirar por operación: una firma de la
          familia no puede mover más que el tope configurado para ese activo.
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
  const [blend, setBlend] = useState<BlendPosition | null | undefined>(undefined)
  const [assetCode, setAssetCode] = useState<KnownAssetCode>('XLM')
  const [newSignerKey, setNewSignerKey] = useState('')
  const [newSignerNick, setNewSignerNick] = useState('')
  const [addingWallet, setAddingWallet] = useState(false)
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
  const [fundMode, setFundMode] = useState<'aportar' | 'operar'>('aportar')
  const [deskMode, setDeskMode] = useState<'wallets' | 'topes'>('wallets')
  const [xlmView, setXlmView] = useState<'saldo' | 'blend'>('saldo')
  const [memberEdits, setMemberEdits] = useState<
    Record<string, { label: string; power: WalletPower; remove: boolean }>
  >({})
  const [nickEditKey, setNickEditKey] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [okHash, setOkHash] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<PaymentRecord[]>([])
  const [showAllMoves, setShowAllMoves] = useState(false)
  const [showAllWallets, setShowAllWallets] = useState(false)
  const [labels, setLabels] = useState(() => getFamilyLabels(pool.poolAccount))
  const [limitsDraft, setLimitsDraft] = useState({
    xlm: pool.withdrawalLimit,
    usdc: pool.assetWithdrawalLimits?.USDC ?? '',
    eurc: pool.assetWithdrawalLimits?.EURC ?? '',
  })
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [limitsError, setLimitsError] = useState<string | null>(null)
  // Paso "despues del alta on-chain" (ej: fijar el rol en la DB) que se
  // ejecuta cuando el set-signer se confirma; sobrevive al flujo de firmas
  // pendientes, se limpia si el usuario descarta la tx.
  const followUpRef = useRef<null | (() => Promise<void>)>(null)
  const reveal = useUnfoldDown(pool.poolAccount)

  useEffect(() => {
    setLabels(getFamilyLabels(pool.poolAccount))
  }, [pool.poolAccount])

  useEffect(() => {
    setLimitsDraft({
      xlm: pool.withdrawalLimit,
      usdc: pool.assetWithdrawalLimits?.USDC ?? '',
      eurc: pool.assetWithdrawalLimits?.EURC ?? '',
    })
  }, [pool.poolAccount, pool.withdrawalLimit, pool.assetWithdrawalLimits])

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

  async function saveLimits() {
    const draft = {
      xlm: limitsDraft.xlm.trim(),
      usdc: limitsDraft.usdc.trim(),
      eurc: limitsDraft.eurc.trim(),
    }
    for (const [asset, value] of [['XLM', draft.xlm], ['USDC', draft.usdc], ['EURC', draft.eurc]] as const) {
      if (!isStellarAmount(value)) {
        setLimitsError(`El tope ${asset} tiene que ser un monto Stellar válido.`)
        return
      }
    }
    try {
      setLimitsError(null)
      setLimitsBusy(true)
      const updated = await updateFamilyPoolLimits(pool.poolAccount, {
        requester_public_key: publicKey,
        withdrawal_limit: draft.xlm,
        asset_withdrawal_limits: { USDC: draft.usdc, EURC: draft.eurc },
      })
      onPoolUpdated(updated)
      setOk('Topes de retiro actualizados.')
      setLimitsDraft({
        xlm: updated.withdrawalLimit,
        usdc: updated.assetWithdrawalLimits?.USDC ?? '',
        eurc: updated.assetWithdrawalLimits?.EURC ?? '',
      })
    } catch (caught) {
      setLimitsError(humanizeFlowError(caught))
    } finally {
      setLimitsBusy(false)
    }
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
      setOkHash(null)
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
      setOk('Depósito confirmado.')
      setOkHash(result.hash)
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
      setOkHash(null)
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
      setOkHash(null)
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
    const nick = newSignerNick.trim()
    if (nick) {
      setFamilyLabel(pool.poolAccount, key, nick)
      setLabels(getFamilyLabels(pool.poolAccount))
    }
    try {
      setError(null)
      setOk(null)
      setOkHash(null)
      if (newSignerPower === 'deposit') {
        setBusy('Asociando wallet para depósito…')
        const updated = await addFamilyDepositor(pool.poolAccount, {
          public_key: key,
          requester_public_key: publicKey,
        })
        onPoolUpdated(updated)
        setNewSignerKey('')
        setNewSignerNick('')
        setNewSignerPower('deposit-withdraw')
        setAddingWallet(false)
        setOk('Wallet asociada: puede ver la caja y depositar.')
        return
      }
      await startSetSignerFlow({
        key,
        weight: 1,
        role: newSignerPower,
        after: () => {
          setNewSignerKey('')
          setNewSignerNick('')
          setNewSignerPower('deposit-withdraw')
          setAddingWallet(false)
          return Promise.resolve()
        },
      })
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  // Alta/cambio de peso/baja de firmante on-chain. Con el modelo nuevo el
  // creator tiene weight = highThreshold, asi que SU firma sola aprueba la
  // tx (sin votacion). Si la caja todavia no esta migrada (creator con
  // peso menor al umbral alto), el flujo de firmas acumuladas
  // (pendingFamilyTx) recauda lo que falta.
  async function startSetSignerFlow(target: {
    key: string
    weight: number
    role?: WalletPower
    after?: () => Promise<void>
  }) {
    try {
      setError(null)
      setOk(null)
      setOkHash(null)
      setBusy(
        target.weight === 0 ? 'Armando la baja del firmante…' : 'Armando alta de wallet…',
      )
      const built = await buildFamilyAddSigner(pool.poolAccount, {
        signer_public_key: target.key,
        weight: target.weight,
        requester_public_key: publicKey,
        role: target.role ? toApiRole(target.role) : undefined,
      })
      setBusy('Firmá en tu billetera…')
      const signed = await signTransactionWithFreighter(
        built.xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      followUpRef.current = target.after ?? null
      await submitOrKeep({
        poolAccount: pool.poolAccount,
        kind: 'add-signer',
        xdr: signed.signedXdr,
        signedBy: [publicKey],
        destination: target.key,
        role: target.role,
      })
    } catch (caught) {
      followUpRef.current = null
      setError(humanizeFlowError(caught))
      throw caught
    }
  }

  async function changeMemberRole(memberKey: string, target: WalletPower) {
    try {
      setError(null)
      setOk(null)
      setOkHash(null)
      const isOnchainSigner = pool.signers.some((signer) => signer.publicKey === memberKey)
      if (target !== 'deposit' && !isOnchainSigner) {
        // Promover a retiro exige firma on-chain: primero el alta del
        // firmante (el creator firma solo con el modelo nuevo) y despues
        // el cambio de rol en la DB.
        await startSetSignerFlow({
          key: memberKey,
          weight: 1,
          role: target,
          after: async () => {
            const updated = await updateFamilyMemberRole(pool.poolAccount, {
              public_key: memberKey,
              role: toApiRole(target),
              requester_public_key: publicKey,
            })
            onPoolUpdated(updated)
            setOk('Permisos actualizados: la wallet ya puede retirar.')
          },
        })
        return
      }
      setBusy('Actualizando permisos…')
      const updated = await updateFamilyMemberRole(pool.poolAccount, {
        public_key: memberKey,
        role: toApiRole(target),
        requester_public_key: publicKey,
      })
      onPoolUpdated(updated)
      setOk('Permisos actualizados.')
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function removeMember(memberKey: string) {
    try {
      setError(null)
      setOk(null)
      setOkHash(null)
      const isOnchainSigner = pool.signers.some((signer) => signer.publicKey === memberKey)
      if (isOnchainSigner) {
        // Revocacion real: primero la baja on-chain del firmante (el
        // creator firma solo con el modelo nuevo) y despues la limpieza
        // en la DB.
        await startSetSignerFlow({
          key: memberKey,
          weight: 0,
          after: async () => {
            try {
              const updated = await removeFamilyWallet(pool.poolAccount, {
                public_key: memberKey,
                requester_public_key: publicKey,
              })
              onPoolUpdated(updated)
            } catch {
              // Si ya no estaba en la DB (resync incompleto), no importa.
            }
            setOk('Wallet dada de baja: perdió el acceso y su firma on-chain.')
          },
        })
        return
      }
      setBusy('Dando de baja la wallet…')
      const updated = await removeFamilyWallet(pool.poolAccount, {
        public_key: memberKey,
        requester_public_key: publicKey,
      })
      onPoolUpdated(updated)
      setOk('Wallet dada de baja.')
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function saveMemberEdits() {
    const applied: string[] = []
    let nicknames = false
    for (const member of poolMembers) {
      const edit = memberEdits[member.publicKey]
      if (!edit || edit.remove) continue
      const saved = labels[member.publicKey] ?? ''
      if (edit.label.trim() !== saved) {
        setFamilyLabel(pool.poolAccount, member.publicKey, edit.label.trim())
        nicknames = true
        applied.push(member.publicKey)
      }
    }
    if (nicknames) setLabels(getFamilyLabels(pool.poolAccount))

    const removable = poolMembers.filter(
      (member) => memberEdits[member.publicKey]?.remove && member.publicKey !== pool.creator,
    )
    const roleChanges = poolMembers.filter((member) => {
      const edit = memberEdits[member.publicKey]
      return (
        edit &&
        !edit.remove &&
        edit.power !== member.power &&
        member.publicKey !== pool.creator
      )
    })
    const needsChain = (memberKey: string, weight: number, power?: WalletPower) => {
      const onChain = pool.signers.some((signer) => signer.publicKey === memberKey)
      if (weight === 0) return onChain
      return power !== 'deposit' && !onChain
    }
    const localRemovals = removable.filter((member) => !needsChain(member.publicKey, 0))
    const chainRemovals = removable.filter((member) => needsChain(member.publicKey, 0))
    const localRoles = roleChanges.filter(
      (member) => !needsChain(member.publicKey, 1, memberEdits[member.publicKey].power),
    )
    const chainRoles = roleChanges.filter((member) =>
      needsChain(member.publicKey, 1, memberEdits[member.publicKey].power),
    )

    for (const member of localRemovals) {
      await removeMember(member.publicKey)
      applied.push(member.publicKey)
    }
    for (const member of localRoles) {
      await changeMemberRole(member.publicKey, memberEdits[member.publicKey].power)
      applied.push(member.publicKey)
    }

    const chain = chainRemovals[0] ?? chainRoles[0]
    if (chain) {
      const edit = memberEdits[chain.publicKey]
      if (edit.remove) {
        await removeMember(chain.publicKey)
      } else {
        await changeMemberRole(chain.publicKey, edit.power)
      }
      applied.push(chain.publicKey)
    }

    setMemberEdits((current) => {
      const next = { ...current }
      for (const key of applied) delete next[key]
      return next
    })
    setNickEditKey(null)
    const waiting = chainRemovals.length + chainRoles.length - (chain ? 1 : 0)
    if (!chain && nicknames && localRemovals.length === 0 && localRoles.length === 0) {
      setOk('Cambios guardados.')
    } else if (waiting > 0) {
      setOk('Firmá este cambio. Cuando termine, guardá otra vez para el resto.')
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
        setNewSignerNick('')
        setNewSignerPower('deposit-withdraw')
        setAddingWallet(false)
        if (!result.resynced) {
          setOk('Alta enviada, pero no pudimos releer la caja: refrescá en un momento.')
          setOkHash(hash ?? null)
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
      setOk(hash ? 'Transacción confirmada en testnet.' : 'La transacción se envió.')
      setOkHash(hash ?? null)
      const followUp = followUpRef.current
      followUpRef.current = null
      if (followUp && next.kind === 'add-signer') {
        await followUp()
      }
      await refreshPoolMoney()
    } catch (caught) {
      if (isMissingSignaturesError(caught)) {
        savePendingFamilyTx(next)
        setPending(next)
        setOkHash(null)
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
    followUpRef.current = null
  }

  const youAreSigner = pool.signers.some((signer) => signer.publicKey === publicKey)
  const youAreCreator = pool.creator === publicKey
  const creatorSigner = pool.signers.find((signer) => signer.publicKey === pool.creator)
  const creatorWeight = creatorSigner?.weight ?? 0
  // Caja "vieja" (modelo unanime): el creator todavia no tiene weight
  // suficiente para editar el multisig el solo. Una sola tx de migracion
  // (con una firma extra de la familia) lo habilita para siempre.
  const needsCreatorPower =
    youAreCreator && creatorWeight < pool.highThreshold
  // Rol de la wallet conectada en esta caja: define qué ve en la UI. El
  // rol es a nivel app; on-chain la realidad es multisig (solo los
  // firmantes pueden mover fondos, y eso no cambia).
  const myPower = memberPower(pool, publicKey)
  const canDeposit = myPower === 'deposit' || myPower === 'deposit-withdraw'
  const canWithdraw = myPower === 'withdraw' || myPower === 'deposit-withdraw'
  const activeFundMode = !canDeposit ? 'operar' : !canWithdraw ? 'aportar' : fundMode
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
  const memberEditsDirty = poolMembers.some((member) => {
    const edit = memberEdits[member.publicKey]
    if (!edit) return false
    return (
      edit.remove ||
      edit.power !== member.power ||
      edit.label.trim() !== (labels[member.publicKey] ?? '')
    )
  })

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

  const todayLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const totalXlm =
    idleXlm != null ? Number(idleXlm) + Number(blend?.currentValue ?? 0) : null
  const youName = memberLabel(publicKey)

  return (
    <div ref={reveal} className="space-y-4">
      <div className="fin-hello">
        <div>
          <time dateTime={new Date().toISOString()}>{todayLabel}</time>
          <h2>Hola, {youName === 'Vos' ? 'familia' : youName}</h2>
        </div>
        <div className="family-status">
          <span className="family-status-pill">
            <IconFamily className="h-3.5 w-3.5" />
            Multisig activo
          </span>
          <span className="family-status-pill is-soft">
            Quórum: {pool.medThreshold} de {withdrawers.length} firmas
          </span>
          <span className="family-status-pill is-ghost">Non-custodial</span>
        </div>
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

      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? (
        <Alert tone="ok">
          {ok}
          {okHash ? (
            <>
              {' '}
              <TxExplorerLink hash={okHash} />
            </>
          ) : null}
        </Alert>
      ) : null}
      {busy ? <Spinner label={busy} /> : null}

      <div className="fin-balances">
        <article className="fin-wealth">
          <p className="fin-kicker">Patrimonio total</p>
          <p className="fin-value" title={totalXlm != null ? fullAmountTitle(totalXlm, 'XLM') : undefined}>
            {totalXlm != null ? formatAmount(String(totalXlm), 'XLM') : '—'}
          </p>
          <p className="fin-hint">
            Tope de retiro {formatAmount(pool.withdrawalLimit, 'XLM')} · {walletPowerLabel(myPower)}
          </p>
        </article>
        {KNOWN_ASSETS.map((asset) => {
          const balance = knownAssetBalance(poolAccount?.balances, asset)
          if (asset.code === 'XLM') {
            return (
              <article key="XLM" className="fin-asset is-xlm" id="rendimiento">
                <div className="fin-asset-switch" role="tablist" aria-label="Saldo XLM o Blend">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={xlmView === 'saldo'}
                    className={xlmView === 'saldo' ? 'is-on' : ''}
                    onClick={() => setXlmView('saldo')}
                  >
                    <AssetLogo code="XLM" className="h-4 w-4" />
                    XLM
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={xlmView === 'blend'}
                    className={xlmView === 'blend' ? 'is-on' : ''}
                    onClick={() => setXlmView('blend')}
                  >
                    <IconBolt className="h-3.5 w-3.5" />
                    Blend
                  </button>
                </div>
                {xlmView === 'saldo' ? (
                  <p className="fin-value" title={balance != null ? fullAmountTitle(balance, 'XLM') : undefined}>
                    {balance != null ? formatAmount(balance, '') : '—'}
                  </p>
                ) : blend === undefined ? (
                  <p className="fin-empty">Consultando Blend…</p>
                ) : blend ? (
                  <div className="fin-blend-mini">
                    <p>
                      <span>Puesto a rendir</span>
                      <strong title={fullAmountTitle(blend.capital, 'XLM')}>
                        {formatAmount(blend.capital, 'XLM')}
                      </strong>
                    </p>
                    <p>
                      <span>Valor actual</span>
                      <strong title={fullAmountTitle(blend.currentValue, 'XLM')}>
                        {formatAmount(blend.currentValue, 'XLM')}
                      </strong>
                    </p>
                    <p className="is-yield">
                      <span>Interés</span>
                      <strong title={fullAmountTitle(blend.interestEarned, 'XLM')}>
                        {formatAmount(blend.interestEarned, 'XLM')}
                        {blendYieldLabel(blend) ? ` · ${blendYieldLabel(blend)}` : ''}
                      </strong>
                    </p>
                  </div>
                ) : (
                  <p className="fin-empty">No pudimos leer Blend ahora.</p>
                )}
              </article>
            )
          }
          return (
            <article key={asset.code} className={`fin-asset is-${asset.code.toLowerCase()}`}>
              <div className="fin-asset-head">
                <span>{asset.code}</span>
                <AssetLogo code={asset.code} className="h-6 w-6" />
              </div>
              <p className="fin-value" title={balance != null ? fullAmountTitle(balance, asset.code) : undefined}>
                <span className="fin-symbol">{asset.code === 'EURC' ? '€' : '$'}</span>
                {balance != null ? formatAmount(balance, '') : '—'}
              </p>
            </article>
          )
        })}
      </div>

      <div className="fin-actions">
        <button
          type="button"
          className="fin-action"
          disabled={!canDeposit}
          onClick={() => {
            setFundMode('aportar')
            document.getElementById('aportar')?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <span className="fin-action-ico"><IconReceive className="h-4 w-4" /></span>
          <span>
            <strong>Depositar</strong>
            <small>Sumar fondos</small>
          </span>
        </button>
        <button
          type="button"
          className="fin-action"
          disabled={!canWithdraw}
          onClick={() => {
            setFundMode('operar')
            document.getElementById('aportar')?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <span className="fin-action-ico"><IconSend className="h-4 w-4" /></span>
          <span>
            <strong>Retirar</strong>
            <small>Pedir firma</small>
          </span>
        </button>
        <button
          type="button"
          className="fin-action"
          disabled={!canWithdraw}
          onClick={() => document.getElementById('rendimiento')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span className="fin-action-ico"><IconBolt className="h-4 w-4" /></span>
          <span>
            <strong>Rendir</strong>
            <small>Solo XLM</small>
          </span>
        </button>
        <button
          type="button"
          className="fin-action"
          disabled={!canWithdraw}
          onClick={() => document.getElementById('rendimiento')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span className="fin-action-ico"><IconVault className="h-4 w-4" /></span>
          <span>
            <strong>Sacar</strong>
            <small>Del rendimiento</small>
          </span>
        </button>
        <button
          type="button"
          className="fin-action"
          onClick={() => void navigator.clipboard.writeText(pool.poolAccount)}
        >
          <span className="fin-action-ico"><IconQr className="h-4 w-4" /></span>
          <span>
            <strong>Copiar caja</strong>
            <small>Dirección Stellar</small>
          </span>
        </button>
      </div>

      {canDeposit && !canWithdraw ? (
        <div className="fin-card">
          <p className="fin-card-hint">
            Tu rol es solo depósito. Pedile firmar a quien tiene retiro
            {withdrawers.length > 0
              ? `: ${withdrawers
                  .map((member, index) => memberLabel(member.publicKey, index + 1))
                  .join(', ')}`
              : ''}
            .
          </p>
        </div>
      ) : null}

      <div className="fin-grid">
        {canDeposit || canWithdraw ? (
          <section className="fin-card" id="aportar">
            <div className="fin-card-head">
              <h3 className="fin-card-title">
                <span>
                  {activeFundMode === 'aportar' ? (
                    <IconQr className="h-4 w-4" />
                  ) : (
                    <IconVault className="h-4 w-4" />
                  )}
                </span>
                {activeFundMode === 'aportar' ? 'Aportar al pool' : 'Operar retiros'}
              </h3>
            </div>
            {canDeposit && canWithdraw ? (
              <div className="fin-fund-switch" role="tablist" aria-label="Aportar u operar">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFundMode === 'aportar'}
                  className={activeFundMode === 'aportar' ? 'is-on' : ''}
                  onClick={() => setFundMode('aportar')}
                >
                  <AssetLogo code={assetCode} className="h-5 w-5" />
                  Aportar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFundMode === 'operar'}
                  className={activeFundMode === 'operar' ? 'is-on' : ''}
                  onClick={() => setFundMode('operar')}
                >
                  <AssetLogo code={assetCode} className="h-5 w-5" />
                  Operar
                </button>
              </div>
            ) : null}
            <div className="fin-fund-assets" role="group" aria-label="Elegir moneda">
              {KNOWN_ASSETS.map((asset) => (
                <button
                  key={asset.code}
                  type="button"
                  aria-pressed={asset.code === assetCode}
                  className={asset.code === assetCode ? 'is-on' : ''}
                  onClick={() => setAssetCode(asset.code)}
                >
                  <AssetLogo code={asset.code} className="h-5 w-5" title={asset.name} />
                  {asset.code}
                </button>
              ))}
            </div>
            <p className="fin-card-hint">
              {activeFundMode === 'aportar'
                ? `Compartí el QR o depositá ${selectedAsset.code} desde tu billetera.`
                : selectedAsset.code === 'XLM'
                  ? 'Hay un tope de retiro. El rendimiento de Blend es solo XLM.'
                  : `Hay un tope de retiro en ${selectedAsset.code}. Blend sigue siendo solo XLM.`}
            </p>
            {selectedAsset.issuer && !poolHasAsset ? (
              <div className="mt-3">
                <Alert tone="error">
                  La caja no acepta {selectedAsset.code} todavía.
                  {canWithdraw
                    ? activeFundMode === 'operar'
                      ? ' Activalo con el botón de abajo: usa el mismo umbral que un retiro.'
                      : ' Podés activarlo desde Operar: usa el mismo umbral que un retiro.'
                    : ' Un wallet con retiro tiene que activar el activo.'}
                </Alert>
              </div>
            ) : null}
            {activeFundMode === 'aportar' ? (
              <>
                <div className="fin-qr">
                  <QrPanel
                    value={buildPayUri({
                      destination: pool.poolAccount,
                      asset: selectedAsset,
                    })}
                    size={120}
                    framed={false}
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Address de la caja</p>
                    <p className="mt-1 font-mono text-sm">{truncateKey(pool.poolAccount, 6)}</p>
                    <p className="family-verified">Cuenta Stellar · {selectedAsset.code}</p>
                  </div>
                </div>
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
                    Depositar {selectedAsset.code}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 space-y-2.5">
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
                    disabled={Boolean(busy) || assetCode !== 'XLM'}
                    onClick={() => void startSignedFlow('blend-supply')}
                  >
                    Poner a rendir
                  </Button>
                  <Button
                    variant="white"
                    disabled={Boolean(busy) || assetCode !== 'XLM'}
                    onClick={() => void startSignedFlow('blend-withdraw')}
                  >
                    Sacar del rendimiento
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : null}

        <section className="fin-card" id="topes">
          <div className="fin-card-head">
            <h3 className="fin-card-title">
              <span>
                {deskMode === 'wallets' ? (
                  <IconWallet className="h-4 w-4" />
                ) : (
                  <IconVault className="h-4 w-4" />
                )}
              </span>
              {deskMode === 'wallets' ? 'Wallets y permisos' : 'Topes de retiro'}
            </h3>
            {deskMode === 'wallets' ? (
              <span className="dash-card-count">{poolMembers.length} miembros</span>
            ) : youAreCreator ? (
              <span className="dash-card-count">Sos el creator</span>
            ) : null}
          </div>
          <div className="fin-fund-switch is-desk" role="tablist" aria-label="Wallets o topes">
            <button
              type="button"
              role="tab"
              aria-selected={deskMode === 'wallets'}
              className={deskMode === 'wallets' ? 'is-on' : ''}
              onClick={() => setDeskMode('wallets')}
            >
              <IconWallet className="h-4 w-4" />
              Wallets y permisos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={deskMode === 'topes'}
              className={deskMode === 'topes' ? 'is-on' : ''}
              onClick={() => setDeskMode('topes')}
            >
              <span className="fin-tope-logos" aria-hidden="true">
                <AssetLogo code="XLM" className="h-4 w-4" />
                <AssetLogo code="USDC" className="h-4 w-4" />
                <AssetLogo code="EURC" className="h-4 w-4" />
              </span>
              Topes de retiro
            </button>
          </div>
          {deskMode === 'wallets' ? (
            <>
              {needsCreatorPower ? (
                <Alert tone="error">
                  Esta caja todavía usa el modelo viejo: cualquier cambio de firmantes pide
                  firmas de toda la familia.
                  <div className="mt-3">
                    <Button
                      variant="black"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        void startSetSignerFlow({
                          key: pool.creator,
                          weight: pool.highThreshold,
                          after: async () => {
                            setOk(
                              'Poder del creator activado: los cambios de wallets son tuyos, sin votación.',
                            )
                          },
                        }).catch(() => undefined)
                      }}
                    >
                      Activar poder del creator (una sola vez)
                    </Button>
                    <p className="mt-2 text-xs leading-4 text-white/55">
                      Pide tu firma + la de un familiar (la última "votación"). Después
                      vas a poder cambiar permisos y dar de baja wallets sin que firme nadie más.
                    </p>
                  </div>
                </Alert>
              ) : null}
              <p className="fin-card-hint">Quién deposita y quién firma retiros.</p>
              <div className="dash-feed">
                {(showAllWallets ? poolMembers : poolMembers.slice(0, 5)).map((member, index) => {
                  const savedName = memberLabel(member.publicKey, index + 1)
                  const isYou = member.publicKey === publicKey
                  const canManage = youAreCreator && member.publicKey !== pool.creator
                  const edit = memberEdits[member.publicKey]
                  const power = edit?.power ?? member.power
                  const removed = Boolean(edit?.remove)
                  const nick = edit?.label ?? labels[member.publicKey] ?? ''
                  const shownName = nick.trim() || savedName
                  return (
                    <div key={member.publicKey}>
                      <div className={`family-member ${removed ? 'is-removed' : ''}`}>
                        <span className="family-member-avatar" aria-hidden="true">
                          {shownName.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="member-name-row">
                            {nickEditKey === member.publicKey && canManage ? (
                              <TextInput
                                className="form-input member-nick"
                                value={nick}
                                autoFocus
                                onChange={(event) => {
                                  const value = event.target.value
                                  setMemberEdits((current) => ({
                                    ...current,
                                    [member.publicKey]: {
                                      label: value,
                                      power: current[member.publicKey]?.power ?? member.power,
                                      remove: current[member.publicKey]?.remove ?? false,
                                    },
                                  }))
                                }}
                                onBlur={() => setNickEditKey(null)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') setNickEditKey(null)
                                }}
                                placeholder={savedName}
                              />
                            ) : (
                              <p className="family-member-name">
                                {shownName}
                                {isYou ? ' (Vos)' : ''}
                              </p>
                            )}
                            {canManage ? (
                              <button
                                type="button"
                                className="member-pen"
                                aria-label={`Editar apodo de ${shownName}`}
                                onClick={() => setNickEditKey(member.publicKey)}
                              >
                                <IconPen className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <p className="family-member-key">
                            {truncateKey(member.publicKey, 5)}
                          </p>
                        </div>
                        {canManage ? (
                          <div className="member-tools">
                            <div className="member-perms" role="group" aria-label={`Permisos de ${shownName}`}>
                              {WALLET_POWERS.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  aria-pressed={power === option.id}
                                  className={power === option.id ? 'is-on' : ''}
                                  disabled={removed || Boolean(busy)}
                                  onClick={() => {
                                    setMemberEdits((current) => ({
                                      ...current,
                                      [member.publicKey]: {
                                        label: current[member.publicKey]?.label ?? labels[member.publicKey] ?? '',
                                        power: option.id,
                                        remove: false,
                                      },
                                    }))
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="member-drop"
                              disabled={Boolean(busy)}
                              onClick={() => {
                                setMemberEdits((current) => ({
                                  ...current,
                                  [member.publicKey]: {
                                    label: current[member.publicKey]?.label ?? labels[member.publicKey] ?? '',
                                    power: current[member.publicKey]?.power ?? member.power,
                                    remove: !(current[member.publicKey]?.remove ?? false),
                                  },
                                }))
                              }}
                            >
                              {removed ? 'Deshacer' : 'Dar de baja'}
                            </button>
                          </div>
                        ) : (
                          <span className={`family-role-badge ${isYou ? 'is-you' : ''}`}>
                            {isYou ? 'Tu billetera' : walletPowerLabel(member.power)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
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
                <div className="mt-3">
                  <Button
                    variant="black"
                    disabled={Boolean(busy) || !memberEditsDirty}
                    onClick={() => void saveMemberEdits()}
                  >
                    Guardar cambios
                  </Button>
                </div>
              ) : null}
              {youAreCreator ? (
                <div className="member-add">
                  <button
                    type="button"
                    className="member-add-plus"
                    aria-expanded={addingWallet}
                    aria-label={addingWallet ? 'Cerrar alta de wallet' : 'Agregar wallet'}
                    onClick={() => setAddingWallet((open) => !open)}
                  >
                    <IconPlus className="h-4 w-4" />
                  </button>
                  {addingWallet ? (
                    <div className="mt-3 space-y-2.5">
                      <Field label="Wallet">
                        <TextInput
                          value={newSignerKey}
                          onChange={(event) => setNewSignerKey(event.target.value)}
                          placeholder="G…"
                          spellCheck={false}
                        />
                      </Field>
                      <Field label="Apodo">
                        <TextInput
                          value={newSignerNick}
                          onChange={(event) => setNewSignerNick(event.target.value)}
                          placeholder="Leito"
                        />
                      </Field>
                      <Field label="Permisos">
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
                        Agregar wallet
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="fin-empty">Solo quien creó la caja puede agregar wallets.</p>
              )}
            </>
          ) : (
            <>
              <p className="fin-card-hint">
                Máximo que puede mover una sola operación de retiro por activo.
              </p>
              <div className="mt-3 space-y-2.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <LimitField
                    code="XLM"
                    value={youAreCreator ? limitsDraft.xlm : pool.withdrawalLimit}
                    onChange={(value) =>
                      setLimitsDraft((current) => ({ ...current, xlm: value }))
                    }
                    disabled={!youAreCreator || limitsBusy}
                  />
                  <LimitField
                    code="USDC"
                    value={youAreCreator ? limitsDraft.usdc : pool.assetWithdrawalLimits?.USDC ?? ''}
                    onChange={(value) =>
                      setLimitsDraft((current) => ({ ...current, usdc: value }))
                    }
                    placeholder="sin tope: retiros bloqueados"
                    disabled={!youAreCreator || limitsBusy}
                  />
                  <LimitField
                    code="EURC"
                    value={youAreCreator ? limitsDraft.eurc : pool.assetWithdrawalLimits?.EURC ?? ''}
                    onChange={(value) =>
                      setLimitsDraft((current) => ({ ...current, eurc: value }))
                    }
                    placeholder="sin tope: retiros bloqueados"
                    disabled={!youAreCreator || limitsBusy}
                  />
                </div>
                {limitsError ? <Alert tone="error">{limitsError}</Alert> : null}
                {youAreCreator ? (
                  <div>
                    <Button
                      variant="black"
                      disabled={limitsBusy}
                      onClick={() => void saveLimits()}
                    >
                      Guardar topes
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs leading-4 text-white/55">
                    Solo quien creó la caja puede cambiar los topes.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        <section className="fin-card">
          <div className="fin-card-head">
            <h3 className="fin-card-title">
              <span><IconActivity className="h-4 w-4" /></span>
              Historial de movimientos
            </h3>
            {incoming.length > 5 ? (
              <button
                type="button"
                className="dash-more"
                onClick={() => setShowAllMoves((open) => !open)}
              >
                {showAllMoves ? 'Ver menos' : 'Ver todos'}
              </button>
            ) : null}
          </div>
          {pending ? (
            <div className="fin-pending">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink">En votación</p>
              <p className="mt-1 font-semibold">
                {pendingLabel(pending.kind)}
                {pending.amount ? ` · ${pending.amount} ${pending.asset ?? 'XLM'}` : ''}
              </p>
              <p className="mt-1 text-sm text-muted">
                {pending.signedBy.length} de {pool.medThreshold} firmas
              </p>
            </div>
          ) : null}
          {incoming.length === 0 && !pending ? (
            <p className="fin-empty">Todavía no hay depósitos en esta caja.</p>
          ) : incoming.length === 0 ? null : (
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>De / Para</th>
                    <th>Monto</th>
                    <th>Nota</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllMoves ? incoming : incoming.slice(0, 5)).map((item) => {
                    const incomingMove = item.to === pool.poolAccount
                    const party = incomingMove ? item.from : item.to
                    return (
                      <tr key={item.id}>
                        <td>{formatDate(item.createdAt)}</td>
                        <td>{incomingMove ? 'Depósito' : 'Retiro'}</td>
                        <td>
                          {movementLabel(party)}
                          <span className="block font-mono text-xs text-muted">
                            {truncateKey(party, 4)}
                          </span>
                        </td>
                        <td className={incomingMove ? 'is-in' : 'is-out'}>
                          {incomingMove ? '+' : '−'}
                          {formatAmount(item.amount, displayAssetCode(item.assetCode))}
                        </td>
                        <td>{item.note || item.memo || '—'}</td>
                        <td>
                          <TxExplorerLink hash={item.transactionHash} onDark />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <BlendYieldChart blend={blend} idleXlm={idleXlm} />
      </div>
    </div>
  )
}

function BlendYieldChart({
  blend,
  idleXlm,
}: {
  blend: BlendPosition | null | undefined
  idleXlm: string | null
}) {
  const model = blend ? blendYieldModel(blend, idleXlm) : null
  const steps = model && model.capital > 0 ? yieldSteps(model) : []
  const [active, setActive] = useState(4)
  const index = Math.min(active, Math.max(steps.length - 1, 0))
  const step = steps[index]

  return (
    <section className="fin-card fin-yield" aria-label="Rendimiento de XLM en Blend">
      <div className="fin-yield-head">
        <div>
          <h3 className="fin-yield-title">Curva de rendimiento</h3>
          <p className="fin-card-hint">
            Interés ya generado frente al que suma el XLM ocioso
          </p>
        </div>
        {steps.length > 1 ? (
          <div className="fin-yield-ranges" role="tablist" aria-label="Cuánto XLM ocioso entra a Blend">
            {steps.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={itemIndex === index}
                className={itemIndex === index ? 'is-on' : ''}
                onClick={() => setActive(itemIndex)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {blend === undefined ? (
        <p className="fin-empty">Consultando Blend…</p>
      ) : !model ? (
        <p className="fin-empty">
          No pudimos leer Blend ahora. La curva sale del contrato en testnet.
        </p>
      ) : model.capital <= 0 ? (
        <p className="fin-empty">
          Esta caja todavía no tiene XLM en Blend.
          {model.idle > 0
            ? ` Hay ${formatAmount(String(model.idle), 'XLM')} ociosos que se pueden poner a rendir.`
            : ''}
        </p>
      ) : (
        <>
          <div className="fin-yield-legend">
            <span>
              <i className="is-upper" />
              Si entra el ocioso: {step ? formatAmount(String(step.totalInterest), 'XLM') : '—'}
            </span>
            <span>
              <i className="is-base" />
              Ya generado: {formatAmount(String(model.interest), 'XLM')}
              {model.rateLabel ? ` · ${model.rateLabel}` : ''}
            </span>
          </div>
          <YieldPlot model={model} steps={steps} active={index} onSelect={setActive} />
          {step ? <YieldReadout step={step} model={model} /> : null}
          <p className="fin-blend-note">{model.note}</p>
        </>
      )}
    </section>
  )
}

function YieldPlot({
  model,
  steps,
  active,
  onSelect,
}: {
  model: BlendYieldModel
  steps: YieldStep[]
  active: number
  onSelect: (index: number) => void
}) {
  const width = 440
  const height = 210
  const left = 8
  const right = 432
  const top = 18
  const base = 168
  const upperValues = steps.map((item) => item.totalInterest)
  const lowerValues = steps.map(() => model.interest)
  const peak = Math.max(...upperValues, ...lowerValues, 0.0000001)
  const floor = Math.min(...upperValues, ...lowerValues, 0)
  const span = Math.max(peak - floor, peak * 0.35, 0.0000001)
  const yMax = peak + span * 0.42
  const yMin = Math.max(0, floor - span * 0.38)
  const yOf = (value: number) => top + ((yMax - value) / (yMax - yMin)) * (base - top)
  const xOf = (itemIndex: number) => {
    if (steps.length <= 1) return (left + right) / 2
    return left + ((right - left) * itemIndex) / (steps.length - 1)
  }
  const upper = steps.map((item, itemIndex) => ({
    x: xOf(itemIndex),
    y: yOf(item.totalInterest),
  }))
  const lower = steps.map((_, itemIndex) => ({
    x: xOf(itemIndex),
    y: yOf(model.interest),
  }))
  const upperLine = smoothThrough(upper)
  const lowerLine = smoothThrough(lower)
  const upperFill = upperLine
    ? `${upperLine} L ${upper[upper.length - 1].x} ${base} L ${upper[0].x} ${base} Z`
    : ''
  const lowerFill = lowerLine
    ? `${lowerLine} L ${lower[lower.length - 1].x} ${base} L ${lower[0].x} ${base} Z`
    : ''

  return (
    <div className="fin-yield-plot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={model.note}>
        <defs>
          <linearGradient id="fin-yield-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e2b34a" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#8a6a2e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#8a6a2e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fin-yield-cyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ec6d6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#12343a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {lowerFill ? <path d={lowerFill} fill="url(#fin-yield-cyan)" /> : null}
        {upperFill ? <path d={upperFill} fill="url(#fin-yield-gold)" /> : null}
        {lowerLine ? <path d={lowerLine} className="fin-yield-line is-base" /> : null}
        {upperLine ? <path d={upperLine} className="fin-yield-line is-upper" /> : null}
        {upper.map((point, itemIndex) => {
          const on = itemIndex === active
          const basePoint = lower[itemIndex]
          return (
            <g key={steps[itemIndex].id} className="fin-yield-point" onClick={() => onSelect(itemIndex)}>
              {on ? (
                <>
                  <circle cx={point.x} cy={point.y} r="6.5" className="fin-yield-ring is-upper" />
                  <circle cx={basePoint.x} cy={basePoint.y} r="6.5" className="fin-yield-ring is-base" />
                </>
              ) : null}
              <text
                x={point.x}
                y={196}
                textAnchor={itemIndex === 0 ? 'start' : itemIndex === steps.length - 1 ? 'end' : 'middle'}
                className={on ? 'fin-yield-label is-on' : 'fin-yield-label'}
                fill={on ? '#ffe14a' : '#f4f0ff'}
                fontSize="11"
              >
                {steps[itemIndex].label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function YieldReadout({ step, model }: { step: YieldStep; model: BlendYieldModel }) {
  const rows = [
    ['Entran a Blend', step.idleIn, false],
    ['Interés extra', step.extra, true],
    ['Interés total', step.totalInterest, true],
    ['Valor de la posición', step.position, false],
  ] as const
  return (
    <div className="fin-yield-readout">
      <p className="fin-yield-readout-kicker">
        {step.share === 0 ? 'Hoy, sin mover el ocioso' : `${step.label} del XLM ocioso`}
        {model.rateLabel ? ` · ritmo ${model.rateLabel}` : ''}
      </p>
      <div className="fin-yield-readout-grid">
        {rows.map(([label, value, yieldTone]) => (
          <div key={label} className={yieldTone ? 'fin-blend-stat is-yield' : 'fin-blend-stat'}>
            <p>{label}</p>
            <strong title={fullAmountTitle(value, 'XLM')}>
              {formatAmount(String(value), 'XLM')}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

type BlendYieldModel = {
  capital: number
  interest: number
  idle: number
  possibleExtra: number
  rateLabel: string | null
  note: string
}

type YieldStep = {
  id: string
  label: string
  share: number
  idleIn: number
  extra: number
  totalInterest: number
  position: number
}

function blendYieldModel(blend: BlendPosition, idleXlm: string | null): BlendYieldModel {
  const capital = finiteAmount(blend.capital)
  const interest = finiteAmount(blend.interestEarned)
  const idle = finiteAmount(idleXlm ?? 0)
  const ratio = capital > 0 ? interest / capital : 0
  const possibleExtra = idle > 0 && ratio > 0 ? idle * ratio : 0
  const rateLabel = ratio > 0
    ? `+${(ratio * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
    : null
  let note = 'Cuando haya XLM en Blend, el gráfico usa el interés leído del contrato.'
  if (capital > 0 && interest > 0 && possibleExtra > 0) {
    note = 'Hoy es el interés que Blend ya sumó. 25% a 100% estima el interés extra si entra esa parte del XLM ocioso, al mismo ritmo. No es una tasa anual fija.'
  } else if (capital > 0 && interest > 0) {
    note = 'Blend ya sumó interés sobre el XLM puesto. No queda XLM ocioso para armar los escenarios.'
  } else if (capital > 0) {
    note = 'El XLM está en Blend y el contrato todavía no muestra interés acumulado. Los escenarios aparecen cuando ese interés exista.'
  }
  return { capital, interest, idle, possibleExtra, rateLabel, note }
}

function yieldSteps(model: BlendYieldModel): YieldStep[] {
  const shares = model.idle > 0 && model.interest > 0 ? [0, 0.25, 0.5, 0.75, 1] : [0]
  const labels = ['Hoy', '25%', '50%', '75%', '100%']
  const ratio = model.capital > 0 ? model.interest / model.capital : 0
  return shares.map((share, index) => {
    const idleIn = model.idle * share
    const extra = idleIn * ratio
    return {
      id: String(share),
      label: labels[index] ?? 'Hoy',
      share,
      idleIn,
      extra,
      totalInterest: model.interest + extra,
      position: model.capital + idleIn + model.interest + extra,
    }
  })
}

function finiteAmount(value: string | number): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function smoothThrough(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const after = points[index + 2] ?? next
    const c1x = current.x + (next.x - previous.x) / 6
    const c1y = current.y + (next.y - previous.y) / 6
    const c2x = next.x - (after.x - current.x) / 6
    const c2y = next.y - (after.y - current.y) / 6
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`
  }
  return path
}

function blendYieldLabel(blend: BlendPosition): string | null {
  const capital = Number(blend.capital)
  const interest = Number(blend.interestEarned)
  if (!Number.isFinite(capital) || !Number.isFinite(interest) || capital <= 0 || interest <= 0) {
    return null
  }
  const percent = (interest / capital) * 100
  if (!Number.isFinite(percent)) return null
  return `+${percent.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
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
  tone = 'light',
}: {
  value: WalletPower
  onChange: (power: WalletPower) => void
  tone?: 'light' | 'dark'
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Qué puede hacer esta wallet">
      {WALLET_POWERS.map((option) => {
        const selected = option.id === value
        const palette =
          tone === 'dark'
            ? selected
              ? 'bg-yellow text-ink'
              : 'border border-white/15 bg-white/10 text-white hover:border-yellow/50 hover:bg-white/15'
            : selected
              ? 'bg-purple text-white'
              : 'border border-purple/20 bg-white/50 text-ink hover:border-purple/45 hover:bg-white/80'
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${palette}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

