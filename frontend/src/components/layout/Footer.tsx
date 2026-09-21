import { Link } from 'react-router-dom'
import { GalaxyField } from './GalaxyField'
import { StarMark } from './StarMark'
import { StellarMark } from './StellarMark'

export function Footer() {
  return (
    <footer className="relative mx-auto mb-5 w-full max-w-7xl px-3 sm:px-5">
      <div className="relative overflow-hidden rounded-[36px] bg-ink text-paper">
        <GalaxyField tone="void" />
        <span className="doodle-grid pointer-events-none absolute inset-y-0 right-0 w-1/4 opacity-20" />
        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2 sm:px-10 lg:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StarMark className="h-8 w-11" />
              <span className="text-sm font-semibold">Estelares</span>
            </div>
            <p className="text-sm leading-6 text-white/60">
              Remesas, pools comunitarios y ahorro familiar sobre Stellar
              testnet. La firma siempre queda en tu wallet.
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-yellow">
              Producto
            </h3>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <Link to="/enviar">Pago directo</Link>
              <Link to="/pools/nuevo">Pool comunitario</Link>
              <Link to="/familia">Pool familiar</Link>
              <Link to="/como-funciona">Cómo funciona</Link>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-yellow">
              Red
            </h3>
            <div className="mb-3 flex flex-col gap-1.5">
              <StellarMark variant="wordmark" size={20} tone="dark" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Powered by Stellar
              </span>
            </div>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <span>Horizon testnet</span>
              <span>Freighter wallet</span>
              <span>Pago con QR</span>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-yellow">
              Hackathon
            </h3>
            <p className="text-sm leading-6 text-white/70">
              Estellares · checkpoint 20/09 · Módulo 1, 2 y 3 con backend
              Django.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
