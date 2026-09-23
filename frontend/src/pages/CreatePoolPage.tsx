import { useEffect, useState } from 'react'
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
  getQuote,
  humanizeApiError,
  submitVaultTx,
} from '../lib/api'
import { XLM_REFERENCE_RATES } from '../lib/assets'
import { TESTNET_NETWORK_PASSPHRASE, formatAmount, isStellarAmount, truncateKey } from '../lib/format'
import { signTransactionWithFreighter } from '../lib/freighter'
import { savePool } from '../lib/storage'
import type { CommunityPool } from '../types'

export function CreatePoolPage() {
  return (
    <PageStage
      title="NUEVO POOL"
      subtitle="Creá una colecta con meta. Compartí el link y cualquiera puede aportar."
    >
      <WalletGate
        title="Conectá para crear un pool"
        description="La wallet conectada recibe los aportes, queda como creadora y firma el alta."
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
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [vaultBusy, setVaultBusy] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedPool | null>(null)
  const [vaultFailed, setVaultFailed] = useState(false)
  const reveal = useUnfoldDown('create-pool')

  async function registerVault(shortCode: string): Promise<void> {
    if (!publicKey) return
    setVaultBusy('Registrando la colecta…')
    try {
      const built = await buildVaultRegister(shortCode, publicKey)
      // Reconciliado por el backend: el contrato ya tiene el pool (por
      // ejemplo, un alta que confirmo a pesar de un timeout reportado).
      if (built.already_registered || !built.xdr) return
      setVaultBusy('Firmá el alta en tu billetera…')
      const signed = await signTransactionWithFreighter(
        built.xdr,
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
    let deadlineValue: string | undefined
    if (deadline.trim()) {
      const parsed = new Date(deadline.trim())
      if (Number.isNaN(parsed.getTime())) {
        setError('La fecha límite no es una fecha válida.')
        return
      }
      if (parsed.getTime() <= Date.now()) {
        setError('La fecha límite tiene que ser futura.')
        return
      }
      deadlineValue = parsed.toISOString()
    }

    setLoading(true)
    try {
      const createdNow = await createCommunityPool({
        walletPublicKey: publicKey,
        title: title.trim(),
        goalAmount: goal.trim() || undefined,
        deadline: deadlineValue,
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
          `El pool se creó, pero el alta no se completó: ${humanizeApiError(caught)}`,
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
        `Sigue fallando el alta: ${humanizeApiError(caught)}`,
      )
    }
  }

  if (created) {
    // El pool ya existe: si el vault fallo, acá se reintentar o se sigue.
    return (
      <div ref={reveal}>
        <FormPanel className="mx-auto max-w-2xl md:mx-0">
          <h2 className="text-xl font-black tracking-tight sm:text-2xl">
            {vaultFailed ? 'Pool creado, falta completar el alta' : 'Pool creado'}
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-purple-deep/75">
            {vaultFailed
              ? 'Los aportes van directo a tu wallet hasta que completes el alta.'
              : 'Ya podés compartir el link. Los aportes entran a la colecta y podés retirar cuando quieras.'}
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
            USDC y EURC necesitan activar el activo en tu billetera
            (Circle en testnet). XLM no.
          </p>
        </div>
        <Field label="Meta en XLM" hint="Opcional. Las donaciones de cualquier asset siguen siendo libres.">
          <TextInput
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="500"
            inputMode="decimal"
          />
          <GoalFx xlm={goal} />
        </Field>
        <Field
          label="Fecha límite"
          hint="Opcional. Informativa: se muestra como countdown en el pool."
        >
          <TextInput
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
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
            Es la cuenta que firma el alta al crear y después retira
            los fondos cuando quiera.
          </p>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {loading ? <Spinner label={vaultBusy ?? 'Creando pool…'} /> : null}
        <Button type="submit" disabled={loading}>
          Crear colecta →
        </Button>
      </form>
    </FormPanel>
    </div>
  )
}

function GoalFx({ xlm }: { xlm: string }) {
  const trimmed = xlm.trim()
  const valid = isStellarAmount(trimmed)
  const [quoted, setQuoted] = useState<{
    xlm: string
    usdc: string
    eurc: string
    source: string
  } | null>(null)

  useEffect(() => {
    if (!valid) {
      setQuoted(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      Promise.all([
        getQuote('XLM', 'USDC', trimmed),
        getQuote('XLM', 'EURC', trimmed),
      ])
        .then(([usdcQuote, eurcQuote]) => {
          if (cancelled) return
          setQuoted({
            xlm: trimmed,
            usdc: usdcQuote.destAmount,
            eurc: eurcQuote.destAmount,
            source: usdcQuote.source,
          })
        })
        .catch(() => {
          if (!cancelled) setQuoted(null)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmed, valid])

  if (!valid) return null

  const live = quoted?.xlm === trimmed ? quoted : null
  const usdc = live?.usdc ?? xlmToAsset(trimmed, 'USDC')
  const eurc = live?.eurc ?? xlmToAsset(trimmed, 'EURC')
  const source = live?.source ?? 'reference'

  return (
    <p className="goal-fx">
      ≈ {formatAmount(usdc, 'USDC')} · {formatAmount(eurc, 'EURC')}
      <span>
        {source === 'dex' ? 'cotización del DEX' : 'tasa referencial de testnet'}
      </span>
    </p>
  )
}

function xlmToAsset(xlm: string, code: 'USDC' | 'EURC'): string {
  const rate = XLM_REFERENCE_RATES[code]
  if (!rate) return '0'
  return String(Number(xlm) / rate)
}
