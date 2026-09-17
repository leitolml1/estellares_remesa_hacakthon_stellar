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
      title="SEGUIMIENTO"
      subtitle="Dónde está tu remesa, en tiempo real. Cualquiera con el link puede verlo."
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
            title="Seguí una remesa"
            hint="Pegá el hash de la transacción que te compartieron."
          >
            <form className="space-y-3" onSubmit={submitSearch}>
              <Field label="Hash de la transacción">
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
            title="Pagos acreditados"
            hint="Operaciones de pago incluidas en esta transacción."
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
                    fromLabel="De"
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
            title="Detalle"
            hint="La transacción entró al ledger pero fue rechazada."
          >
            <p className="dash-empty">
              No se movieron fondos. Quien envió tiene que armar y firmar el pago de nuevo.
            </p>
          </DashCard>
        ) : null}
      </DashCol>
      <DashCol>
        <DashCard
          title="Compartir seguimiento"
          hint="Este link es público: cualquiera puede ver el estado del envío."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="white" onClick={() => void copyLink()}>
              {copied ? 'Link copiado' : 'Copiar link'}
            </Button>
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
              <Button variant="white">Ver en Stellar Expert</Button>
            </a>
          </div>
          <div className="mt-4 flex justify-center">
            <QrPanel
              value={`${window.location.origin}/track/${txHash}`}
              caption="Escaneá para seguir esta remesa desde el celular."
              size={160}
            />
          </div>
        </DashCard>
        <DashCard title="Seguir otra remesa" hint="Pegá otro hash de transacción.">
          <form className="space-y-3" onSubmit={submitSearch}>
            <Field label="Hash de la transacción">
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
        kicker="Estado"
        value="Buscando…"
        remain={
          polling
            ? 'Consultando el ledger cada 5 segundos. Si la remesa se acaba de mandar, aparece en unos segundos.'
            : undefined
        }
      />
    )
  }
  if (track.status === 'failed') {
    return (
      <DashHero
        compact
        kicker="Estado"
        value="Rechazada"
        remain="La red rechazó la transacción: no se movieron fondos."
      />
    )
  }
  return (
    <DashHero
      compact
      kicker="Estado"
      value="Acreditada"
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

