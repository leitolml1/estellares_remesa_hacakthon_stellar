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
import { tx } from '../i18n'
import { usePageMotion } from '../hooks/usePageMotion'
import { useRevealRow } from '../hooks/useRevealRow'
import { DeckTeaser } from './DeckPage'

export function HomePage() {
  const { publicKey } = useWallet()
  const phrases = [
    tx('al mundo real', 'to the real world'),
    tx('a tu familia', 'to your family'),
    tx('a tu comunidad', 'to your community'),
  ]
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
              {tx('Plata que llega · Argentina Challenge', 'Money that arrives · Argentina Challenge')}
            </p>
            <h1 className="anim-enter mt-4 text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              {tx('Remesas que llegan', 'Remittances that arrive')}{' '}
              <span className="text-purple">{phrases[wordIndex]}</span>
            </h1>
            <p className="anim-enter mt-6 max-w-lg text-base leading-7 text-white/75">
              {tx(
                'Enviá plata que llega en segundos. Recibí con un QR. Juntá un pool con tu comunidad o tu familia. Tu clave nunca sale de tu billetera.',
                'Send money that arrives in seconds. Get paid with a QR. Pool funds with your community or your family. Your key never leaves your wallet.',
              )}
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
                  <Button>{tx('Empezar ahora →', 'Start now →')}</Button>
                </Link>
              ) : (
                <FreighterCta tone="dark" label={tx('Empezar ahora →', 'Start now →')} />
              )}
            </div>
            <div className="anim-enter mt-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                {tx('Qué podés hacer', 'What you can do')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag to="/enviar" label={tx('Pago directo', 'Direct payment')} icon={<IconSend className="h-3.5 w-3.5" />} />
                <Tag
                  to="/pools"
                  label={tx('Pool comunitario', 'Community pool')}
                  icon={<IconUsers className="h-3.5 w-3.5" />}
                />
                <Tag
                  to="/familia"
                  label={tx('Pool familiar', 'Family pool')}
                  icon={<IconFamily className="h-3.5 w-3.5" />}
                />
                <Tag
                  to="/como-funciona"
                  label={tx('Cómo funciona', 'How it works')}
                  icon={<IconKey className="h-3.5 w-3.5" />}
                />
                <Tag
                  to="/deck"
                  label="Deck"
                  icon={<IconPen className="h-3.5 w-3.5" />}
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
          {tx('Casos de uso', 'Use cases')}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          {tx('Diseñado para la economía de la gente', 'Built for everyday money')}
        </h2>
      </section>

      <section ref={features} className="grid gap-4 sm:grid-cols-3">
        <Feature
          title={tx('Para quien envía', 'For the sender')}
          body={tx(
            'Mandás el monto y llega aunque cambie el tipo de cambio del camino.',
            'You send an amount and it arrives even if the rate along the way changes.',
          )}
          to="/enviar"
          cta={tx('Ver cómo enviar →', 'See how to send →')}
          icon={<IconSend className="h-5 w-5" />}
          points={[
            tx('Swap referencial XLM / USDC / EURC', 'Reference swap XLM / USDC / EURC'),
            tx('Clave siempre en Freighter', 'Key always stays in Freighter'),
          ]}
        />
        <Feature
          title={tx('Para la comunidad', 'For the community')}
          body={tx(
            'Un link o QR para que cualquiera aporte, sin registrarse.',
            'A link or QR so anyone can contribute, without signing up.',
          )}
          to="/pools"
          cta={tx('Crear pool abierto →', 'Create an open pool →')}
          icon={<IconUsers className="h-5 w-5" />}
          points={[
            tx('Vault on-chain, no en tu wallet', 'On-chain vault, not in your wallet'),
            tx('Leaderboard leído del contrato', 'Leaderboard read from the contract'),
          ]}
        />
        <Feature
          title={tx('Para la familia', 'For the family')}
          body={tx(
            'Caja compartida: varios pueden depositar; los retiros piden más de una firma.',
            'A shared box: several people can deposit; withdrawals need more than one signature.',
          )}
          to="/familia"
          cta={tx('Configurar caja →', 'Set up the box →')}
          icon={<IconFamily className="h-5 w-5" />}
          points={[
            tx('Multisig nativo de Stellar', 'Native Stellar multisig'),
            tx('Roles de depósito y retiro', 'Deposit and withdraw roles'),
          ]}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<IconClock className="h-4 w-4" />}
          label={tx('Velocidad', 'Speed')}
          value="~5 s"
          note={tx('Llega en segundos', 'Arrives in seconds')}
        />
        <Stat
          icon={<IconKey className="h-4 w-4" />}
          label={tx('Tu clave', 'Your key')}
          value={tx('Queda', 'Stays')}
          note={tx('Sin compartir tu clave', 'Without sharing your key')}
        />
        <Stat
          icon={<IconPen className="h-4 w-4" />}
          label={tx('Firma', 'Signature')}
          value={tx('Vos', 'You')}
          note={tx('Firma en tu billetera', 'You sign in your wallet')}
        />
        <Stat
          icon={<IconBolt className="h-4 w-4" />}
          label={tx('Costo de red', 'Network cost')}
          value="< $0.001"
          note={tx('Fracciones de centavo', 'Fractions of a cent')}
        />
      </section>

      <DeckTeaser />

      <section className="home-guide">
        <div className="home-guide-copy">
          <p className="home-guide-kicker">{tx('Guía paso a paso', 'Step by step')}</p>
          <h2>{tx('Cómo funciona', 'How it works')}</h2>
          <p>
            {tx(
              'Armás en la app, firmás en Freighter y Stellar confirma. La guía muestra cada módulo con pantallas de ejemplo: enviar, recibir, historial, pool comunitario y caja familiar.',
              'You build it in the app, sign in Freighter and Stellar confirms. The guide shows each module with sample screens: send, receive, history, community pool and family box.',
            )}
          </p>
          <Link to="/como-funciona">
            <Button>{tx('Ver la guía →', 'See the guide →')}</Button>
          </Link>
        </div>
        <ol className="home-guide-steps">
          <li>
            <span>01</span>
            {tx('Conectar Freighter', 'Connect Freighter')}
          </li>
          <li>
            <span>02</span>
            {tx('Enviar o recibir', 'Send or receive')}
          </li>
          <li>
            <span>03</span>
            {tx('Pool o caja familiar', 'Pool or family box')}
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
