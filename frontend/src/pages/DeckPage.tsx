import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeckArt, type DeckArtName } from '../components/deck/DeckArt'
import { tx } from '../i18n'
import { AssetLogo } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import {
  IconActivity,
  IconBolt,
  IconClock,
  IconFamily,
  IconKey,
  IconPlus,
  IconQr,
  IconReceive,
  IconSend,
  IconUsers,
  IconVault,
  IconWallet,
} from '../components/ui/Icons'

const ICONS = {
  clock: IconClock,
  users: IconUsers,
  vault: IconVault,
  send: IconSend,
  family: IconFamily,
  bolt: IconBolt,
  plus: IconPlus,
  activity: IconActivity,
  qr: IconQr,
  receive: IconReceive,
  key: IconKey,
  wallet: IconWallet,
} as const

type IconName = keyof typeof ICONS

function deckSlides() {
  return [
  {
    id: 'que-es',
    kicker: tx('01 · Qué es', '01 · What it is'),
    title: tx(
      'Plata que llega, sin que tu clave salga del navegador.',
      'Money that arrives, without your key leaving the browser.',
    ),
    lead: tx(
      'Estelares es una app de remesas y cajas compartidas sobre Stellar testnet. No es banco: vos firmás en Freighter.',
      'Estelares is a remittance and shared-box app on Stellar testnet. It is not a bank: you sign in Freighter.',
    ),
    scene: ['clock', 'users', 'family'] as IconName[],
    cards: [
      {
        icon: 'clock' as IconName,
        art: 'delay' as DeckArtName,
        label: tx('El problema', 'The problem'),
        body: tx(
          'Mandar plata afuera o juntar para un viaje se hace por chat, con demoras y sin ver quién puso qué.',
          'Sending money abroad or pooling for a trip happens in chat, with delays and no record of who put in what.',
        ),
      },
      {
        icon: 'users' as IconName,
        art: 'people' as DeckArtName,
        label: tx('A quién llega', 'Who it reaches'),
        body: tx(
          'Quien envía, quien recibe, una comunidad con un link y una familia que quiere una caja en común.',
          'Whoever sends, whoever receives, a community with a link, and a family that wants a shared box.',
        ),
      },
      {
        icon: 'vault' as IconName,
        art: 'scope' as DeckArtName,
        label: tx('Hasta dónde', 'How far'),
        body: tx(
          'Pago directo, pool abierto, bóveda familiar y XLM ocioso en Blend. Testnet: no es plata real.',
          'Direct payment, an open pool, a family vault, and idle XLM in Blend. Testnet: this is not real money.',
        ),
        marks: ['XLM', 'USDC', 'EURC'] as const,
      },
    ],
  },
  {
    id: 'como',
    kicker: tx('02 · Cómo lo resolvemos', '02 · How we solve it'),
    title: tx(
      'Armás acá. Firmás en tu wallet. Stellar confirma.',
      'You build it here. You sign in your wallet. Stellar confirms.',
    ),
    lead: tx(
      'Tres caminos cortos. La app arma la operación; la clave privada nunca viaja al servidor.',
      'Three short paths. The app builds the operation; the private key never goes to the server.',
    ),
    scene: ['send', 'qr', 'bolt'] as IconName[],
    cards: [
      {
        icon: 'send' as IconName,
        art: 'remesa' as DeckArtName,
        label: tx('Remesa', 'Remittance'),
        body: tx(
          'Enviás XLM, USDC o EURC. Llega en segundos. El QR sirve para recibir sin dictar la address.',
          'You send XLM, USDC or EURC. It arrives in seconds. The QR lets someone receive without reading an address out loud.',
        ),
        marks: ['XLM', 'USDC', 'EURC'] as const,
      },
      {
        icon: 'family' as IconName,
        art: 'boxes' as DeckArtName,
        label: tx('Cajas', 'Boxes'),
        body: tx(
          'Un pool comunitario para cualquiera, o una caja familiar con más de una firma para retirar.',
          'A community pool for anyone, or a family box that needs more than one signature to withdraw.',
        ),
      },
      {
        icon: 'bolt' as IconName,
        art: 'yield' as DeckArtName,
        label: tx('Rendimiento', 'Yield'),
        body: tx(
          'El XLM que sobra puede ir a Blend. Se lee lo que el contrato ya generó. No inventamos una tasa anual.',
          'Spare XLM can go to Blend. The app reads what the contract already earned. We do not invent an annual rate.',
        ),
        marks: ['XLM'] as const,
      },
    ],
  },
  {
    id: 'comunitario',
    kicker: tx('03 · Pool comunitario', '03 · Community pool'),
    title: tx('Una colecta pública. Un link o un QR.', 'A public collection. A link or a QR.'),
    lead: tx(
      'Cualquiera aporta, sin registrarse. El vault vive on-chain, no en la wallet de quien lo armó.',
      'Anyone can contribute, without signing up. The vault lives on-chain, not in the wallet of whoever created it.',
    ),
    scene: ['plus', 'qr', 'users'] as IconName[],
    cards: [
      {
        icon: 'qr' as IconName,
        art: 'open' as DeckArtName,
        label: tx('Abrir', 'Open'),
        body: tx(
          'Creás el pool, compartís el short code y listo. Se dona desde el celular o Freighter.',
          'You create the pool, share the short code, and that is it. People donate from a phone or Freighter.',
        ),
      },
      {
        icon: 'activity' as IconName,
        art: 'rank' as DeckArtName,
        label: tx('Ver', 'See'),
        body: tx(
          'Los aportes se leen de la red. El ranking sale del contrato, no de una planilla.',
          'Contributions are read from the network. The ranking comes from the contract, not a spreadsheet.',
        ),
      },
      {
        icon: 'users' as IconName,
        art: 'crowd' as DeckArtName,
        label: tx('Alcance', 'Reach'),
        body: tx(
          'Vecinos, un evento, una causa. Quien no tiene cuenta en Estelares igual puede sumar.',
          'Neighbors, an event, a cause. Someone without an Estelares account can still chip in.',
        ),
      },
    ],
  },
  {
    id: 'familiar',
    kicker: tx('04 · Pool familiar', '04 · Family pool'),
    title: tx(
      'Una caja de todos. Retirás desde cualquier parte.',
      'A box for everyone. You withdraw from anywhere.',
    ),
    lead: tx(
      'Varios depositan. Los roles se eligen: aporte, operador, o las dos. Multisig nativo de Stellar.',
      'Several people deposit. Roles are chosen: contributor, operator, or both. Native Stellar multisig.',
    ),
    scene: ['family', 'receive', 'send'] as IconName[],
    cards: [
      {
        icon: 'receive' as IconName,
        art: 'deposit' as DeckArtName,
        label: tx('Aportar', 'Contribute'),
        body: tx(
          'Cada familiar manda XLM, USDC o EURC a la misma address. El QR es de la caja, no de una persona.',
          'Each family member sends XLM, USDC or EURC to the same address. The QR belongs to the box, not to one person.',
        ),
        marks: ['XLM', 'USDC', 'EURC'] as const,
      },
      {
        icon: 'send' as IconName,
        art: 'anywhere' as DeckArtName,
        label: tx('Operar', 'Operate'),
        body: tx(
          'Podés retirar desde cualquier parte del mundo. Firmás en tu wallet y la plata sale igual.',
          'You can withdraw from anywhere in the world. You sign in your wallet and the money still goes out.',
        ),
      },
      {
        icon: 'wallet' as IconName,
        art: 'roles' as DeckArtName,
        label: tx('Permisos', 'Permissions'),
        body: tx(
          'Se puede dar de alta otra wallet, ponerle apodo y tope. El creator no se saca a sí mismo.',
          'You can add another wallet, give it a nickname and a cap. The creator cannot remove themselves.',
        ),
      },
    ],
  },
  {
    id: 'blend',
    kicker: tx('05 · Caja de ahorros', '05 · Savings box'),
    title: tx('El XLM ocioso puede ir a Blend.', 'Idle XLM can go to Blend.'),
    lead: tx(
      'Solo XLM. El interés se lee del contrato: capital, valor actual e interés ya ganado. Sin promesa de APY.',
      'XLM only. Interest is read from the contract: principal, current value and interest already earned. No promised APY.',
    ),
    scene: ['bolt', 'activity', 'vault'] as IconName[],
    cards: [
      {
        icon: 'bolt' as IconName,
        art: 'blendIn' as DeckArtName,
        label: tx('Poner a rendir', 'Put it to work'),
        body: tx(
          'Desde la caja familiar, el XLM que no se usa entra a Blend. Sacar también se firma en Freighter.',
          'From the family box, unused XLM goes into Blend. Taking it out is also signed in Freighter.',
        ),
        marks: ['XLM'] as const,
      },
      {
        icon: 'activity' as IconName,
        art: 'blendRead' as DeckArtName,
        label: tx('Qué se muestra', 'What you see'),
        body: tx(
          'Cuánto ya rindió y una proyección si entra el ocioso, al mismo ritmo visto. No es una tasa fija.',
          'How much it already earned, and a projection if the idle balance goes in, at the same pace already seen. Not a fixed rate.',
        ),
      },
      {
        icon: 'vault' as IconName,
        art: 'blendLimit' as DeckArtName,
        label: tx('Límite honesto', 'Honest limit'),
        body: tx(
          'USDC y EURC no rinden acá. Blend en Estelares es XLM, y corre en testnet.',
          'USDC and EURC do not earn here. Blend in Estelares is XLM, and it runs on testnet.',
        ),
        marks: ['USDC', 'EURC'] as const,
      },
    ],
  },
  ]
}

