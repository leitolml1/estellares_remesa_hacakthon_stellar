import { useEffect, useState } from 'react'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { Progress } from '../components/ui/Progress'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import { getPaymentHistory, humanizeApiError } from '../lib/api'
import { explorerAccountUrl, truncateKey } from '../lib/format'
import { computeTrustScore } from '../lib/score'
import { getSavedPools } from '../lib/storage'
import type { TrustScoreBreakdown } from '../types'

export function ProfilePage() {
  return (
    <PageStage
      kicker="Módulo 4 · preview"
      title="PERFIL"
      subtitle="Trust score calculado en el cliente con Horizon y los pools de este navegador."
    >
      <WalletGate
        title="Conectá para ver tu perfil"
        description="Trust score calculado en el cliente con tu historial de Horizon."
      >
        <ProfileContent />
      </WalletGate>
    </PageStage>
  )
}

function ProfileContent() {
  const { publicKey } = useWallet()
  const [score, setScore] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reveal = useUnfoldDown('profile')

  useEffect(() => {
    if (!publicKey) return
    const key = publicKey
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const history = await getPaymentHistory(key, { limit: 50 })
        if (cancelled) return
        const computed = computeTrustScore(history.records, getSavedPools().length)
        setScore(computed.score)
        setBreakdown(computed.breakdown)
      } catch (caught) {
        if (!cancelled) setError(humanizeApiError(caught))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [publicKey])

  if (!publicKey) return null

  return (
    <div ref={reveal} className="space-y-4">
      <div className="stage-card unfold-down rounded-[28px] bg-purple p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow">
          Wallet
        </p>
        <p className="mt-3 font-mono text-sm">{truncateKey(publicKey, 8)}</p>
        <a
          className="mt-4 inline-block text-sm text-yellow underline"
          href={explorerAccountUrl(publicKey)}
          target="_blank"
          rel="noreferrer"
        >
          Abrir en Explorer
        </a>
      </div>

      <FormPanel>
        <h2 className="text-3xl font-black tracking-tight">Trust score</h2>
        {loading ? (
          <div className="mt-6">
            <Spinner label="Calculando con Horizon…" />
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        {score !== null && breakdown ? (
          <div className="mt-8 grid gap-8 md:grid-cols-[160px_1fr]">
            <div className="grid place-items-center rounded-[28px] bg-ink text-white">
              <div className="py-8 text-center">
                <p className="text-6xl font-black">{score}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-yellow">
                  / 100
                </p>
              </div>
            </div>
            <div className="space-y-5">
              <Row label="Frecuencia (30 días)" value={breakdown.frequency} />
              <Row label="Volumen" value={breakdown.volume} />
              <Row label="Participación en pools" value={breakdown.pools} />
              <Row label="Antigüedad" value={breakdown.seniority} />
            </div>
          </div>
        ) : null}
      </FormPanel>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">{value}</span>
      </div>
      <Progress value={value} />
    </div>
  )
}
