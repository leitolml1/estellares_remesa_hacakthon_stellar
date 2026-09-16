import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../../context/WalletContext'
import { truncateKey } from '../../lib/format'
import { StarMark } from './StarMark'
import { StellarMark } from './StellarMark'

const links = [
  { to: '/enviar', label: 'Enviar' },
  { to: '/recibir', label: 'Recibir' },
  { to: '/historial', label: 'Historial' },
  { to: '/pools', label: 'Pools' },
  { to: '/familia', label: 'Familia' },
]

export function Navbar() {
  const { publicKey, connecting, connect, disconnect } = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  async function handleConnect() {
    try {
      await connect()
    } catch {
      // El error ya queda en el contexto para las pantallas.
    }
  }

  return (
    <header className="sticky top-0 z-30 px-3 pt-5 pb-4 sm:px-5 sm:pt-6 sm:pb-5">
      <div className="site-nav mx-auto max-w-7xl">
        <div className="relative z-10 flex items-center gap-3 px-3 py-2 sm:px-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5 pl-0.5">
            <StarMark />
            <span className="hidden leading-none sm:block">
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-purple">
                Remesa
              </span>
              <span className="mt-0.5 block text-sm font-semibold tracking-tight text-ink">
                Directa
              </span>
            </span>
          </NavLink>

          <nav className="mx-auto hidden items-center gap-0.5 rounded-full bg-purple-soft/70 p-1 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  [
                    'rounded-full px-3.5 py-1.5 text-sm transition',
                    isActive
                      ? 'bg-purple font-semibold text-white shadow-sm'
                      : 'text-purple-deep/70 hover:bg-white/80 hover:text-purple-deep',
                  ].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline-flex">
              <StellarMark
                size={16}
                tone="light"
                className="rounded-full border border-purple/15 bg-white/60 px-2.5 py-1"
              >
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-deep/70 xl:inline">
                  Powered by Stellar
                </span>
              </StellarMark>
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-purple/15 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-deep/70 md:inline-flex">
              <span className="nav-pulse" />
              Testnet
            </span>
            <button
              type="button"
              aria-label="Buscar pool"
              onClick={() => navigate('/pools')}
              className="grid h-10 w-10 place-items-center rounded-full border border-purple/15 bg-white/70 text-purple-deep hover:bg-white"
            >
              <SearchIcon />
            </button>
            {publicKey ? (
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => navigate('/perfil')}
                  className="rounded-full border border-purple/15 bg-white/70 px-3 py-2 font-mono text-xs text-ink"
                >
                  {truncateKey(publicKey, 5)}
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  className="rounded-full px-3 py-2 text-sm text-purple-deep/70 hover:text-purple-deep"
                >
                  Salir
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="hidden rounded-full bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep sm:inline-flex"
                onClick={() => void handleConnect()}
                disabled={connecting}
              >
                {connecting ? 'Conectando…' : 'Conectar Freighter'}
              </button>
            )}
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full border border-purple/20 text-ink lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
            >
              <span className="text-lg leading-none">{menuOpen ? '×' : '☰'}</span>
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="relative z-10 border-t border-purple/10 px-3 py-3 lg:hidden">
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    [
                      'rounded-2xl px-3 py-2.5 text-sm',
                      isActive
                        ? 'bg-purple font-semibold text-white'
                        : 'text-purple-deep/80 hover:bg-purple-soft hover:text-purple-deep',
                    ].join(' ')
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <NavLink
                to="/perfil"
                className="rounded-2xl px-3 py-2.5 text-sm text-purple-deep/80 hover:bg-purple-soft"
              >
                Perfil
              </NavLink>
              {publicKey ? (
                <button
                  type="button"
                  className="rounded-2xl px-3 py-2.5 text-left text-sm text-purple-deep/50"
                  onClick={disconnect}
                >
                  Desconectar {truncateKey(publicKey)}
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-2xl bg-purple px-3 py-2.5 text-left text-sm font-semibold text-white"
                  onClick={() => void handleConnect()}
                >
                  Conectar Freighter
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m13.5 13.5 3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
