import { useWallet } from '../context/WalletContext'
import { tx } from '../i18n'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'

export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/'

export function FreighterCta({
  compact = false,
  tone = 'light',
  label,
  onConnected,
}: {
  compact?: boolean
  tone?: 'light' | 'dark'
  label?: string
  onConnected?: () => void
}) {
  const { available, connecting, connect } = useWallet()
  const dark = tone === 'dark'
  const connectLabel = label ?? tx('Conectar Freighter', 'Connect Freighter')

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
          {tx('Instalar Freighter', 'Install Freighter')}
        </a>
      )
    }
    return (
      <div className="space-y-3">
        {dark ? (
          <p className="text-sm leading-6 text-white/70">
            {tx(
              'No detectamos Freighter. Es la billetera del navegador para firmar.',
              'Freighter was not detected. It is the browser wallet used to sign.',
            )}
          </p>
        ) : (
          <Alert tone="error">
            {tx(
              'No detectamos Freighter. Es la billetera del navegador para firmar.',
              'Freighter was not detected. It is the browser wallet used to sign.',
            )}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <a href={FREIGHTER_INSTALL_URL} target="_blank" rel="noreferrer">
            <Button>{tx('Instalar Freighter', 'Install Freighter')}</Button>
          </a>
          <Button
            variant={dark ? 'white' : 'ghost'}
            onClick={() => window.location.reload()}
          >
            {tx('Ya la instalé, recargar', 'I installed it, reload')}
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
        {connecting ? tx('Conectando…', 'Connecting…') : tx('Conectar Freighter', 'Connect Freighter')}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void handleConnect()} disabled={connecting}>
        {connecting ? tx('Conectando…', 'Connecting…') : connectLabel}
      </Button>
      <p className={`text-sm leading-6 ${dark ? 'text-white/60' : 'text-purple-deep/70'}`}>
        {tx('Billetera Stellar en el navegador.', 'Stellar wallet in the browser.')}{' '}
        <a
          className="underline"
          href={FREIGHTER_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
        >
          {tx('Instalar Freighter', 'Install Freighter')}
        </a>
      </p>
    </div>
  )
}