export function DeckPage() {
  const [page, setPage] = useState(0)
  const slides = deckSlides()
  const slide = slides[page]
  const last = slides.length - 1

  function go(next: number) {
    setPage(Math.max(0, Math.min(last, next)))
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(page + 1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, last])

  return (
    <section className="deck" aria-label={tx('Presentación de Estelares', 'Estelares presentation')}>
      <div className="deck-stage">
        <div className="deck-head">
          <div>
            <p className="deck-kicker">{slide.kicker}</p>
            <h1 className="deck-title">{slide.title}</h1>
            <p className="deck-lead">{slide.lead}</p>
          </div>
          <DeckScene icons={slide.scene} />
        </div>

        <div className="deck-cards">
          {slide.cards.map((card) => {
            const Icon = ICONS[card.icon]
            return (
              <article key={card.label} className="deck-card">
                <span className="deck-card-ico">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="deck-card-label">{card.label}</p>
                <p>{card.body}</p>
                <DeckArt name={card.art} />
                {'marks' in card ? (
                  <div className="deck-marks">
                    {card.marks.map((code) => (
                      <span key={code} className="deck-mark">
                        <AssetLogo code={code} className="h-5 w-5" />
                        {code}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>

        <div className="deck-bar">
          <div className="deck-pages" role="tablist" aria-label={tx('Páginas del deck', 'Deck pages')}>
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === page}
                className={index === page ? 'is-on' : ''}
                onClick={() => go(index)}
              >
                {item.kicker.split('·')[1]?.trim() ?? item.kicker}
              </button>
            ))}
          </div>
          <div className="deck-move">
            <Button
              type="button"
              variant="ghost"
              disabled={page === 0}
              onClick={() => go(page - 1)}
            >
              {tx('← Anterior', '← Back')}
            </Button>
            {page < last ? (
              <Button type="button" onClick={() => go(page + 1)}>
                {tx('Siguiente →', 'Next →')}
              </Button>
            ) : (
              <Link to="/enviar">
                <Button>{tx('Empezar →', 'Start →')}</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function DeckScene({ icons }: { icons: readonly IconName[] }) {
  return (
    <div className="deck-scene" aria-hidden="true">
      {icons.map((name) => {
        const Icon = ICONS[name]
        return (
          <span key={name} className="deck-scene-ico">
            <Icon className="h-6 w-6" />
          </span>
        )
      })}
    </div>
  )
}

export function DeckTeaser() {
  return (
    <section className="home-guide">
      <div className="home-guide-copy">
        <p className="home-guide-kicker">Deck</p>
        <h2>{tx('Qué es y cómo lo resolvemos', 'What it is and how we solve it')}</h2>
        <p>
          {tx(
            'Cinco páginas cortas: el problema, el alcance, los dos tipos de pool y la caja de XLM en Blend. Sin inventar tasas.',
            'Five short pages: the problem, who it reaches, both pool types, and the XLM box in Blend. No invented rates.',
          )}
        </p>
        <Link to="/deck">
          <Button>{tx('Ver el deck →', 'See the deck →')}</Button>
        </Link>
      </div>
      <ol className="home-guide-steps">
        <li>
          <span>01</span>
          {tx('Qué es', 'What it is')}
        </li>
        <li>
          <span>02</span>
          {tx('Cómo lo resolvemos', 'How we solve it')}
        </li>
        <li>
          <span>03</span>
          {tx('Pools y Blend', 'Pools and Blend')}
        </li>
      </ol>
    </section>
  )
}
