import { tx } from '../i18n'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageStage } from '../components/layout/PageStage'
import { Alert } from '../components/ui/Alert'
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
import { humanizeApiError } from '../lib/api'
import {
  explorerTxUrl,
  formatAmount,
  formatDate,
  truncateKey,
} from '../lib/format'
import { trackTransaction, type TrackedTransaction } from '../lib/horizon'

const POLL_INTERVAL_MS = 5000

export function TrackPage() {
  const { txHash = '' } = useParams()
  return (
    <PageStage
      layout="dashboard"
      title={tx("SEGUIMIENTO", "TRACKING")}
      subtitle={tx("Dónde está tu remesa, en tiempo real. Cualquiera con el link puede verlo.", "Where your remittance is, in real time. Anyone with the link can see it.")}
    >
      <TrackContent key={txHash} txHash={txHash.trim()} />
    </PageStage>
  )
}

function TrackContent({ txHash }: { txHash: string }) {
  const navigate = useNavigate()
  const [track, setTrack] = useState<TrackedTransaction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!txHash) return
    let cancelled = false
    let timer: number | undefined
    async function poll() {
      if (cancelled) return
      try {
        const next = await trackTransaction(txHash)
        if (cancelled) return
        setTrack(next)
        setError(null)
        if (next.status === 'not_found') {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (caught) {
        if (cancelled) return
        setError(humanizeApiError(caught))
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [txHash])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const value = search.trim()
    if (!value) return
    navigate(`/track/${value}`)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(
      `${window.location.origin}/track/${txHash}`,
    )
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (!txHash) {
    return (
      <DashBoard>
        <DashCol>
          <DashCard
            title={tx("Seguí una remesa", "Track a remittance")}
            hint={tx("Pegá el hash de la transacción que te compartieron.", "Paste the transaction hash they shared with you.")}
          >
            <form className="space-y-3" onSubmit={submitSearch}>
              <Field label={tx("Hash de la transacción", "Transaction hash")}>
                <TextInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="abc123…"
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
              <Button type="submit">Seguir remesa →</Button>
            </form>
          </DashCard>
        </DashCol>
      </DashBoard>
    )
  }

  const stillPolling = !track || track.status === 'not_found'
  const statusHero = buildStatusHero(track, stillPolling)

  return (
    <DashBoard>
      <DashCol>
        {statusHero}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {track && track.status === 'success' ? (
          <DashCard
            title={tx("Pagos acreditados", "Credited payments")}
            hint={tx("Operaciones de pago incluidas en esta transacción.", "Payment operations included in this transaction.")}
          >
            {track.payments.length === 0 ? (
              <p className="dash-empty">
                La transacción no incluye pagos (puede ser otro tipo de operación).
              </p>
            ) : (
              <div className="dash-feed">
                {track.payments.map((payment, index) => (
                  <DashFeedItem
                    key={`${payment.from}-${payment.to}-${index}`}
                    from={truncateKey(payment.from, 4)}
                    fromLabel={tx("De", "From")}
                    date={track.createdAt ? formatDate(track.createdAt) : undefined}
                    amount={formatAmount(payment.amount, '')}
                    code={payment.assetCode}
                    href={explorerTxUrl(track.hash)}
                  />
                ))}
              </div>
            )}
            <p className="dash-feed-key mt-3 break-all">
              Destino: {track.payments[0] ? truncateKey(track.payments[0].to, 6) : '—'}
            </p>
          </DashCard>
        ) : null}
        {track && track.status === 'failed' ? (
          <DashCard
            title={tx("Detalle", "Detail")}
            hint={tx("La transacción entró al ledger pero fue rechazada.", "The transaction entered the ledger but was rejected.")}
          >
            <p className="dash-empty">
              No se movieron fondos. Quien envió tiene que armar y firmar el pago de nuevo.
            </p>
          </DashCard>
        ) : null}
      </DashCol>
      <DashCol>
        <DashCard
          title={tx("Compartir seguimiento", "Share tracking")}
          hint={tx("Este link es público: cualquiera puede ver el estado del envío.", "This link is public: anyone can see the payment status.")}
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="white" onClick={() => void copyLink()}>
              {copied ? tx("Link copiado", "Link copied") : tx("Copiar link", "Copy link")}
            </Button>
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
              <Button variant="white">Ver en Stellar Expert</Button>
            </a>
          </div>
          <div className="mt-4 flex justify-center">
            <QrPanel
              value={`${window.location.origin}/track/${txHash}`}
              caption={tx("Escaneá para seguir esta remesa desde el celular.", "Scan to track this remittance from a phone.")}
              size={160}
            />
          </div>
        </DashCard>
        <DashCard title={tx("Seguir otra remesa", "Track another remittance")} hint={tx("Pegá otro hash de transacción.", "Paste another transaction hash.")}>
          <form className="space-y-3" onSubmit={submitSearch}>
            <Field label={tx("Hash de la transacción", "Transaction hash")}>
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="abc123…"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <Button type="submit" variant="black">
              Buscar
            </Button>
          </form>
        </DashCard>
      </DashCol>
    </DashBoard>
  )
}

function buildStatusHero(track: TrackedTransaction | null, polling: boolean) {
  if (!track || track.status === 'not_found') {
    return (
      <DashHero
        compact
        kicker={tx("Estado", "Status")}
        value={tx("Buscando…", "Looking…")}
        remain={
          polling
            ? tx("Consultando el ledger cada 5 segundos. Si la remesa se acaba de mandar, aparece en unos segundos.", "Checking the ledger every 5 seconds. If the remittance was just sent, it shows up in a few seconds.")
            : undefined
        }
      />
    )
  }
  if (track.status === 'failed') {
    return (
      <DashHero
        compact
        kicker={tx("Estado", "Status")}
        value={tx("Rechazada", "Rejected")}
        remain={tx("La red rechazó la transacción: no se movieron fondos.", "The network rejected the transaction: no funds moved.")}
      />
    )
  }
  return (
    <DashHero
      compact
      kicker={tx("Estado", "Status")}
      value={tx("Acreditada", "Credited")}
      remain={
        track.ledger
          ? `Confirmada en el ledger ${track.ledger}${
              track.createdAt ? ` · ${formatDate(track.createdAt)}` : ''
            }`
          : undefined
      }
    />
  )
}

