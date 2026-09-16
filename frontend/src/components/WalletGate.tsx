import type { ReactNode } from 'react'
import { useWallet } from '../context/WalletContext'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { FormPanel } from './layout/PageStage'

export function WalletGate({
  children,
  title,
  description,
  badge,
}: {
  children: ReactNode
  title: string
  description: string
  badge?: ReactNode
}) {
  const { publicKey, connecting, connect, error, available } = useWallet()

  if (publicKey) return children

  return (
    <FormPanel className="mx-auto max-w-xl md:mx-0">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-purple">
        Freighter
      </p>
      <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-3 text-base leading-7 text-purple-deep/75">{description}</p>
      {available === false ? (
        <div className="mt-4">
          <Alert tone="error">
            No detectamos Freighter. Instalá la extensión y recargá esta
            página.
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <div className="mt-6">
        <Button onClick={() => void connect()} disabled={connecting}>
          {connecting ? 'Conectando…' : 'Conectar Freighter'}
        </Button>
      </div>
      {badge}
    </FormPanel>
  )
}
