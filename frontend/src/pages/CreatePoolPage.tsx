import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AcceptedAssets } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import {
  buildVaultRegister,
  createCommunityPool,
  humanizeApiError,
  submitVaultTx,
} from '../lib/api'
import { TESTNET_NETWORK_PASSPHRASE, isStellarAmount, truncateKey } from '../lib/format'
import { signTransactionWithFreighter } from '../lib/freighter'
import { savePool } from '../lib/storage'
import type { CommunityPool } from '../types'

export function CreatePoolPage() {
  return (
    <PageStage
      kicker="Módulo 2"
      title="NUEVO POOL"
      subtitle="Tu wallet recibe las donaciones y nace registrado al vault: retiros al momento y meta enforced on-chain."
    >
      <WalletGate
        title="Conectá para crear un pool"
        description="La wallet conectada recibe las donaciones, queda como creadora y firma el alta en el vault."
      >
        <CreatePoolForm />
      </WalletGate>
    </PageStage>
  )
}

type CreatedPool = { pool: CommunityPool }

function CreatePoolForm() {
  const { publicKey } = useWallet()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [vaultBusy, setVaultBusy] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedPool | null>(null)
  const [vaultFailed, setVaultFailed] = useState(false)
  const reveal = useUnfoldDown('create-pool')

  async function registerVault(shortCode: string): Promise<void> {
    if (!publicKey) return
    setVaultBusy('Registrando en el vault…')
    try {
      const { xdr } = await buildVaultRegister(shortCode, publicKey)
      setVaultBusy('Firmá el alta del vault en Freighter…')
      const signed = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )
      setVaultBusy('Enviando a Soroban…')
      await submitVaultTx(shortCode, signed.signedXdr)
    } finally {
      setVaultBusy(null)
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!publicKey) return
    if (title.trim().length < 3) {
      setError('El título tiene que tener al menos 3 caracteres.')
      return
    }
    if (goal && !isStellarAmount(goal)) {
      setError('La meta tiene que ser un monto Stellar válido, o quedar vacía.')
      return
    }

    setLoading(true)
    try {
      const createdNow = await createCommunityPool({
        walletPublicKey: publicKey,
        title: title.trim(),
        goalAmount: goal.trim() || undefined,
        creator: publicKey,
      })
      savePool({
        id: createdNow.pool.id,
        shortCode: createdNow.pool.shortCode,
        title: createdNow.pool.title,
        createdAt: String(createdNow.pool.createdAt),
      })

      // Registro en el vault: paso explicito de la creacion. Si falla, el
      // pool existe (clasico) y se muestra como reintentar - nunca se
      // pierde.
      setError(null)
      setCreated(createdNow)
      try {
        await registerVault(createdNow.pool.shortCode)
      } catch (caught) {
        setVaultFailed(true)
        setError(
          `El pool se creó, pero el registro en el vault falló: ${humanizeApiError(caught)}`,
        )
      }
    } catch (caught) {
      setError(humanizeApiError(caught))
    } finally {
      setLoading(false)
    }
  }

  async function retryRegistration() {
    if (!publicKey || !created) return
    setError(null)
    setVaultFailed(false)
    try {
      await registerVault(created.pool.shortCode)
    } catch (caught) {
      setVaultFailed(true)
      setError(
        `Sigue fallando el registro en el vault: ${humanizeApiError(caught)}`,
      )
    }
  }

  if (created) {
    // El pool ya existe: si el vault fallo, acá se reintentar o se sigue.
    return (
      <div ref={reveal}>
        <FormPanel className="mx-auto max-w-2xl md:mx-0">
          <h2 className="text-xl font-black tracking-tight sm:text-2xl">
            {vaultFailed ? 'Pool creado, falta el vault' : 'Pool creado en el vault'}
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-purple-deep/75">
            {vaultFailed
              ? 'El pool funciona como clásico (donaciones directo a tu wallet) hasta que completes el alta en el vault.'
              : 'Las donaciones nuevas entran al vault: retiros al momento y meta enforced on-chain.'}
          </p>
          {vaultFailed && error ? <Alert tone="error">{error}</Alert> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {vaultFailed ? (
              <Button disabled={Boolean(vaultBusy)} onClick={() => void retryRegistration()}>
                Reintentar registro
              </Button>
            ) : null}
            <Button
              variant={vaultFailed ? 'ghost' : 'yellow'}
              onClick={() => navigate(`/pools/${created.pool.shortCode}`)}
            >
              Ir al pool →
            </Button>
          </div>
        </FormPanel>
      </div>
    )
  }

  return (
    <div ref={reveal}>
    <FormPanel className="mx-auto max-w-2xl md:mx-0">
      <form className="space-y-6" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Título" hint="Máximo 120 caracteres">
          <TextInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Olla popular del barrio"
          />
        </Field>
        <div className="form-note">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-purple-deep">
            Acepta
          </p>
          <div className="mt-3">
            <AcceptedAssets />
          </div>
          <p className="mt-3 text-base leading-6 text-purple-deep/80">
            USDC y EURC necesitan trustline en tu wallet (issuers Circle en
            testnet). XLM no.
          </p>
        </div>
        <Field label="Meta en XLM" hint="Opcional. Las donaciones de cualquier asset siguen siendo libres.">
          <TextInput
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="500"
            inputMode="decimal"
          />
        </Field>
        <div className="form-note">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-purple-deep">
            Wallet que recibe
          </p>
          <p className="mt-3 font-mono text-sm">
            {truncateKey(publicKey ?? '', 6)} · tu wallet conectada
          </p>
          <p className="mt-2 text-sm leading-5 text-purple-deep/70">
            Es la owner del vault: firma el alta al crear y después retira
            los fondos cuando quiera.
          </p>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {loading ? <Spinner label={vaultBusy ?? 'Creando pool…'} /> : null}
        <Button type="submit" disabled={loading}>
          Crear y registrar en el vault →
        </Button>
      </form>
    </FormPanel>
    </div>
  )
}
