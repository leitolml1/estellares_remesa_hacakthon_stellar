import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FreighterCta } from '../components/FreighterCta'
import { HeroArt } from '../components/home/HeroArt'
import { StageAtmosphere } from '../components/layout/StageAtmosphere'
import { StellarMark } from '../components/layout/StellarMark'
import { Button } from '../components/ui/Button'
import {
  IconBolt,
  IconClock,
  IconFamily,
  IconKey,
  IconPen,
  IconSend,
  IconUsers,
} from '../components/ui/Icons'
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
              Plata que llega · Argentina Challenge
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
                  <Button>Empezar ahora →</Button>
                </Link>
              ) : (
                <FreighterCta tone="dark" label="Empezar ahora →" />
              )}
            </div>
            <div className="anim-enter mt-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Qué podés hacer
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag to="/enviar" label="Pago directo" icon={<IconSend className="h-3.5 w-3.5" />} />
                <Tag
                  to="/pools"
                  label="Pool comunitario"
                  icon={<IconUsers className="h-3.5 w-3.5" />}
                />
                <Tag
                  to="/familia"
                  label="Pool familiar"
                  icon={<IconFamily className="h-3.5 w-3.5" />}
                />
                <Tag
                  to="/como-funciona"
                  label="Cómo funciona"
                  icon={<IconKey className="h-3.5 w-3.5" />}
                />
              </div>
            </div>
          </div>
          <div className="anim-enter">
            <HeroArt />
          </div>
        </div>
      </section>

      <section className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Casos de uso
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          Diseñado para la economía de la gente
        </h2>
      </section>

      <section ref={features} className="grid gap-4 sm:grid-cols-3">
        <Feature
          title="Para quien envía"
          body="Mandás el monto y llega aunque cambie el tipo de cambio del camino."
          to="/enviar"
          cta="Ver cómo enviar →"
          icon={<IconSend className="h-5 w-5" />}
          points={['Swap referencial XLM / USDC / EURC', 'Clave siempre en Freighter']}
        />
        <Feature
          title="Para la comunidad"
          body="Un link o QR para que cualquiera aporte, sin registrarse."
          to="/pools"
          cta="Crear pool abierto →"
          icon={<IconUsers className="h-5 w-5" />}
          points={['Vault on-chain, no en tu wallet', 'Leaderboard leído del contrato']}
        />
        <Feature
          title="Para la familia"
          body="Caja compartida: varios pueden depositar; los retiros piden más de una firma."
          to="/familia"
          cta="Configurar caja →"
          icon={<IconFamily className="h-5 w-5" />}
          points={['Multisig nativo de Stellar', 'Roles de depósito y retiro']}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<IconClock className="h-4 w-4" />}
          label="Velocidad"
          value="~5 s"
          note="Llega en segundos"
        />
        <Stat
          icon={<IconKey className="h-4 w-4" />}
          label="Tu clave"
          value="Queda"
          note="Sin compartir tu clave"
        />
        <Stat
          icon={<IconPen className="h-4 w-4" />}
          label="Firma"
          value="Vos"
          note="Firma en tu billetera"
        />
        <Stat
          icon={<IconBolt className="h-4 w-4" />}
          label="Costo de red"
          value="< $0.001"
          note="Fracciones de centavo"
        />
      </section>

      <section className="home-guide">
        <div className="home-guide-copy">
          <p className="home-guide-kicker">Guía paso a paso</p>
          <h2>Cómo funciona</h2>
          <p>
            Armás en la app, firmás en Freighter y Stellar confirma. La guía
            muestra cada módulo con pantallas de ejemplo: enviar, recibir,
            historial, pool comunitario y caja familiar.
          </p>
          <Link to="/como-funciona">
            <Button>Ver la guía →</Button>
          </Link>
        </div>
        <ol className="home-guide-steps">
          <li>
            <span>01</span>
            Conectar Freighter
          </li>
          <li>
            <span>02</span>
            Enviar o recibir
          </li>
          <li>
            <span>03</span>
            Pool o caja familiar
          </li>
        </ol>
      </section>
    </div>
  )
}

function Tag({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: ReactNode
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-transparent px-4 py-2 text-xs font-bold tracking-wide text-white hover:bg-white/10"
    >
      {icon}
      {label}
    </Link>
  )
}

function Feature({
  title,
  body,
  to,
  cta,
  icon,
  points,
}: {
  title: string
  body: string
  to: string
  cta: string
  icon: ReactNode
  points: string[]
}) {
  return (
    <article className="feature-card">
      <Link to={to}>
        <div className="feature-dot mb-8 grid h-10 w-10 place-items-center rounded-full bg-yellow text-ink">
          {icon}
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-3 text-sm leading-6">{body}</p>
        <ul className="feature-points">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <span className="feature-card-go mt-auto inline-block pt-6 text-sm font-semibold">
          {cta}
        </span>
      </Link>
    </article>
  )
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode
  label: string
  value: string
  note: string
}) {
  return (
    <div className="home-stat">
      <div className="home-stat-icon">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{value}</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  )
}
