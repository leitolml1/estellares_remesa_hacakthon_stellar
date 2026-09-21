import type { ReactNode } from 'react'
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

const TOC = [
  { href: '#empezar', label: 'Empezar' },
  { href: '#enviar', label: 'Enviar' },
  { href: '#recibir', label: 'Recibir' },
  { href: '#historial', label: 'Historial' },
  { href: '#pools', label: 'Pool comunitario' },
  { href: '#familia', label: 'Caja familiar' },
] as const

export function HowItWorksPage() {
  return (
    <PageStage
      className="guide-stage"
      kicker="Guía"
      title="Cómo funciona"
      subtitle="Siempre es lo mismo: armás en la app, firmás en Freighter y Stellar confirma. Tu clave no sale del navegador."
    >
      <nav className="guide-toc" aria-label="Secciones de la guía">
        {TOC.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <GuideBlock
        id="empezar"
        kicker="Antes de operar"
        title="Conectá Freighter"
        to="/"
        cta="Ir al inicio"
        icon={<IconKey className="h-4 w-4" />}
        steps={[
          {
            title: 'Instalá la billetera',
            body: 'Freighter es la extensión del navegador. Sin ella no se puede firmar. En Chrome o Brave: Instalar Freighter, crear o importar una cuenta.',
            screen: <ScreenFreighter />,
          },
          {
            title: 'Poné Test Network',
            body: 'Estelares corre en Stellar testnet, no en mainnet. En Freighter: Network → Test Network. Pedí XLM de prueba con Friendbot si la cuenta está vacía.',
            screen: <ScreenNetwork />,
          },
          {
            title: 'Conectá en Estelares',
            body: 'Arriba a la derecha, “Conectar Freighter”. Aceptá el permiso. A partir de ahí la app ve tu public key y puede armar transacciones para que vos las firmes.',
            screen: <ScreenConnect />,
          },
        ]}
      />

      <GuideBlock
        id="enviar"
        kicker="Pago directo"
        title="Enviar plata"
        to="/enviar"
        cta="Ir a Enviar"
        icon={<IconSend className="h-4 w-4" />}
        steps={[
          {
            title: 'Destino y monto',
            body: 'Pegá la public key G… de quien recibe, o elegí un contacto. El monto va en el activo que envías: XLM, USDC o EURC.',
            screen: <ScreenSendForm />,
          },
          {
            title: 'Enviás y Recibe, al lado',
            body: 'Si mandás XLM y la otra persona quiere USDC, la app cotiza el camino. Si es el mismo activo, llega exactamente lo que pusiste.',
            screen: <ScreenSendAssets />,
          },
          {
            title: 'Firmar y listo',
            body: '“Firmar y enviar” abre Freighter. Aprobá. Vas a ver Armar → Firmar → Enviar → Listo, y un link para ver la transacción en testnet.',
            screen: <ScreenStepper />,
          },
        ]}
      />

      <GuideBlock
        id="recibir"
        kicker="Pago directo"
        title="Recibir con QR"
        to="/recibir"
        cta="Ir a Recibir"
        icon={<IconReceive className="h-4 w-4" />}
        steps={[
          {
            title: 'Elegí el activo',
            body: 'En Recibir, elegí XLM, USDC o EURC. El QR queda armado para esa moneda. Si pedís USDC/EURC, tu cuenta tiene que tener el activo activado.',
            screen: <ScreenReceive />,
          },
          {
            title: 'Mostrá o copiá',
            body: 'Quien te paga puede escanear el QR o usar tu address. También podés copiar el link de pago. No hace falta que la otra persona tenga Estelares: alcanza una billetera Stellar.',
            screen: <ScreenReceiveCopy />,
          },
        ]}
      />

      <GuideBlock
        id="historial"
        kicker="Seguimiento"
        title="Historial y seguimiento"
        to="/historial"
        cta="Ir al historial"
        icon={<IconActivity className="h-4 w-4" />}
        steps={[
          {
            title: 'Lo que salió y lo que entró',
            body: 'Historial lee el ledger de Stellar. Cada fila muestra enviado o recibido, el monto y un chip “Ver en testnet” para abrir Stellar Expert.',
            screen: <ScreenHistory />,
          },
          {
            title: 'Seguí un hash',
            body: 'Si te compartieron un hash de transacción, andá a Seguir remesa, pegalo, y ves si ya confirmó. Sirve para mostrarle a quien espera la plata.',
            screen: <ScreenTrack />,
          },
        ]}
      />

      <GuideBlock
        id="pools"
        kicker="Comunidad"
        title="Pool comunitario"
        to="/pools/nuevo"
        cta="Crear un pool"
        icon={<IconUsers className="h-4 w-4" />}
        steps={[
          {
            title: 'Creá la colecta',
            body: 'Título, meta y (si querés) fecha límite. La wallet conectada queda como dueña. Después Freighter pide registrar el vault: esa segunda firma deja el pool on-chain.',
            screen: <ScreenPoolCreate />,
          },
          {
            title: 'Compartí el link o el código',
            body: 'Cualquiera puede aportar sin registrarse. Copiá el link, el short code o el QR. La lupa del header también abre un pool pegando el código.',
            screen: <ScreenPoolShare />,
          },
          {
            title: 'Aportar y retirar',
            body: 'Quien dona firma en Freighter. El progreso y el ranking salen del contrato, no de una planilla. El dueño retira a una cuenta; no puede donarse a sí mismo ni sacar de más.',
            screen: <ScreenPoolDash />,
          },
        ]}
      />

      <GuideBlock
        id="familia"
        kicker="Familia"
        title="Caja familiar"
        to="/familia"
        cta="Ir a Familia"
        icon={<IconFamily className="h-4 w-4" />}
        steps={[
          {
            title: 'Armá la caja',
            body: 'Nombre y wallets. Cada una puede depositar, retirar, o las dos cosas. Se crea una cuenta nueva en el navegador; las claves no viajan al servidor.',
            screen: <ScreenFamilyCreate />,
          },
          {
            title: 'Depositá o mostrá el QR',
            body: 'Cualquier miembro con depósito suma fondos. El QR es de la caja, no de tu wallet. El patrimonio suma el XLM ocioso más lo que está en Blend.',
            screen: <ScreenFamilyDash />,
          },
          {
            title: 'Retiro con más de una firma',
            body: 'Pedir retiro abre Freighter. Si falta el quórum, queda “en votación”: otro familiar conecta y firma. Recién ahí sale la plata.',
            screen: <ScreenFamilyVote />,
          },
          {
            title: 'Poner XLM a rendir',
            body: 'Solo XLM entra a Blend en esta demo. En la card “XLM en Blend” ves puesto a rendir, valor actual e interés leído del contrato. Sacar del rendimiento pide las mismas firmas que un retiro.',
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
    <Phone eyebrow="Navegador" title="Freighter">
      <div className="guide-chip">Extensión · Chrome / Brave</div>
      <div className="guide-btn-yellow">Instalar Freighter</div>
    </Phone>
  )
}

function ScreenNetwork() {
  return (
    <Phone eyebrow="Freighter" title="Network">
      <div className="guide-row is-on">Test Network</div>
      <div className="guide-row">Public Network</div>
      <p className="guide-mini">Estelares usa testnet.</p>
    </Phone>
  )
}

function ScreenConnect() {
  return (
    <Phone eyebrow="Estelares" title="Header">
      <div className="guide-nav-fake">
        <span className="guide-dot-yellow" />
        <span className="guide-btn-yellow is-small">Conectar Freighter</span>
      </div>
      <p className="guide-mini">Aceptá el permiso en el popup.</p>
    </Phone>
  )
}

function ScreenSendForm() {
  return (
    <Phone eyebrow="Enviar" title="Armá el envío" tone="lilac">
      <label>Destino</label>
      <div className="guide-input">G… familiar</div>
      <label>Monto (en XLM)</label>
      <div className="guide-input">25.5</div>
    </Phone>
  )
}

function ScreenSendAssets() {
  return (
    <Phone eyebrow="Enviar" title="Enviás → Recibe" tone="lilac">
      <div className="guide-pair">
        <div>
          <span>Enviás</span>
          <b>XLM</b>
        </div>
        <i>→</i>
        <div>
          <span>Recibe</span>
          <b>USDC</b>
        </div>
      </div>
      <p className="guide-mini">La cotización aparece si son distintos.</p>
    </Phone>
  )
}

function ScreenStepper() {
  return (
    <Phone eyebrow="Freighter" title="Confirmar">
      <ol className="guide-stepper">
        <li className="is-done">Armar</li>
        <li className="is-done">Firmar</li>
        <li className="is-on">Enviar</li>
        <li>Listo</li>
      </ol>
    </Phone>
  )
}

function ScreenReceive() {
  return (
    <Phone eyebrow="Recibir" title="Tu QR" tone="purple">
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
    <Phone eyebrow="Recibir" title="Compartir" tone="purple">
      <div className="guide-btn-yellow">Copiar address</div>
      <div className="guide-btn-ghost">Copiar link de pago</div>
    </Phone>
  )
}

function ScreenHistory() {
  return (
    <Phone eyebrow="Historial" title="Movimientos" tone="lilac">
      <div className="guide-tx">
        <span className="is-out">Enviado</span>
        <b>− 25,5 XLM</b>
      </div>
      <div className="guide-tx">
        <span className="is-in">Recibido</span>
        <b>+ 10 USDC</b>
      </div>
      <span className="guide-pill">Ver en testnet</span>
    </Phone>
  )
}

function ScreenTrack() {
  return (
    <Phone eyebrow="Seguir" title="Pegá el hash" tone="lilac">
      <div className="guide-input">a1b2…f9</div>
      <div className="guide-btn-yellow is-small">Buscar</div>
      <p className="guide-mini">Confirmada en el ledger.</p>
    </Phone>
  )
}

function ScreenPoolCreate() {
  return (
    <Phone eyebrow="Nuevo pool" title="La colecta" tone="lilac">
      <label>Título</label>
      <div className="guide-input">Olla del barrio</div>
      <label>Meta</label>
      <div className="guide-input">500 XLM</div>
    </Phone>
  )
}

function ScreenPoolShare() {
  return (
    <Phone eyebrow="Pool" title="Compartir">
      <div className="guide-code">est-4k2</div>
      <div className="guide-btn-yellow is-small">Copiar link</div>
      <p className="guide-mini">Aportan sin registrarse.</p>
    </Phone>
  )
}

function ScreenPoolDash() {
  return (
    <Phone eyebrow="Detalle" title="Olla del barrio">
      <p className="guide-hero-value">320 / 500 XLM</p>
      <div className="guide-bar">
        <span style={{ width: '64%' }} />
      </div>
      <p className="guide-mini">Progreso leído del vault.</p>
    </Phone>
  )
}

function ScreenFamilyCreate() {
  return (
    <Phone eyebrow="Familia" title="Nueva caja" tone="lilac">
      <label>Nombre</label>
      <div className="guide-input">Casa mamá</div>
      <div className="guide-chip">Vos · depósito y retiro</div>
    </Phone>
  )
}

function ScreenFamilyDash() {
  return (
    <Phone eyebrow="Bóveda" title="Patrimonio">
      <p className="guide-hero-value">1.250 XLM</p>
      <div className="guide-actions">
        <span>Depositar</span>
        <span>Retirar</span>
      </div>
    </Phone>
  )
}

function ScreenFamilyVote() {
  return (
    <Phone eyebrow="Retiro" title="En votación">
      <p className="guide-mini">Ya firmaron 1 de 2 wallets.</p>
      <div className="guide-btn-yellow is-small">Firmar con Freighter</div>
    </Phone>
  )
}

function ScreenFamilyBlend() {
  return (
    <Phone eyebrow="Blend" title="XLM a rendir">
      <div className="guide-blend">
        <span>Puesto</span>
        <b>250 XLM</b>
      </div>
      <div className="guide-blend is-yield">
        <span>Interés</span>
        <b>2,40 XLM</b>
      </div>
    </Phone>
  )
}
