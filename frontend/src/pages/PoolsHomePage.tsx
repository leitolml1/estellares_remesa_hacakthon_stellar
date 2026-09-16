import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageStage } from '../components/layout/PageStage'
import { Alert } from '../components/ui/Alert'
import { AcceptedAssets } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import {
  DashBoard,
  DashCard,
  DashCol,
  DashHero,
} from '../components/ui/Dash'
import { Field, TextInput } from '../components/ui/Field'
import { Spinner } from '../components/ui/Spinner'
import { useWallet } from '../context/WalletContext'
import { humanizeApiError, listMyCommunityPools } from '../lib/api'
import { formatDate } from '../lib/format'
import { savePool } from '../lib/storage'
import type { CommunityPool } from '../types'

export function PoolsHomePage() {
  return (
    <PageStage
      layout="dashboard"
      kicker="Módulo 2"
      title="POOLS"
      subtitle="Tu listado es privado. Los donantes abren el link o el short code y donan con XLM, USDC o EURC."
    >
      <PoolsDashboard />
    </PageStage>
  )
}

function PoolsDashboard() {
  const { publicKey } = useWallet()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [pools, setPools] = useState<CommunityPool[]>([])
  const [loading, setLoading] = useState(Boolean(publicKey))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!publicKey) {
      setPools([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const next = await listMyCommunityPools(publicKey!)
        if (cancelled) return
        setPools(next)
        for (const pool of next) {
          savePool({
            id: pool.id,
            shortCode: pool.shortCode,
            title: pool.title,
            createdAt: String(pool.createdAt),
          })
        }
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

  return (
    <DashBoard>
      <DashCol>
        <DashHero
          kicker="Saldo de actividad"
          value={`${pools.length} pools`}
          fiat="Comunitarios de esta wallet"
          extraLabel="También aceptan"
          extra={
            <span className="dash-hero-chip">
              <AcceptedAssets tone="dark" />
            </span>
          }
          action={
            <Link to="/pools/nuevo">
              <Button>Nuevo pool →</Button>
            </Link>
          }
        />
        <DashCard
          title="Abrir un pool"
          hint="Pegá el short code o el link. Se abre público y se puede donar desde ahí."
        >
          <form
            className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              const value = code.trim()
              if (!value) return
              const match = value.match(/\/pools\/([^/?#]+)/)
              navigate(`/pools/${match?.[1] ?? value}`)
            }}
          >
            <div className="min-w-0 flex-1">
              <Field label="Short code o URL">
                <TextInput
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="V1StGXR8_Z"
                />
              </Field>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="yellow">
                Abrir
              </Button>
            </div>
          </form>
        </DashCard>
      </DashCol>
      <DashCol feed>
        <DashCard
          title="Tus pools"
          hint={
            publicKey
              ? 'Todo lo que creaste con esta wallet.'
              : 'Conectá Freighter para ver solo los que creaste vos.'
          }
        >
          {loading ? <Spinner label="Cargando tus pools…" /> : null}
          {error ? (
            <div className="mt-4">
              <Alert tone="error">{error}</Alert>
            </div>
          ) : null}
          {!loading && !error && publicKey && pools.length === 0 ? (
            <p className="dash-empty">Todavía no hay pools comunitarios con esta wallet.</p>
          ) : null}
          {pools.length > 0 ? (
            <div className="dash-feed">
              {pools.map((pool) => (
                <div key={pool.id} className="dash-feed-item">
                  <div>
                    <p className="dash-feed-from">Pool</p>
                    <p className="dash-feed-key">{pool.title}</p>
                    <p className="dash-feed-date">
                      {pool.shortCode} · {formatDate(pool.createdAt)}
                    </p>
                  </div>
                  <div className="dash-feed-amt">
                    <Link className="dash-feed-link" to={`/pools/${pool.shortCode}`}>
                      Ver pool
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </DashCard>
      </DashCol>
    </DashBoard>
  )
}
