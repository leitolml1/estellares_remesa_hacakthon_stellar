import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FreighterCta } from '../components/FreighterCta'
import { PageStage } from '../components/layout/PageStage'
import { Alert } from '../components/ui/Alert'
import { AssetChips, AssetLogo } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import {
  DashBoard,
  DashCard,
  DashCol,
  DashFeedItem,
  DashHero,
} from '../components/ui/Dash'
import { Field, TextInput } from '../components/ui/Field'
import { Spinner } from '../components/ui/Spinner'
import { TxStepper } from '../components/ui/TxStepper'
import { useWallet } from '../context/WalletContext'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import {
  buildVaultDeposit,
  buildVaultWithdraw,
  getCommunityPool,
  getPoolDonations,
  getVaultLeaderboard,
  getVaultState,
  humanizeApiError,
  submitVaultTx,
} from '../lib/api'
import {
  displayAssetCode,
  getKnownAsset,
  KNOWN_ASSETS,
  knownAssetBalance,
  toPaymentAsset,
  xlmEquivalent,
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
import { humanizeFreighterError, signTransactionWithFreighter } from '../lib/freighter'
import {
  buildChangeTrustXdr,
  buildPaymentXdr,
  checkTrustline,
  submitSignedXdr,
} from '../lib/horizon'
import type { DonorEntry, PaymentRecord, PoolDetail, VaultState } from '../types'

export function PoolDetailPage() {
  const [head, setHead] = useState({ title: 'Pool', kicker: '' })
  return (
    <PageStage
      layout="dashboard"
      kicker={head.kicker || undefined}
      title={head.title}
      subtitle="Cualquiera puede aportar con el link, sin registrarse."
    >
      <PoolDetailContent onHead={setHead} />
    </PageStage>
  )
}

function PoolDetailContent({
  onHead,
}: {
  onHead: (head: { title: string; kicker: string }) => void
}) {
  const { shortCode = '' } = useParams()
  const { publicKey, balances, refreshBalances } = useWallet()
  const [detail, setDetail] = useState<PoolDetail | null>(null)
  const [amount, setAmount] = useState('')
  const [assetCode, setAssetCode] = useState<KnownAssetCode>('XLM')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [donations, setDonations] = useState<PaymentRecord[]>([])
  const [vault, setVault] = useState<VaultState | null>(null)
  const [vaultBusy, setVaultBusy] = useState<string | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [vaultOk, setVaultOk] = useState<string | null>(null)
  const [vaultHash, setVaultHash] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawDestination, setWithdrawDestination] = useState('')
  const [actionTab, setActionTab] = useState<'donate' | 'withdraw' | 'share'>('donate')
  const [donationStatus, setDonationStatus] = useState<
    'idle' | 'building' | 'signing' | 'submitting' | 'ok'
  >('idle')
  const [donationHash, setDonationHash] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<DonorEntry[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const POLL_INTERVAL_MS = 15000

  // Los paneles (.unfold-down / .stage-card) nacen con opacity: 0 en el CSS
  // y solo los revela este hook. Como el detalle se monta DESPUES del fetch,
  // el key tiene que cambiar cuando la data llega: si dependiera solo de
  // shortCode, el efecto correria con el Spinner puesto (sin paneles que
  // animar) y nunca se re-ejecutaria al montar el contenido real.
  const reveal = useUnfoldDown(
    shortCode ? `${shortCode}:${detail ? 'ready' : 'loading'}` : 'pool-detail',
  )

  useEffect(() => {
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setError('No pudimos cargar el pool')
        setLoading(false)
      }
    }, 12000)
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const next = await getCommunityPool(shortCode)
        if (cancelled) return
        window.clearTimeout(timeoutId)
        setDetail(next)
        onHead({ title: next.pool.title, kicker: next.pool.shortCode })
        try {
          const records = await getPoolDonations(shortCode, 20)
          if (!cancelled) setDonations(records)
        } catch {
          if (!cancelled) setDonations([])
        }
      } catch (caught) {
        if (!cancelled) {
          setDetail(null)
          setError(humanizeApiError(caught))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [shortCode, retryToken, onHead])

  // Refresh silencioso cada 15s: progreso del pool (que se re-sincroniza
  // contra Horizon en el backend), donaciones, estado del vault y
  // leaderboard. No toca flags de loading: es progreso "en vivo".
  const poolRegisteredForPoll = detail?.pool.vaultRegistered ?? false
  useEffect(() => {
    let cancelled = false
    async function refreshSilently() {
      try {
        const next = await getCommunityPool(shortCode)
        if (cancelled) return
        setDetail(next)
      } catch {
        // El refresh en vivo es best-effort: si falla, queda lo ultimo.
      }
      try {
        const records = await getPoolDonations(shortCode, 20)
        if (cancelled) return
        setDonations(records)
      } catch {
        // idem
      }
      if (poolRegisteredForPoll) {
        try {
          const next = await getVaultLeaderboard(shortCode)
          if (!cancelled) setLeaderboard(next)
        } catch {
          // sin leaderboard, sigue el fallback clasico
        }
        try {
          const state = await getVaultState(shortCode)
          if (!cancelled) setVault(state)
        } catch {
          // idem: el estado previo queda en pantalla
        }
      }
    }
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshSilently()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [shortCode, poolRegisteredForPoll])

  // Tick lento para el countdown del deadline.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const pool = detail?.pool
  const poolRegistered = pool?.vaultRegistered ?? false
  const selectedAsset = getKnownAsset(assetCode)
  const suggestedAmount = amount.trim() && isStellarAmount(amount) ? amount.trim() : undefined

  async function refreshVaultData() {
    try {
      setVault(await getVaultState(shortCode))
    } catch {
      setVault(null)
    }
    try {
      setLeaderboard(await getVaultLeaderboard(shortCode))
    } catch {
      setLeaderboard(null)
    }
  }

  useEffect(() => {
    if (!poolRegistered) {
      setLeaderboard(null)
      setVault(null)
      return
    }
    let cancelled = false
    getVaultState(shortCode)
      .then((state) => {
        if (!cancelled) setVault(state)
      })
      .catch(() => {
        if (!cancelled) setVault(null)
      })
    getVaultLeaderboard(shortCode)
      .then((donors) => {
        if (!cancelled) setLeaderboard(donors)
      })
      .catch(() => {
        if (!cancelled) setLeaderboard(null)
      })
    return () => {
      cancelled = true
    }
  }, [shortCode, poolRegistered])

  useEffect(() => {
    const asset = getKnownAsset(assetCode)
    if (!pool || pool.vaultRegistered || !asset?.issuer) {
      setHasTrustline(null)
      return
    }
    const issuer = asset.issuer
    const code = asset.code
    const walletPublicKey = pool.walletPublicKey
    let cancelled = false
    async function loadTrust() {
      try {
        const result = await checkTrustline(walletPublicKey, code, issuer)
        if (!cancelled) setHasTrustline(result.hasTrustline)
      } catch {
        if (!cancelled) setHasTrustline(false)
      }
    }
    void loadTrust()
    return () => {
      cancelled = true
    }
  }, [pool, assetCode])

  // Fuente de verdad: para pools del vault el progreso vive on-chain
  // (equivalent_total / complete). Horizon solo ve pagos a la wallet, y
  // las donaciones nuevas van al contrato — por eso la barra quedaba en 0.
  const youArePoolWallet = Boolean(publicKey && pool && publicKey === pool.walletPublicKey)
  const selfDonation = Boolean(
    publicKey && pool && (publicKey === pool.creator || publicKey === pool.walletPublicKey),
  )
  const vaultRaised = useMemo(() => {
    if (vault?.equivalentTotal != null && vault.equivalentTotal !== '') {
      const n = Number(vault.equivalentTotal)
      if (Number.isFinite(n)) return n
    }
    if (leaderboard && leaderboard.length > 0) {
      return leaderboard.reduce((sum, entry) => sum + Number(entry.donatedXlmEquivalent || 0), 0)
    }
    return null
  }, [vault, leaderboard])
  const horizonRaised = useMemo(() => {
    if (detail?.progress.xlmEquivalentTotal != null) {
      return Number(detail.progress.xlmEquivalentTotal)
    }
    const xlm = detail?.progress.totalByAsset.find(
      (item) => item.assetCode === 'XLM' || item.assetCode === 'native',
    )
    return Number(xlm?.total ?? 0)
  }, [detail])
  const xlmRaised = poolRegistered && vaultRaised != null ? vaultRaised : horizonRaised
  const goal = pool?.goalAmount
    ? Number(pool.goalAmount)
    : vault?.goal
      ? Number(vault.goal)
      : 0
  const completed = Boolean(
    vault?.complete ||
      detail?.progress.completed ||
      (goal > 0 && xlmRaised >= goal),
  )
  const remaining = goal > 0 ? Math.max(0, goal - xlmRaised) : 0
  const progress = completed
    ? 100
    : goal > 0
      ? Math.min(99.9, Math.max(0, (xlmRaised / goal) * 100))
      : 0
  // Deadline informativo: las reglas de cierre reales viven on-chain.
  let deadlineLabel: string | undefined
  if (pool?.deadline && !completed) {
    const deadlineMs = new Date(pool.deadline).getTime()
    if (!Number.isNaN(deadlineMs)) {
      const diffMs = deadlineMs - now
      const days = Math.floor(Math.abs(diffMs) / 86_400_000)
      const hours = Math.floor((Math.abs(diffMs) % 86_400_000) / 3_600_000)
      deadlineLabel =
        diffMs <= 0
          ? `Cerrada hace ${days > 0 ? `${days}d ` : ''}${hours}h`
          : days > 0
            ? `Cerrada en ${days}d ${hours}h`
            : `Cerrada en ${hours}h`
    }
  }
  const remainLabel = [
    completed
      ? 'Meta cumplida'
      : goal > 0
        ? `Faltan ${formatAmount(String(remaining), 'XLM')} para completar meta`
        : undefined,
    deadlineLabel,
  ]
    .filter(Boolean)
    .join(' · ') || undefined
  const availableAssets = KNOWN_ASSETS.map((asset) => {
    const fromVault = vault?.assets.find((item) => item.assetCode === asset.code)
    if (fromVault && Number(fromVault.available) > 0) {
      return { code: asset.code, amount: fromVault.available }
    }
    const fromProgress = detail?.progress.totalByAsset.find(
      (item) => displayAssetCode(item.assetCode) === asset.code,
    )
    return { code: asset.code, amount: fromProgress?.total ?? '0' }
  }).filter((item) => Number(item.amount) > 0)
  const canOpenTrustline = Boolean(
    publicKey && pool && publicKey === pool.walletPublicKey && selectedAsset?.issuer,
  )

  // Leaderboard: on-chain para pools vault, agregado client-side (sobre los
  // ultimos aportes) para los clasicos.
  const topDonors = useMemo(() => {
    if (poolRegistered && leaderboard && leaderboard.length > 0) {
      return leaderboard
        .slice(0, 5)
        .map((entry) => ({
          key: entry.publicKey,
          label: '≈' + formatAmount(entry.donatedXlmEquivalent, 'XLM'),
        }))
    }
    const totals = new Map<string, number>()
    for (const donation of donations) {
      const code = displayAssetCode(donation.assetCode)
      const current = totals.get(donation.from) ?? 0
      totals.set(donation.from, current + xlmEquivalent(donation.amount, code))
    }
    return [...totals.entries()]
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, total]) => ({
        key,
        label: '≈' + formatAmount(String(total), 'XLM'),
      }))
  }, [poolRegistered, leaderboard, donations])

  async function copyShare(kind: 'link' | 'code') {
    if (!pool) return
    const value =
      kind === 'code'
        ? pool.shortCode
        : `${window.location.origin}/pools/${pool.shortCode}`
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1600)
  }

  async function openTrustline() {
    if (!publicKey || !selectedAsset?.issuer) return
    try {
      setError(null)
      setOk(null)
      setBusy(`Activando ${selectedAsset.code}…`)
      const { xdr } = await buildChangeTrustXdr({
        sourcePublicKey: publicKey,
        asset: toPaymentAsset(selectedAsset),
      })
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      await submitSignedXdr(signed.signedXdr)
      setHasTrustline(true)
      setOk(`La wallet ya acepta ${selectedAsset.code}.`)
    } catch (caught) {
      setError(humanizeFlowError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function depositFromFreighter() {
    if (!publicKey || !pool || !selectedAsset) return
    if (publicKey === pool.creator || publicKey === pool.walletPublicKey) {
      setError('Creaste este pool: no podés donarte a vos mismo.')
      return
    }
    if (completed) {
      setError('Meta alcanzada: ya no se puede donar.')
      return
    }
    if (!suggestedAmount) {
      setError('Ingresá un monto válido para depositar desde Freighter.')
      return
    }
    try {
      setError(null)
      setOk(null)
      setDonationStatus('building')
      setDonationHash(null)

      if (pool.vaultRegistered) {
        // Deposito al vault: Django arma la invocacion al contrato, la
        // firma el donante con Freighter y el contrato mueve los tokens.
        if (selectedAsset.issuer && knownAssetBalance(balances?.balances, selectedAsset) == null) {
          setError(
            `Tu wallet no tiene ${selectedAsset.code}: activá el activo y conseguí saldo antes de donar.`,
          )
          return
        }
        setBusy('Armando el depósito…')
        const { xdr } = await buildVaultDeposit(shortCode, {
          donor_public_key: publicKey,
          asset_code: selectedAsset.code,
          amount: suggestedAmount,
        })
        setBusy('Firmá el depósito en tu billetera…')
        setDonationStatus('signing')
        const signed = await signTransactionWithFreighter(
          xdr,
          TESTNET_NETWORK_PASSPHRASE,
          publicKey,
        )
        setBusy('Enviando a Soroban…')
        setDonationStatus('submitting')
        const result = await submitVaultTx(shortCode, signed.signedXdr)
        setDonationStatus('ok')
        setDonationHash(result.hash)
        setOk(`Depósito confirmado. ${truncateKey(result.hash, 4)}`)
        const next = await getCommunityPool(shortCode)
        setDetail(next)
        void refreshVaultData()
        void refreshBalances()
        return
      }

      // Pool clasico: pago directo a la wallet con el memo del short code.
      setBusy('Armando depósito…')
      const asset = toPaymentAsset(selectedAsset)
      const { xdr } = await buildPaymentXdr({
        sourcePublicKey: publicKey,
        destinationPublicKey: pool.walletPublicKey,
        sendAsset: asset,
        sendAmount: suggestedAmount,
        destAsset: asset,
        destMin: suggestedAmount,
        memo: pool.shortCode,
      })
      setBusy('Firmá el depósito en tu billetera…')
      setDonationStatus('signing')
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      setBusy('Enviando a Horizon…')
      setDonationStatus('submitting')
      const result = await submitSignedXdr(signed.signedXdr)
      setDonationStatus('ok')
      setDonationHash(result.hash)
      setOk(`Depósito confirmado. ${truncateKey(result.hash, 4)}`)
      const next = await getCommunityPool(shortCode)
      setDetail(next)
    } catch (caught) {
      setError(humanizeFlowError(caught))
      setDonationStatus('idle')
      setDonationHash(null)
    } finally {
      setBusy(null)
    }
  }

  async function withdrawFromVault() {
    if (!publicKey || !pool || publicKey !== pool.walletPublicKey) return
    const destination = withdrawDestination.trim() || publicKey
    if (!isStellarPublicKey(destination)) {
      setVaultError('El destino del retiro tiene que ser una public key G…')
      return
    }
    if (!isStellarAmount(withdrawAmount)) {
      setVaultError('Ingresá un monto válido para retirar.')
      return
    }
    const available = vault?.assets.find((item) => item.assetCode === assetCode)?.available
    if (available != null && Number(withdrawAmount) > Number(available)) {
      setVaultError(`Hay ${formatAmount(available, assetCode)} disponible.`)
      return
    }
    try {
      setVaultError(null)
      setVaultOk(null)
      setVaultHash(null)
      setVaultBusy('Armando el retiro…')
      const { xdr } = await buildVaultWithdraw(shortCode, {
        owner_public_key: publicKey,
        asset_code: assetCode,
        destination_public_key: destination,
        amount: withdrawAmount.trim(),
      })
      setVaultBusy('Firmá el retiro en Freighter…')
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      setVaultBusy('Enviando a Soroban…')
      const result = await submitVaultTx(shortCode, signed.signedXdr)
      setVaultOk('Retiro confirmado.')
      setVaultHash(result.hash)
      setWithdrawAmount('')
      await refreshVaultData()
      void refreshBalances()
    } catch (caught) {
      setVaultError(humanizeFlowError(caught))
    } finally {
      setVaultBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="dash-board">
        <div className="dash-hero animate-pulse">
          <p className="dash-hero-kicker">Cargando</p>
          <p className="dash-hero-value">—</p>
        </div>
        <DashCard title="Pool" hint="Estamos trayendo el progreso y los aportes.">
          <p className="dash-empty">Un segundo…</p>
        </DashCard>
      </div>
    )
  }

  if (error || !detail || !pool) {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error ?? 'No encontramos ese pool.'}</Alert>
        <Button variant="ghost" onClick={() => setRetryToken((n) => n + 1)}>
          Reintentar
        </Button>
      </div>
    )
  }

  const shareBar = (
    <div className="flex flex-wrap gap-2">
      <Button variant="white" onClick={() => void copyShare('link')}>
        {copied === 'link' ? 'Link copiado' : 'Copiar link'}
      </Button>
      <Button variant="white" onClick={() => void copyShare('code')}>
        {copied === 'code' ? 'Código copiado' : 'Copiar código'}
      </Button>
    </div>
  )
  const tabs = [
    ...(!completed && !selfDonation ? [{ id: 'donate' as const, label: 'Aportar' }] : []),
    ...(pool.vaultRegistered && youArePoolWallet
      ? [{ id: 'withdraw' as const, label: 'Retirar' }]
      : []),
    { id: 'share' as const, label: 'Compartir' },
  ]
  const activeTab = tabs.some((tab) => tab.id === actionTab)
    ? actionTab
    : youArePoolWallet && pool.vaultRegistered
      ? 'withdraw'
      : tabs[0].id

  return (
    <div ref={reveal}>
      <DashBoard>
        <DashCol>
          <DashHero
            compact
            kicker={completed ? 'Meta cumplida' : 'Recaudado'}
            remain={remainLabel}
            value={formatAmount(String(xlmRaised), 'XLM')}
            valueTitle={fullAmountTitle(xlmRaised, 'XLM')}
            percent={goal > 0 ? `${Math.round(progress)}%` : undefined}
            progress={goal > 0 ? progress : undefined}
            extraLabel={availableAssets.length > 0 ? 'También en el pool' : undefined}
            extra={
              availableAssets.length > 0
                ? availableAssets.map((item) => (
                    <span key={item.code} className="dash-hero-asset">
                      <AssetLogo code={item.code} className="h-5 w-5" />
                      <span>{formatAmount(item.amount, item.code)}</span>
                    </span>
                  ))
                : undefined
            }
          />
          <DashCard
            title="Top donantes"
            hint={
              poolRegistered
                ? 'Aportes acumulados en XLM equivalente, leídos on-chain del vault.'
                : 'Agregado sobre los últimos aportes entrantes, en XLM equivalente.'
            }
          >
            {topDonors.length === 0 ? (
              <p className="dash-empty">Todavía no hay aportes.</p>
            ) : (
              <div className="dash-feed">
                {topDonors.map((donor, index) => (
                  <DashFeedItem
                    key={`${donor.key}-${index}`}
                    fromLabel={`Puesto ${index + 1}`}
                    from={truncateKey(donor.key, 4)}
                    amount={donor.label}
                  />
                ))}
              </div>
            )}
          </DashCard>
        </DashCol>
        <DashCol>
          <DashCard
            title={
              activeTab === 'withdraw'
                ? 'Retirar'
                : activeTab === 'share'
                  ? 'Compartir'
                  : completed
                    ? 'Cerrado'
                    : 'Aportar'
            }
            hint={
              completed
                ? 'Meta alcanzada: ya no se puede donar.'
                : activeTab === 'withdraw'
                  ? 'Retirá al momento, firmando con la wallet del pool.'
                  : activeTab === 'share'
                    ? 'Cualquiera aporta con el link, sin registrarse.'
                    : 'Elegí el activo y el monto. Tu billetera firma el depósito.'
            }
          >
            {completed ? (
              <div className="mb-3">
                <Alert tone="ok">Meta alcanzada: ya no se puede donar.</Alert>
              </div>
            ) : null}
            <div className="dash-tabs" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`dash-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActionTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTab === 'donate' || activeTab === 'withdraw' ? (
              <AssetChips value={assetCode} onChange={setAssetCode} />
            ) : null}
            {activeTab === 'donate' ? (
              <div className="mt-3 space-y-3">
                <Field label="Monto">
                  <TextInput
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </Field>
                {!pool.vaultRegistered && hasTrustline === false ? (
                  <Alert tone="error">
                    La wallet que recibe todavía no acepta {assetCode}.
                    {canOpenTrustline
                      ? ' Activalo con tu billetera desde esta misma cuenta.'
                      : ' Quien recibe tiene que activar el activo en su billetera.'}
                  </Alert>
                ) : null}
                {error ? <Alert tone="error">{error}</Alert> : null}
                {ok ? (
                  <Alert tone="ok">
                    {ok}
                    {donationHash ? (
                      <>
                        {' '}
                        <a
                          className="tx-link"
                          href={explorerTxUrl(donationHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver en testnet
                        </a>
                      </>
                    ) : null}
                  </Alert>
                ) : null}
                {donationStatus !== 'idle' ? (
                  <TxStepper status={donationStatus} />
                ) : busy ? (
                  <Spinner label={busy} />
                ) : null}
                {donationStatus === 'ok' && donationHash ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/track/${donationHash}`}>
                      <Button variant="white">Seguí tu aporte →</Button>
                    </Link>
                    <span className="text-sm text-white/55">
                      Compartilo con quien administra el pool.
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {canOpenTrustline && hasTrustline === false ? (
                    <Button variant="black" disabled={Boolean(busy)} onClick={() => void openTrustline()}>
                      Activar {assetCode}
                    </Button>
                  ) : null}
                  {publicKey ? (
                    <Button
                      disabled={Boolean(busy) || selfDonation}
                      onClick={() => void depositFromFreighter()}
                    >
                      Aportar
                    </Button>
                  ) : (
                    <FreighterCta />
                  )}
                </div>
                {selfDonation ? (
                  <p className="text-sm leading-5 text-white/55">
                    Creaste este pool: no podés aportarte a vos mismo.
                  </p>
                ) : null}
              </div>
            ) : null}
            {activeTab === 'withdraw' ? (
              <div className="mt-3 space-y-3">
                <Field label={`Monto (${assetCode})`}>
                  <TextInput
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Destino" hint="Vacío = tu wallet conectada.">
                  <TextInput
                    value={withdrawDestination}
                    onChange={(event) => setWithdrawDestination(event.target.value)}
                    placeholder={`${truncateKey(publicKey ?? '', 4)} (tu wallet)`}
                    spellCheck={false}
                  />
                </Field>
                {vaultError ? <Alert tone="error">{vaultError}</Alert> : null}
                {vaultOk ? (
                  <Alert tone="ok">
                    {vaultOk}
                    {vaultHash ? (
                      <>
                        {' '}
                        <a
                          className="tx-link"
                          href={explorerTxUrl(vaultHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver en testnet
                        </a>
                      </>
                    ) : null}
                  </Alert>
                ) : null}
                {vaultBusy ? <Spinner label={vaultBusy} /> : null}
                <Button disabled={Boolean(vaultBusy)} onClick={() => void withdrawFromVault()}>
                  Retirar
                </Button>
              </div>
            ) : null}
            {activeTab === 'share' ? (
              <div className="dash-share-row">
                <p>
                  {completed
                    ? 'La meta se cumplió. Compartí el resultado con quien aportó.'
                    : 'Copiá el link o el código corto.'}
                </p>
                {shareBar}
                {completed && publicKey ? (
                  <Link to="/pools/nuevo">
                    <Button variant="white">Crear otro pool</Button>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </DashCard>
        </DashCol>
      </DashBoard>
    </div>
  )
}

function humanizeFlowError(error: unknown): string {
  if (error instanceof Error && error.name.startsWith('Freighter')) {
    return humanizeFreighterError(error)
  }
  return humanizeApiError(error)
}
