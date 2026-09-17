import { useWallet } from '../context/WalletContext'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'

export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/'

export function FreighterCta({
  compact = false,
  tone = 'light',
  label = 'Conectar Freighter',
  onConnected,
}: {
  compact?: boolean
  tone?: 'light' | 'dark'
  label?: string
  onConnected?: () => void
}) {
  const { available, connecting, connect } = useWallet()
  const dark = tone === 'dark'

  async function handleConnect() {
    await connect()
    onConnected?.()
  }

  if (available === false) {
    if (compact) {
      return (
        <a
          href={FREIGHTER_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="nav-connect"
        >
          Instalar Freighter
        </a>
      )
    }
    return (
      <div className="space-y-3">
        {dark ? (
          <p className="text-sm leading-6 text-white/70">
            No detectamos Freighter. Es la billetera del navegador para firmar.
          </p>
        ) : (
          <Alert tone="error">
            No detectamos Freighter. Es la billetera del navegador para firmar.
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <a href={FREIGHTER_INSTALL_URL} target="_blank" rel="noreferrer">
            <Button>Instalar Freighter</Button>
          </a>
          <Button
            variant={dark ? 'white' : 'ghost'}
            onClick={() => window.location.reload()}
          >
            Ya la instalé, recargar
          </Button>
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        className="nav-connect"
        onClick={() => void handleConnect()}
        disabled={connecting}
      >
        {connecting ? 'Conectando…' : 'Conectar Freighter'}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void handleConnect()} disabled={connecting}>
        {connecting ? 'Conectando…' : label}
      </Button>
      <p className={`text-sm leading-6 ${dark ? 'text-white/60' : 'text-purple-deep/70'}`}>
        Billetera Stellar en el navegador.{' '}
        <a
          className="underline"
          href={FREIGHTER_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
        >
          Instalar Freighter
        </a>
      </p>
    </div>
  )
}
