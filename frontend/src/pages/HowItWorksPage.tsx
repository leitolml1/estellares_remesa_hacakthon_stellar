import type { ReactNode } from 'react'
import { tx } from '../i18n'
import { Link } from 'react-router-dom'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { Button } from '../components/ui/Button'
import {
  IconActivity,
  IconFamily,
  IconKey,
  IconReceive,
  IconSend,
  IconUsers,
} from '../components/ui/Icons'

function toc() {
  return [
    { href: '#empezar', label: tx('Empezar', 'Start') },
    { href: '#enviar', label: tx('Enviar', 'Send') },
    { href: '#recibir', label: tx('Recibir', 'Receive') },
    { href: '#historial', label: tx('Historial', 'History') },
    { href: '#pools', label: tx('Pool comunitario', 'Community pool') },
    { href: '#familia', label: tx('Caja familiar', 'Family box') },
  ]
}

export function HowItWorksPage() {
  const TOC = toc()
  return (
    <PageStage
      className="guide-stage"
      kicker={tx('Guía', 'Guide')}
      title={tx('Cómo funciona', 'How it works')}
      subtitle={tx(
        'Siempre es lo mismo: armás en la app, firmás en Freighter y Stellar confirma. Tu clave no sale del navegador.',
        'It is always the same: you build it in the app, sign in Freighter, and Stellar confirms. Your key never leaves the browser.',
      )}
    >
      <nav className="guide-toc" aria-label={tx('Secciones de la guía', 'Guide sections')}>
        {TOC.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <GuideBlock
        id="empezar"
        kicker={tx('Antes de operar', 'Before you start')}
        title={tx('Conectá Freighter', 'Connect Freighter')}
        to="/"
        cta={tx('Ir al inicio', 'Go home')}
        icon={<IconKey className="h-4 w-4" />}
        steps={[
          {
            title: tx('Instalá la billetera', 'Install the wallet'),
            body: tx(
              'Freighter es la extensión del navegador. Sin ella no se puede firmar. En Chrome o Brave: Instalar Freighter, crear o importar una cuenta.',
              'Freighter is the browser extension. You cannot sign without it. In Chrome or Brave: install Freighter, then create or import an account.',
            ),
            screen: <ScreenFreighter />,
          },
          {
            title: tx('Poné Test Network', 'Switch to Test Network'),
            body: tx(
              'Estelares corre en Stellar testnet, no en mainnet. En Freighter: Network → Test Network. Pedí XLM de prueba con Friendbot si la cuenta está vacía.',
              'Estelares runs on Stellar testnet, not mainnet. In Freighter: Network → Test Network. Request test XLM with Friendbot if the account is empty.',
            ),
            screen: <ScreenNetwork />,
          },
          {
            title: tx('Conectá en Estelares', 'Connect in Estelares'),
            body: tx(
              'Arriba a la derecha, “Conectar Freighter”. Aceptá el permiso. A partir de ahí la app ve tu public key y puede armar transacciones para que vos las firmes.',
              'Top right, “Connect Freighter”. Accept the permission. From then on the app sees your public key and can build transactions for you to sign.',
            ),
            screen: <ScreenConnect />,
          },
        ]}
      />

      <GuideBlock
        id="enviar"
        kicker={tx('Pago directo', 'Direct payment')}
        title={tx('Enviar plata', 'Send money')}
        to="/enviar"
        cta={tx('Ir a Enviar', 'Go to Send')}
        icon={<IconSend className="h-4 w-4" />}
        steps={[
          {
            title: tx("Destino y monto", "Destination and amount"),
            body: tx("Pegá la public key G… de quien recibe, o elegí un contacto. El monto va en el activo que envías: XLM, USDC o EURC.", "Paste the G… public key of whoever receives, or pick a contact. The amount is in the asset you send: XLM, USDC or EURC."),
            screen: <ScreenSendForm />,
          },
          {
            title: tx("Enviás y Recibe, al lado", "You send and they receive, side by side"),
            body: tx("Si mandás XLM y la otra persona quiere USDC, la app cotiza el camino. Si es el mismo activo, llega exactamente lo que pusiste.", "If you send XLM and the other person wants USDC, the app quotes the path. If it is the same asset, they get exactly what you entered."),
            screen: <ScreenSendAssets />,
          },
          {
            title: tx("Firmar y listo", "Sign and done"),
            body: tx("“Firmar y enviar” abre Freighter. Aprobá. Vas a ver Armar → Firmar → Enviar → Listo, y un link para ver la transacción en testnet.", "“Sign and send” opens Freighter. Approve it. You will see Build → Sign → Submit → Done, plus a link to the transaction on testnet."),
            screen: <ScreenStepper />,
          },
        ]}
      />

      <GuideBlock
        id="recibir"
        kicker={tx("Pago directo", "Direct payment")}
        title={tx("Recibir con QR", "Receive with a QR")}
        to="/recibir"
        cta={tx("Ir a Recibir", "Go to Receive")}
        icon={<IconReceive className="h-4 w-4" />}
        steps={[
          {
            title: tx("Elegí el activo", "Choose the asset"),
            body: tx("En Recibir, elegí XLM, USDC o EURC. El QR queda armado para esa moneda. Si pedís USDC/EURC, tu cuenta tiene que tener el activo activado.", "On Receive, choose XLM, USDC or EURC. The QR is built for that asset. If you ask for USDC or EURC, your account must have that asset enabled."),
            screen: <ScreenReceive />,
          },
          {
            title: tx("Mostrá o copiá", "Show it or copy it"),
            body: tx("Quien te paga puede escanear el QR o usar tu address. También podés copiar el link de pago. No hace falta que la otra persona tenga Estelares: alcanza una billetera Stellar.", "Whoever pays you can scan the QR or use your address. You can also copy the payment link. They do not need Estelares: a Stellar wallet is enough."),
            screen: <ScreenReceiveCopy />,
          },
        ]}
      />

      <GuideBlock
        id="historial"
        kicker={tx("Seguimiento", "Tracking")}
        title={tx("Historial y seguimiento", "History and tracking")}
        to="/historial"
        cta={tx("Ir al historial", "Go to history")}
        icon={<IconActivity className="h-4 w-4" />}
        steps={[
          {
            title: tx("Lo que salió y lo que entró", "What went out and what came in"),
            body: tx("Historial lee el ledger de Stellar. Cada fila muestra enviado o recibido, el monto y un chip “Ver en testnet” para abrir Stellar Expert.", "History reads the Stellar ledger. Each row shows sent or received, the amount, and a “View on testnet” chip that opens Stellar Expert."),
            screen: <ScreenHistory />,
          },
          {
            title: tx("Seguí un hash", "Track a hash"),
            body: tx("Si te compartieron un hash de transacción, andá a Seguir remesa, pegalo, y ves si ya confirmó. Sirve para mostrarle a quien espera la plata.", "If someone shared a transaction hash, open Track remittance, paste it, and see whether it confirmed. Useful for whoever is waiting for the money."),
            screen: <ScreenTrack />,
          },
        ]}
      />

      <GuideBlock
        id="pools"
        kicker={tx("Comunidad", "Community")}
        title={tx("Pool comunitario", "Community pool")}
        to="/pools/nuevo"
        cta={tx("Crear un pool", "Create a pool")}
        icon={<IconUsers className="h-4 w-4" />}
        steps={[
          {
            title: tx("Creá la colecta", "Create the collection"),
            body: tx("Título, meta y (si querés) fecha límite. La wallet conectada queda como dueña. Después Freighter pide registrar el vault: esa segunda firma deja el pool on-chain.", "Title, goal, and an optional deadline. The connected wallet becomes the owner. Then Freighter asks you to register the vault: that second signature puts the pool on-chain."),
            screen: <ScreenPoolCreate />,
          },
          {
            title: tx("Compartí el link o el código", "Share the link or the code"),
            body: tx("Cualquiera puede aportar sin registrarse. Copiá el link, el short code o el QR. La lupa del header también abre un pool pegando el código.", "Anyone can contribute without signing up. Copy the link, the short code, or the QR. Header search also opens a pool if you paste the code."),
            screen: <ScreenPoolShare />,
          },
          {
            title: tx("Aportar y retirar", "Contribute and withdraw"),
            body: tx("Quien dona firma en Freighter. El progreso y el ranking salen del contrato, no de una planilla. El dueño retira a una cuenta; no puede donarse a sí mismo ni sacar de más.", "Whoever donates signs in Freighter. Progress and the ranking come from the contract, not a spreadsheet. The owner withdraws to an account and cannot donate to themselves or take out more than is there."),
            screen: <ScreenPoolDash />,
          },
        ]}
      />

      <GuideBlock
        id="familia"
        kicker={tx("Familia", "Family")}
        title={tx("Caja familiar", "Family box")}
        to="/familia"
        cta={tx("Ir a Familia", "Go to Family")}
        icon={<IconFamily className="h-4 w-4" />}
        steps={[
          {
            title: tx("Armá la caja", "Set up the box"),
            body: tx("Nombre y wallets. Cada una puede depositar, retirar, o las dos cosas. Se crea una cuenta nueva en el navegador; las claves no viajan al servidor.", "A name and wallets. Each one can deposit, withdraw, or both. A new account is created in the browser; keys never go to the server."),
            screen: <ScreenFamilyCreate />,
          },
          {
            title: tx("Depositá o mostrá el QR", "Deposit or show the QR"),
            body: tx("Cualquier miembro con depósito suma fondos. El QR es de la caja, no de tu wallet. El patrimonio suma el XLM ocioso más lo que está en Blend.", "Any member allowed to deposit adds funds. The QR belongs to the box, not your wallet. Total wealth adds idle XLM plus what is in Blend."),
            screen: <ScreenFamilyDash />,
          },
          {
            title: tx("Retiro con más de una firma", "Withdraw from anywhere"),
            body: tx("Pedir retiro abre Freighter. Si falta el quórum, queda “en votación”: otro familiar conecta y firma. Recién ahí sale la plata.", "You request the withdrawal and sign in Freighter. You can do it from anywhere in the world and the money still goes out."),
            screen: <ScreenFamilyVote />,
          },
          {
            title: tx("Poner XLM a rendir", "Put XLM to work"),
            body: tx("Solo XLM entra a Blend en esta demo. En la card “XLM en Blend” ves puesto a rendir, valor actual e interés leído del contrato. Sacar del rendimiento pide las mismas firmas que un retiro.", "Only XLM goes into Blend in this demo. The “XLM in Blend” card shows what is earning, current value, and interest read from the contract. Taking it out needs the same signatures as a withdrawal."),
            screen: <ScreenFamilyBlend />,
          },
        ]}
      />

      <FormPanel className="guide-note">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-purple">
          Importante
        </p>
        <p className="mt-2 text-base leading-7 text-purple-deep/80">
          El backend arma el XDR. Freighter firma. Stellar confirma. La app
          nunca guarda tu clave privada. Estamos en testnet: usá fondos de
          prueba, no plata real.
        </p>
      </FormPanel>
    </PageStage>
  )
}

function GuideBlock({
  id,
  kicker,
  title,
  to,
  cta,
  icon,
  steps,
}: {
  id: string
  kicker: string
  title: string
  to: string
  cta: string
  icon: ReactNode
  steps: { title: string; body: string; screen: ReactNode }[]
}) {
  return (
    <section id={id} className="guide-block">
      <div className="guide-block-head">
        <div>
          <p className="guide-kicker">
            {icon}
            {kicker}
          </p>
          <h2>{title}</h2>
        </div>
        <Link to={to}>
          <Button variant="black">{cta} →</Button>
        </Link>
      </div>
      <ol className="guide-steps">
        {steps.map((step, index) => (
          <li key={step.title} className="guide-step">
            <div className="guide-step-copy">
              <span className="guide-step-num">{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            {step.screen}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Phone({
  eyebrow,
  title,
  children,
  tone = 'dark',
}: {
  eyebrow: string
  title: string
  children: ReactNode
  tone?: 'dark' | 'lilac' | 'purple'
}) {
  return (
    <figure className={`guide-phone guide-phone-${tone}`}>
      <div className="guide-phone-bar">
        <span />
        <span />
        <span />
      </div>
      <p className="guide-phone-kicker">{eyebrow}</p>
      <p className="guide-phone-title">{title}</p>
      <div className="guide-phone-body">{children}</div>
    </figure>
  )
}

function ScreenFreighter() {
  return (
    <Phone eyebrow={tx("Navegador", "Browser")} title="Freighter">
      <div className="guide-chip">Extensión · Chrome / Brave</div>
      <div className="guide-btn-yellow">{tx("Instalar Freighter", "Install Freighter")}</div>
    </Phone>
  )
}

function ScreenNetwork() {
  return (
    <Phone eyebrow="Freighter" title="Network">
      <div className="guide-row is-on">Test Network</div>
      <div className="guide-row">Public Network</div>
      <p className="guide-mini">{tx("Estelares usa testnet.", "Estelares uses testnet.")}</p>
    </Phone>
  )
}

function ScreenConnect() {
  return (
    <Phone eyebrow="Estelares" title="Header">
      <div className="guide-nav-fake">
        <span className="guide-dot-yellow" />
        <span className="guide-btn-yellow is-small">{tx('Conectar Freighter', 'Connect Freighter')}</span>
      </div>
      <p className="guide-mini">{tx("Aceptá el permiso en el popup.", "Accept the permission in the popup.")}</p>
    </Phone>
  )
}

function ScreenSendForm() {
  return (
    <Phone eyebrow={tx("Enviar", "Send")} title={tx("Armá el envío", "Build the payment")} tone="lilac">
      <label>{tx("Destino", "Destination")}</label>
      <div className="guide-input">G… familiar</div>
      <label>Monto (en XLM)</label>
      <div className="guide-input">25.5</div>
    </Phone>
  )
}

function ScreenSendAssets() {
  return (
    <Phone eyebrow={tx("Enviar", "Send")} title={tx("Enviás → Recibe", "You send → they receive")} tone="lilac">
      <div className="guide-pair">
        <div>
          <span>{tx("Enviás", "You send")}</span>
          <b>XLM</b>
        </div>
        <i>→</i>
        <div>
          <span>{tx("Recibe", "They receive")}</span>
          <b>USDC</b>
        </div>
      </div>
      <p className="guide-mini">{tx("La cotización aparece si son distintos.", "The quote shows up when the assets differ.")}</p>
    </Phone>
  )
}

function ScreenStepper() {
  return (
    <Phone eyebrow="Freighter" title={tx("Confirmar", "Confirm")}>
      <ol className="guide-stepper">
        <li className="is-done">{tx("Armar", "Build")}</li>
        <li className="is-done">{tx("Firmar", "Sign")}</li>
        <li className="is-on">{tx("Enviar", "Send")}</li>
        <li>{tx("Listo", "Done")}</li>
      </ol>
    </Phone>
  )
}

function ScreenReceive() {
  return (
    <Phone eyebrow={tx("Recibir", "Receive")} title={tx("Tu QR", "Your QR")} tone="purple">
      <div className="guide-assets">
        <span className="is-on">XLM</span>
        <span>USDC</span>
        <span>EURC</span>
      </div>
      <div className="guide-qr" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </Phone>
  )
}

function ScreenReceiveCopy() {
  return (
    <Phone eyebrow={tx("Recibir", "Receive")} title={tx("Compartir", "Share")} tone="purple">
      <div className="guide-btn-yellow">{tx("Copiar address", "Copy address")}</div>
      <div className="guide-btn-ghost">{tx("Copiar link de pago", "Copy payment link")}</div>
    </Phone>
  )
}

function ScreenHistory() {
  return (
    <Phone eyebrow={tx("Historial", "History")} title={tx("Movimientos", "Movements")} tone="lilac">
      <div className="guide-tx">
        <span className="is-out">{tx("Enviado", "Sent")}</span>
        <b>− 25,5 XLM</b>
      </div>
      <div className="guide-tx">
        <span className="is-in">{tx("Recibido", "Received")}</span>
        <b>+ 10 USDC</b>
      </div>
      <span className="guide-pill">{tx("Ver en testnet", "View on testnet")}</span>
    </Phone>
  )
}

function ScreenTrack() {
  return (
    <Phone eyebrow={tx("Seguir", "Track")} title={tx("Pegá el hash", "Paste the hash")} tone="lilac">
      <div className="guide-input">a1b2…f9</div>
      <div className="guide-btn-yellow is-small">{tx("Buscar", "Search")}</div>
      <p className="guide-mini">{tx("Confirmada en el ledger.", "Confirmed in the ledger.")}</p>
    </Phone>
  )
}

function ScreenPoolCreate() {
  return (
    <Phone eyebrow={tx("Nuevo pool", "New pool")} title={tx("La colecta", "The collection")} tone="lilac">
      <label>{tx("Título", "Title")}</label>
      <div className="guide-input">Olla del barrio</div>
      <label>{tx("Meta", "Goal")}</label>
      <div className="guide-input">500 XLM</div>
    </Phone>
  )
}

function ScreenPoolShare() {
  return (
    <Phone eyebrow="Pool" title={tx("Compartir", "Share")}>
      <div className="guide-code">est-4k2</div>
      <div className="guide-btn-yellow is-small">{tx("Copiar link", "Copy link")}</div>
      <p className="guide-mini">{tx("Aportan sin registrarse.", "They contribute without signing up.")}</p>
    </Phone>
  )
}

function ScreenPoolDash() {
  return (
    <Phone eyebrow="Detalle" title={tx("Olla del barrio", "Neighborhood pot")}>
      <p className="guide-hero-value">320 / 500 XLM</p>
      <div className="guide-bar">
        <span style={{ width: '64%' }} />
      </div>
      <p className="guide-mini">{tx("Progreso leído del vault.", "Progress read from the vault.")}</p>
    </Phone>
  )
}

function ScreenFamilyCreate() {
  return (
    <Phone eyebrow={tx("Familia", "Family")} title={tx("Nueva caja", "New box")} tone="lilac">
      <label>{tx("Nombre", "Name")}</label>
      <div className="guide-input">Casa mamá</div>
      <div className="guide-chip">Vos · depósito y retiro</div>
    </Phone>
  )
}

function ScreenFamilyDash() {
  return (
    <Phone eyebrow={tx("Bóveda", "Vault")} title="Patrimonio">
      <p className="guide-hero-value">1.250 XLM</p>
      <div className="guide-actions">
        <span>{tx("Depositar", "Deposit")}</span>
        <span>{tx("Retirar", "Withdraw")}</span>
      </div>
    </Phone>
  )
}

function ScreenFamilyVote() {
  return (
    <Phone eyebrow="Retiro" title={tx("En votación", "Awaiting signatures")}>
      <p className="guide-mini">{tx("Ya firmaron 1 de 2 wallets.", "1 of 2 wallets has signed.")}</p>
      <div className="guide-btn-yellow is-small">{tx("Firmar con Freighter", "Sign with Freighter")}</div>
    </Phone>
  )
}

function ScreenFamilyBlend() {
  return (
    <Phone eyebrow="Blend" title={tx("XLM a rendir", "XLM earning")}>
      <div className="guide-blend">
        <span>{tx("Puesto", "Supplied")}</span>
        <b>250 XLM</b>
      </div>
      <div className="guide-blend is-yield">
        <span>{tx("Interés", "Interest")}</span>
        <b>2,40 XLM</b>
      </div>
    </Phone>
  )
}
