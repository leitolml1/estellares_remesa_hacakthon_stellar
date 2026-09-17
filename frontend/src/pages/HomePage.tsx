import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FreighterCta } from '../components/FreighterCta'
import { HeroArt } from '../components/home/HeroArt'
import { StageAtmosphere } from '../components/layout/StageAtmosphere'
import { StellarMark } from '../components/layout/StellarMark'
import { Button } from '../components/ui/Button'
import { useWallet } from '../context/WalletContext'
import { usePageMotion } from '../hooks/usePageMotion'
import { useRevealRow } from '../hooks/useRevealRow'

const phrases = ['al mundo real', 'a tu familia', 'a tu comunidad']

export function HomePage() {
  const { publicKey } = useWallet()
  const [wordIndex, setWordIndex] = useState(0)
  const root = usePageMotion('home')
  const features = useRevealRow()

  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % phrases.length)
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
              Plata que llega
            </p>
            <h1 className="anim-enter mt-4 text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              Remesas que llegan{' '}
              <span className="text-purple">{phrases[wordIndex]}</span>
            </h1>
            <p className="anim-enter mt-6 max-w-lg text-base leading-7 text-white/75">
              Enviá plata que llega en segundos. Recibí con un QR. Juntá un
              pool con tu comunidad o tu familia. Tu clave nunca sale de tu
              billetera.
            </p>
            <div className="anim-enter mt-5">
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
                  <Button>Empezar →</Button>
                </Link>
              ) : (
                <FreighterCta tone="dark" label="Empezar →" />
              )}
            </div>
            <div className="anim-enter mt-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Qué podés hacer
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag to="/enviar" label="Pago directo" />
                <Tag to="/pools" label="Pool comunitario" />
                <Tag to="/familia" label="Pool familiar" />
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
          body="Mandás el monto y llega aunque cambie el tipo de cambio del camino."
          to="/enviar"
        />
        <Feature
          title="Para la comunidad"
          body="Un link o QR para que cualquiera aporte, sin registrarse."
          to="/pools"
        />
        <Feature
          title="Para la familia"
          body="Caja compartida: varios pueden depositar; los retiros piden más de una firma."
          to="/familia"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Velocidad" value="~5 s" note="Llega en segundos" />
        <Stat label="Tu clave" value="Queda" note="Sin compartir tu clave" />
        <Stat label="Firma" value="Vos" note="Firma en tu billetera" />
      </section>

      <details className="rounded-[28px] border border-line bg-white px-6 py-5">
        <summary className="cursor-pointer text-sm font-semibold text-purple-deep">
          Cómo funciona por dentro
        </summary>
        <p className="mt-3 text-sm leading-6 text-muted">
          El navegador arma la transacción, tu billetera Freighter la firma y
          la red Stellar la confirma. Los pools comunitarios y la caja familiar
          usan esa misma firma: tu clave no sale del navegador.
        </p>
      </details>
    </div>
  )
}

function Tag({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-full border border-white/20 bg-transparent px-4 py-2 text-xs font-bold tracking-wide text-white hover:bg-white/10"
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
