import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroArt } from '../components/home/HeroArt'
import { StageAtmosphere } from '../components/layout/StageAtmosphere'
import { StellarMark } from '../components/layout/StellarMark'
import { Button } from '../components/ui/Button'
import { AcceptedAssets } from '../components/ui/AssetLogo'
import { useWallet } from '../context/WalletContext'
import { usePageMotion } from '../hooks/usePageMotion'
import { useRevealRow } from '../hooks/useRevealRow'

const words = ['el mundo real', 'tu familia', 'tu comunidad', 'Stellar']

export function HomePage() {
  const { publicKey, connect, connecting } = useWallet()
  const [wordIndex, setWordIndex] = useState(0)
  const root = usePageMotion('home')
  const features = useRevealRow()

  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % words.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div ref={root} className="space-y-5">
      <section className="relative overflow-hidden rounded-[36px] bg-ink px-6 py-8 text-white sm:px-10 sm:py-10 lg:px-14">
        <StageAtmosphere />
        <span className="anim-doodle absolute left-[46%] top-10 text-white/40">+</span>

        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="anim-enter text-xs font-semibold uppercase tracking-[0.22em] text-yellow">
              Testnet Stellar
            </p>
            <h1 className="anim-enter mt-4 text-5xl font-black leading-[0.92] tracking-tight sm:text-7xl">
              REMESAS
              <br />
              QUE LLEGAN
              <br />
              <span className="text-purple">{words[wordIndex].toUpperCase()}</span>
            </h1>
            <p className="anim-enter mt-6 max-w-md text-sm leading-7 text-white/65">
              Enviá XLM, USDC o EURC, recibí con QR y juntá un pool. La
              private key nunca sale de Freighter.
            </p>
            <div className="anim-enter mt-5 space-y-3">
              <AcceptedAssets tone="dark" />
              <StellarMark
                size={20}
                tone="dark"
                caption="Powered by Stellar"
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5"
              />
            </div>
            <div className="anim-enter mt-6 flex flex-wrap items-center gap-3">
              {publicKey ? (
                <Link to="/enviar">
                  <Button>Enviar ahora →</Button>
                </Link>
              ) : (
                <Button onClick={() => void connect()} disabled={connecting}>
                  {connecting ? 'Conectando…' : 'Empezar →'}
                </Button>
              )}
            </div>
            <div className="anim-enter mt-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Qué podés hacer
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag to="/enviar" label="Pago directo" tone="yellow" />
                <Tag to="/pools" label="Pool comunitario" tone="purple" />
                <Tag to="/familia" label="Pool familiar" tone="white" />
              </div>
            </div>
          </div>
          <div className="anim-enter">
            <HeroArt />
          </div>
        </div>
      </section>

      <section ref={features} className="grid gap-4 sm:grid-cols-3">
        <Feature
          title="Para quien envía"
          body="Path payment con destMin. Si falta trustline, te avisamos antes de firmar."
          to="/enviar"
        />
        <Feature
          title="Para la comunidad"
          body="Un QR SEP-7 en XLM, USDC o EURC. Cualquier wallet puede donar."
          to="/pools"
        />
        <Feature
          title="Para la familia"
          body="Multisig nativo, límite de retiro y Blend. Django arma el XDR; Freighter firma."
          to="/familia"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Settlement" value="~5 s" note="Horizon testnet" />
        <Stat label="Memo" value="28 B" note="shortCode del pool" />
        <Stat label="Firma" value="0 keys" note="solo XDR firmado" />
      </section>
    </div>
  )
}

function Tag({
  to,
  label,
  tone,
}: {
  to: string
  label: string
  tone: 'yellow' | 'purple' | 'white'
}) {
  const tones = {
    yellow: 'bg-yellow text-ink',
    purple: 'bg-purple text-white',
    white: 'bg-white text-ink',
  }
  return (
    <Link
      to={to}
      className={`rounded-full px-4 py-2 text-xs font-bold tracking-wide ${tones[tone]}`}
    >
      {label}
    </Link>
  )
}

function Feature({
  title,
  body,
  to,
}: {
  title: string
  body: string
  to: string
}) {
  return (
    <article className="feature-card">
      <Link to={to}>
        <div className="feature-dot mb-8 grid h-10 w-10 place-items-center rounded-full bg-yellow">
          <span className="h-2 w-2 rounded-full bg-ink" />
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-3 text-sm leading-6">{body}</p>
        <span className="feature-card-go mt-6 inline-block text-sm font-semibold">
          Ver →
        </span>
      </Link>
    </article>
  )
}

function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="rounded-[28px] border border-line bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-3 text-5xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  )
}
