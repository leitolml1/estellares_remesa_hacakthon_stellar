import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../../context/WalletContext'
import { truncateKey } from '../../lib/format'
import { FreighterCta } from '../FreighterCta'
import { StarMark } from './StarMark'

const links = [
  { to: '/enviar', label: 'Enviar' },
  { to: '/recibir', label: 'Recibir' },
  { to: '/historial', label: 'Historial' },
  { to: '/pools', label: 'Pools' },
  { to: '/familia', label: 'Familia' },
  { to: '/como-funciona', label: 'Guía' },
]

type OpenMenu = 'more' | 'wallet' | 'search' | null

export function Navbar() {
  const { publicKey, disconnect } = useWallet()
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [copied, setCopied] = useState(false)
  const [poolQuery, setPoolQuery] = useState('')
  const navRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setOpenMenu(null)
  }, [location.pathname])

  useEffect(() => {
    if (!openMenu) return
    function onPointer(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  useEffect(() => {
    if (openMenu === 'search') searchInput.current?.focus()
  }, [openMenu])

  function toggle(menu: OpenMenu) {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  async function copyAddress() {
    if (!publicKey) return
    await navigator.clipboard.writeText(publicKey)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function goToPool(event: FormEvent) {
    event.preventDefault()
    const code = parsePoolRef(poolQuery)
    if (!code) return
    setPoolQuery('')
    setOpenMenu(null)
    navigate(`/pools/${code}`)
  }

  return (
    <header className="sticky top-0 z-30 px-3 pt-5 pb-4 sm:px-5 sm:pt-6 sm:pb-5">
      <div className="site-nav mx-auto max-w-7xl" ref={navRef}>
        <div className="relative z-10 flex items-center gap-2 px-3 py-1.5 sm:px-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5 pl-0.5">
            <StarMark tone="light" />
            <span className="hidden leading-none sm:block">
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-purple">
                Estelares
              </span>
              <span className="mt-0.5 block text-sm font-semibold tracking-tight text-ink">
                Remesas
              </span>
            </span>
          </NavLink>

          <nav className="nav-links" aria-label="Principal">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'is-active' : ''}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="nav-testnet">
              <span className="nav-pulse" />
              Testnet
            </span>
            <div className="relative">
              <button
                type="button"
                aria-label="Ir a pool por short code"
                aria-expanded={openMenu === 'search'}
                onClick={() => toggle('search')}
                className="nav-icon-btn"
              >
                <SearchIcon />
              </button>
              {openMenu === 'search' ? (
                <form className="nav-popover is-search" onSubmit={goToPool}>
                  <label className="nav-search-label" htmlFor="nav-pool-code">
                    Ir a pool
                  </label>
                  <div className="nav-search-row">
                    <input
                      id="nav-pool-code"
                      ref={searchInput}
                      value={poolQuery}
                      onChange={(event) => setPoolQuery(event.target.value)}
                      placeholder="Short code o link"
                      spellCheck={false}
                    />
                    <button type="submit">Abrir</button>
                  </div>
                </form>
              ) : null}
            </div>
            {publicKey ? (
              <div className="relative">
                <button
                  type="button"
                  className="nav-wallet"
                  aria-expanded={openMenu === 'wallet'}
                  aria-haspopup="menu"
                  onClick={() => toggle('wallet')}
                >
                  {truncateKey(publicKey, 5)}
                </button>
                {openMenu === 'wallet' ? (
                  <div className="nav-popover" role="menu">
                    <button
                      type="button"
                      className="nav-popover-item"
                      role="menuitem"
                      onClick={() => void copyAddress()}
                    >
                      {copied ? 'Address copiada' : 'Copiar address'}
                    </button>
                    <button
                      type="button"
                      className="nav-popover-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenu(null)
                        disconnect()
                      }}
                    >
                      Salir
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <FreighterCta compact />
            )}
            <div className="nav-more">
              <button
                type="button"
                className="nav-more-btn"
                aria-expanded={openMenu === 'more'}
                aria-haspopup="true"
                onClick={() => toggle('more')}
              >
                Más
              </button>
              {openMenu === 'more' ? (
                <div className="nav-popover">
                  {links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `nav-popover-item ${isActive ? 'is-active' : ''}`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                  <NavLink to="/perfil" className="nav-popover-item">
                    Perfil
                  </NavLink>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

function parsePoolRef(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/\/pools\/([^/?#]+)/)
  return match?.[1] ?? trimmed
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
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
