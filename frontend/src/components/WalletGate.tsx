import type { ReactNode } from 'react'
import { useWallet } from '../context/WalletContext'
import { FreighterCta } from './FreighterCta'
import { Alert } from './ui/Alert'
import { FormPanel } from './layout/PageStage'

export function WalletGate({
  children,
  title,
  description,
  badge,
  preview,
}: {
  children: ReactNode
  title: string
  description: string
  badge?: ReactNode
  preview?: ReactNode
}) {
  const { publicKey, error } = useWallet()

  if (publicKey) return children

  return (
    <div className="space-y-4">
      {preview}
      <FormPanel className="mx-auto max-w-xl md:mx-0">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-purple">
          Billetera
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
        <p className="mt-3 text-base leading-7 text-purple-deep/75">{description}</p>
        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        <div className="mt-6">
          <FreighterCta />
        </div>
        {badge}
      </FormPanel>
    </div>
  )
}
