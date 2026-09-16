import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
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
import { useWallet } from '../context/WalletContext'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import {
  buildVaultDeposit,
  buildVaultWithdraw,
  getCommunityPool,
  getPoolDonations,
  getVaultState,
  humanizeApiError,
  submitVaultTx,
} from '../lib/api'
import {
  buildPayUri,
  displayAssetCode,
  getKnownAsset,
  KNOWN_ASSETS,
  knownAssetBalance,
  toPaymentAsset,
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
import { humanizeFreighterError, signTransactionWithFreighter } from '../lib/freighter'
import {
  buildChangeTrustXdr,
  buildPaymentXdr,
  checkTrustline,
  submitSignedXdr,
} from '../lib/horizon'
import type { PaymentRecord, PoolDetail, VaultState } from '../types'

export function PoolDetailPage() {
  return (
    <PageStage
      layout="dashboard"
      kicker="Módulo 2"
      title="POOL"
      subtitle="Compartí el link o el short code: cualquiera puede ver el pool y donar, sin estar registrado."
    >
      <PoolDetailContent />
    </PageStage>
  )
}

function PoolDetailContent() {
  const { shortCode = '' } = useParams()
  const { publicKey, connecting, connect, balances, refreshBalances } = useWallet()
  const [detail, setDetail] = useState<PoolDetail | null>(null)
  const [amount, setAmount] = useState('')
  const [assetCode, setAssetCode] = useState<KnownAssetCode>('XLM')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [donations, setDonations] = useState<PaymentRecord[]>([])
  const [vault, setVault] = useState<VaultState | null>(null)
  const [vaultBusy, setVaultBusy] = useState<string | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [vaultOk, setVaultOk] = useState<string | null>(null)
  const [withdrawAssetCode, setWithdrawAssetCode] = useState<KnownAssetCode>('XLM')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawDestination, setWithdrawDestination] = useState('')

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
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const next = await getCommunityPool(shortCode)
        if (!cancelled) setDetail(next)
        // El feed de donaciones lo arma el backend: solo pagos ENTRANTES
        // con el memo del pool (mismo criterio que el conteo de progreso).
        // No se usa el historial completo de la wallet, que traeria gastos
        // y pagos que no corresponden al pool.
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
    }
  }, [shortCode])

  const pool = detail?.pool
  const poolRegistered = pool?.vaultRegistered ?? false
  const selectedAsset = getKnownAsset(assetCode)
  const suggestedAmount = amount.trim() && isStellarAmount(amount) ? amount.trim() : undefined
  const paymentUri = useMemo(() => {
    if (!pool || !selectedAsset) return ''
    if (pool.vaultRegistered) {
      // QR deep link: SEP-7 no puede invocar el contrato Soroban - el
      // donante escanea, abre esta pagina y deposita al vault con Freighter.
      return `${window.location.origin}/pools/${pool.shortCode}`
    }
    return buildPayUri({
      destination: pool.walletPublicKey,
      memo: pool.shortCode,
      amount: suggestedAmount,
      asset: selectedAsset,
    })
  }, [pool, selectedAsset, suggestedAmount])

  async function refreshVaultData() {
    try {
      setVault(await getVaultState(shortCode))
    } catch {
      setVault(null)
    }
  }

  useEffect(() => {
    if (!poolRegistered) {
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

  // Para pools migrados al vault, la fuente de verdad es el contrato: la
  // meta cumplida y el equivalente recaudado se leen de ahi, no de la sync
  // de Horizon (que para estos pools ya no ve los depositos nuevos).
  const completed = poolRegistered
    ? (vault?.complete ?? false)
    : (detail?.progress.completed ?? false)
  const xlmRaised = useMemo(() => {
    if (poolRegistered && vault?.equivalentTotal != null) {
      return Number(vault.equivalentTotal)
    }
    if (detail?.progress.xlmEquivalentTotal != null) {
      return Number(detail.progress.xlmEquivalentTotal)
    }
    const xlm = detail?.progress.totalByAsset.find(
      (item) => item.assetCode === 'XLM' || item.assetCode === 'native',
    )
    return Number(xlm?.total ?? 0)
  }, [detail, poolRegistered, vault])
  const goal = pool?.goalAmount ? Number(pool.goalAmount) : 0
  const remaining = goal > 0 ? Math.max(0, goal - xlmRaised) : 0
  const progress = goal > 0 ? (xlmRaised / goal) * 100 : 0
  const remainLabel = completed
    ? 'Meta cumplida'
    : goal > 0
      ? `Faltan ${formatAmount(String(remaining), 'XLM')} para completar meta`
      : undefined
  const availableAssets = KNOWN_ASSETS.map((asset) => {
    const fromVault = vault?.assets.find((item) => item.assetCode === asset.code)
    if (fromVault) {
      return { code: asset.code, amount: fromVault.available }
    }
    const fromProgress = detail?.progress.totalByAsset.find(
      (item) => displayAssetCode(item.assetCode) === asset.code,
    )
    return { code: asset.code, amount: fromProgress?.total ?? '0' }
  })
  const canOpenTrustline = Boolean(
    publicKey && pool && publicKey === pool.walletPublicKey && selectedAsset?.issuer,
  )
  const youArePoolWallet = Boolean(publicKey && pool && publicKey === pool.walletPublicKey)
  const selfDonation = Boolean(
    publicKey && pool && (publicKey === pool.creator || publicKey === pool.walletPublicKey),
  )

  async function shareUri() {
    if (navigator.share) {
      await navigator.share({ title: pool?.title, url: paymentUri })
      return
    }
    await navigator.clipboard.writeText(paymentUri)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function openTrustline() {
    if (!publicKey || !selectedAsset?.issuer) return
    try {
      setError(null)
      setOk(null)
      setBusy(`Abriendo trustline ${selectedAsset.code}…`)
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
    if (!suggestedAmount) {
      setError('Ingresá un monto válido para depositar desde Freighter.')
      return
    }
    try {
      setError(null)
      setOk(null)

      if (pool.vaultRegistered) {
        // Deposito al vault: Django arma la invocacion al contrato, la
        // firma el donante con Freighter y el contrato mueve los tokens.
        if (selectedAsset.issuer && knownAssetBalance(balances?.balances, selectedAsset) == null) {
          setError(
            `Tu wallet no tiene ${selectedAsset.code}: abrí la trustline y conseguí balance antes de donar.`,
          )
          return
        }
        setBusy('Armando depósito al vault…')
        const { xdr } = await buildVaultDeposit(shortCode, {
          donor_public_key: publicKey,
          asset_code: selectedAsset.code,
          amount: suggestedAmount,
        })
        setBusy('Firmá el depósito en Freighter…')
        const signed = await signTransactionWithFreighter(
          xdr,
          TESTNET_NETWORK_PASSPHRASE,
          publicKey,
        )
        setBusy('Enviando a Soroban…')
        const result = await submitVaultTx(shortCode, signed.signedXdr)
        setOk(`Depósito al vault confirmado. ${truncateKey(result.hash, 4)}`)
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
      setBusy('Firmá el depósito en Freighter…')
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      setBusy('Enviando a Horizon…')
      const result = await submitSignedXdr(signed.signedXdr)
      setOk(`Depósito confirmado. ${truncateKey(result.hash, 4)}`)
      const next = await getCommunityPool(shortCode)
      setDetail(next)
    } catch (caught) {
      setError(humanizeFlowError(caught))
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
    const available = vault?.assets.find((item) => item.assetCode === withdrawAssetCode)?.available
    if (available != null && Number(withdrawAmount) > Number(available)) {
      setVaultError(`El vault tiene ${formatAmount(available, '')} ${withdrawAssetCode} disponible.`)
      return
    }
    try {
      setVaultError(null)
      setVaultOk(null)
      setVaultBusy('Armando el retiro…')
      const { xdr } = await buildVaultWithdraw(shortCode, {
        owner_public_key: publicKey,
        asset_code: withdrawAssetCode,
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
      setVaultOk(`Retiro confirmado. ${truncateKey(result.hash, 4)}`)
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
    return <Spinner label="Cargando pool…" />
  }

  if (error || !detail || !pool) {
    return <Alert tone="error">{error ?? 'No encontramos ese pool.'}</Alert>
  }

  return (
    <div ref={reveal}>
      <DashBoard>
        <DashCol>
          <DashHero
            kicker="Recaudado"
            remain={remainLabel}
            value={formatAmount(String(xlmRaised), 'XLM')}
            percent={goal > 0 ? `${Math.round(progress)}%` : undefined}
            progress={goal > 0 ? progress : undefined}
            extraLabel="También en el pool"
            extra={availableAssets.map((item) => (
              <span key={item.code} className="dash-hero-asset">
                <AssetLogo code={item.code} className="h-5 w-5" />
                <span>{formatAmount(item.amount, item.code)}</span>
              </span>
            ))}
          />
        </DashCol>
        <DashCol feed>
          <DashCard
            title="Donaciones recibidas"
            hint="Pagos con el memo del pool."
          >
            {donations.length === 0 ? (
              <p className="dash-empty">
                Todavía no hay donaciones con el memo {pool.shortCode}.
              </p>
            ) : (
              <div className="dash-feed">
                {donations.map((item) => (
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
          <DashCard
            title="Donar"
            hint={
              completed
                ? 'Este pool ya no recibe donaciones.'
                : 'Elegí el asset y el monto. Freighter firma el depósito.'
            }
          >
            <div className="mt-4 space-y-3">
              {completed ? (
                <Alert tone="ok">
                  Meta cumplida — gracias a todos los que aportaron. Este pool
                  ya no recibe donaciones.
                </Alert>
              ) : (
                <>
                  <AssetChips value={assetCode} onChange={setAssetCode} />
                  <Field label="Monto">
                    <TextInput
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  </Field>
                </>
              )}
              {!pool.vaultRegistered && hasTrustline === false ? (
                <Alert tone="error">
                  La wallet que recibe todavía no acepta {assetCode}.
                  {canOpenTrustline
                    ? ' Abrí la trustline con Freighter desde esta misma cuenta.'
                    : ' La cuenta receptora tiene que aceptar el asset en Freighter.'}
                </Alert>
              ) : null}
              {error ? <Alert tone="error">{error}</Alert> : null}
              {ok ? <Alert tone="ok">{ok}</Alert> : null}
              {busy ? <Spinner label={busy} /> : null}
              {!completed ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="white"
                    onClick={() => void shareUri()}
                  >
                    {copied ? 'Link copiado' : 'Copiar link'}
                  </Button>
                  {canOpenTrustline && hasTrustline === false ? (
                    <Button variant="black" disabled={Boolean(busy)} onClick={() => void openTrustline()}>
                      Abrir trustline
                    </Button>
                  ) : null}
                  {publicKey ? (
                    <Button
                      disabled={Boolean(busy) || selfDonation}
                      onClick={() => void depositFromFreighter()}
                    >
                      Depositar
                    </Button>
                  ) : (
                    <Button disabled={connecting} onClick={() => void connect()}>
                      {connecting ? 'Conectando…' : 'Conectar Freighter'}
                    </Button>
                  )}
                </div>
              ) : null}
              {selfDonation && !completed ? (
                <p className="text-sm leading-5 text-purple-deep/70">
                  Creaste este pool: no podés donarte a vos mismo.
                </p>
              ) : null}
            </div>
          </DashCard>
          {pool.vaultRegistered && youArePoolWallet ? (
            <DashCard
              title="Usar los fondos"
              hint="Retirá al momento, firmando con la wallet del pool."
            >
              <div className="mt-4 space-y-3">
                <AssetChips value={withdrawAssetCode} onChange={setWithdrawAssetCode} />
                <Field label={`Monto (${withdrawAssetCode})`}>
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
                {vaultOk ? <Alert tone="ok">{vaultOk}</Alert> : null}
                {vaultBusy ? <Spinner label={vaultBusy} /> : null}
                <Button
                  disabled={Boolean(vaultBusy)}
                  onClick={() => void withdrawFromVault()}
                >
                  Retirar
                </Button>
              </div>
            </DashCard>
          ) : null}
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
