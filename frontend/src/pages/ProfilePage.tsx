import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { Progress } from '../components/ui/Progress'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import {
  createRecurring,
  deleteRecurring,
  getPaymentHistory,
  humanizeApiError,
  listRecurring,
  patchRecurring,
} from '../lib/api'
import {
  deleteContact,
  getContacts,
  saveContact,
} from '../lib/contacts'
import {
  explorerAccountUrl,
  formatAmount,
  formatDate,
  isStellarAmount,
  isStellarPublicKey,
  truncateKey,
} from '../lib/format'
import type { KnownAssetCode } from '../lib/assets'
import { computeTrustScore } from '../lib/score'
import { getSavedPools } from '../lib/storage'
import type {
  Contact,
  RecurringFrequency,
  RecurringTransfer,
  TrustScoreBreakdown,
} from '../types'

export function ProfilePage() {
  return (
    <PageStage
      title="PERFIL"
      subtitle="Tu reputación se calcula acá, con tu historial y tus pools."
    >
      <WalletGate
        title="Conectá para ver tu perfil"
        description="Tu reputación se calcula acá con tu historial."
      >
        <ProfileContent />
      </WalletGate>
    </PageStage>
  )
}

function ProfileContent() {
  const { publicKey } = useWallet()
  const [score, setScore] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reveal = useUnfoldDown('profile')

  useEffect(() => {
    if (!publicKey) return
    const key = publicKey
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const history = await getPaymentHistory(key, { limit: 50 })
        if (cancelled) return
        const computed = computeTrustScore(history.records, getSavedPools().length)
        setScore(computed.score)
        setBreakdown(computed.breakdown)
      } catch (caught) {
        if (!cancelled) setError(humanizeApiError(caught))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [publicKey])

  if (!publicKey) return null

  return (
    <div ref={reveal} className="space-y-4">
      <div className="stage-card unfold-down rounded-[28px] bg-purple p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow">
          Wallet
        </p>
        <p className="mt-3 font-mono text-sm">{truncateKey(publicKey, 8)}</p>
        <a
          className="mt-4 inline-block text-sm text-yellow underline"
          href={explorerAccountUrl(publicKey)}
          target="_blank"
          rel="noreferrer"
        >
          Abrir en Explorer
        </a>
      </div>

      <FormPanel>
        <h2 className="text-3xl font-black tracking-tight">Trust score</h2>
        {loading ? (
          <div className="mt-6">
            <Spinner label="Calculando con Horizon…" />
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        {score !== null && breakdown ? (
          <div className="mt-8 grid gap-8 md:grid-cols-[160px_1fr]">
            <div className="grid place-items-center rounded-[28px] bg-ink text-white">
              <div className="py-8 text-center">
                <p className="text-6xl font-black">{score}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-yellow">
                  / 100
                </p>
              </div>
            </div>
            <div className="space-y-5">
              <Row label="Frecuencia (30 días)" value={breakdown.frequency} />
              <Row label="Volumen" value={breakdown.volume} />
              <Row label="Participación en pools" value={breakdown.pools} />
              <Row label="Antigüedad" value={breakdown.seniority} />
            </div>
          </div>
        ) : null}
      </FormPanel>

      <ContactsPanel />

      <RecurringPanel />
    </div>
  )
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
}

const FREQUENCY_CHOICES: RecurringFrequency[] = ['weekly', 'biweekly', 'monthly']

function RecurringPanel() {
  const { publicKey } = useWallet()
  const navigate = useNavigate()
  const [rules, setRules] = useState<RecurringTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [assetCode, setAssetCode] = useState<KnownAssetCode>('XLM')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [note, setNote] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  async function load() {
    if (!publicKey) return
    setLoading(true)
    setError(null)
    try {
      setRules(await listRecurring(publicKey))
    } catch (caught) {
      setError(humanizeApiError(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!publicKey) return
    void load()
  }, [publicKey])

  async function createRule(event: React.FormEvent) {
    event.preventDefault()
    if (!publicKey) return
    setFormError(null)
    if (!isStellarPublicKey(receiver)) {
      setFormError('El destinatario tiene que ser una public key G… válida.')
      return
    }
    if (!isStellarAmount(amount)) {
      setFormError('El monto tiene que ser positivo, con hasta 7 decimales.')
      return
    }
    try {
      await createRecurring({
        sender: publicKey,
        receiver: receiver.trim(),
        amount: amount.trim(),
        assetCode,
        frequency,
        note: note.trim() || undefined,
      })
      setReceiver('')
      setAmount('')
      setNote('')
      await load()
    } catch (caught) {
      setFormError(humanizeApiError(caught))
    }
  }

  async function patch(rule: RecurringTransfer, body: { active?: boolean; paid?: boolean }) {
    if (!publicKey) return
    setBusyId(rule.id)
    try {
      await patchRecurring(rule.id, { senderPublicKey: publicKey, ...body })
      await load()
    } catch (caught) {
      setError(humanizeApiError(caught))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(rule: RecurringTransfer) {
    if (!publicKey) return
    setBusyId(rule.id)
    try {
      await deleteRecurring(rule.id, publicKey)
      await load()
    } catch (caught) {
      setError(humanizeApiError(caught))
    } finally {
      setBusyId(null)
    }
  }

  if (!publicKey) return null

  const dueRules = rules.filter(
    (rule) => rule.active && new Date(rule.nextRunAt).getTime() <= now,
  )

  return (
    <FormPanel>
      <h2 className="text-2xl font-black tracking-tight">Pagos programados</h2>
      <p className="mt-1.5 text-sm leading-5 text-purple-deep/75">
        Recordatorios de remesas recurrentes, sin custodia: cuando vence una
        regla, la avisamos y pagás en un click firmando tu billetera. Nunca
        movemos fondos por vos.
      </p>

      {loading ? (
        <div className="mt-5">
          <Spinner label="Buscando tus pagos programados…" />
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {rules.length > 0 ? (
        <ul className="mt-5 divide-y divide-purple/15">
          {rules.map((rule) => {
            const due = dueRules.some((item) => item.id === rule.id)
            return (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-semibold">
                    {formatAmount(rule.amount, rule.assetCode)} {FREQUENCY_LABELS[rule.frequency] ?? rule.frequency}
                    {!rule.active ? <span className="ml-2 text-xs text-purple-deep/60">pausada</span> : null}
                    {rule.active && due ? (
                      <span className="ml-2 rounded-full bg-yellow px-2 py-0.5 text-xs font-black text-ink">
                        vencida
                      </span>
                    ) : null}
                  </p>
                  <p
                    className="font-mono text-xs text-purple-deep/60"
                    title={rule.receiver}
                  >
                    → {truncateKey(rule.receiver, 5)}
                    {rule.note ? ` · ${rule.note}` : ''}
                  </p>
                  <p className="text-xs text-purple-deep/60">
                    Próxima: {formatDate(rule.nextRunAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {rule.active && due ? (
                    <Button
                      variant="yellow"
                      disabled={busyId === rule.id}
                      onClick={() =>
                        navigate(
                          `/enviar?to=${rule.receiver}&amount=${rule.amount}&asset=${rule.assetCode}`,
                        )
                      }
                    >
                      Pagar ahora →
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className="text-sm text-purple underline"
                    disabled={busyId === rule.id}
                    onClick={() => void patch(rule, { paid: true })}
                  >
                    Ya pagué
                  </button>
                  <button
                    type="button"
                    className="text-sm text-purple underline"
                    disabled={busyId === rule.id}
                    onClick={() => void patch(rule, { active: !rule.active })}
                  >
                    {rule.active ? 'Pausar' : 'Reactivar'}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-purple underline"
                    disabled={busyId === rule.id}
                    onClick={() => void remove(rule)}
                  >
                    Borrar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : !loading ? (
        <p className="mt-4 text-base text-purple-deep/70">
          No tenés pagos programados. Creá el primero abajo.
        </p>
      ) : null}

      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void createRule(event)}>
        <Field label="Destinatario" hint="Public key G… de quien recibe">
          <TextInput
            value={receiver}
            onChange={(event) => setReceiver(event.target.value)}
            placeholder="G..."
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Monto">
          <TextInput
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="25.5"
            inputMode="decimal"
          />
        </Field>
        <Field label="Activo">
          <div className="flex flex-wrap gap-2">
            {(['XLM', 'USDC', 'EURC'] as const).map((code) => (
              <button
                key={code}
                type="button"
                className={`history-chip ${assetCode === code ? 'is-active' : ''}`}
                aria-pressed={assetCode === code}
                onClick={() => setAssetCode(code)}
              >
                {code}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Frecuencia">
          <div className="flex flex-wrap gap-2">
            {FREQUENCY_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`history-chip ${frequency === choice ? 'is-active' : ''}`}
                aria-pressed={frequency === choice}
                onClick={() => setFrequency(choice)}
              >
                {FREQUENCY_LABELS[choice]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Nota" hint="Opcional">
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ayuda mensual"
            maxLength={140}
          />
        </Field>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <div className="sm:col-span-2">
          <Button type="submit">Programar remesa →</Button>
        </div>
      </form>
    </FormPanel>
  )
}

function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>(() => getContacts())
  const [alias, setAlias] = useState('')
  const [walletKey, setWalletKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  function refresh() {
    setContacts(getContacts())
  }

  function addContact(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setOkMessage(null)
    if (!isStellarPublicKey(walletKey)) {
      setError('La wallet no es una public key G… válida.')
      return
    }
    const contact = saveContact(walletKey, alias)
    if (!contact) {
      setError('No se pudo guardar el contacto.')
      return
    }
    setAlias('')
    setWalletKey('')
    setOkMessage(
      contact.alias
        ? `Contacto guardado: ${contact.alias}`
        : 'Contacto guardado.',
    )
    refresh()
  }

  function removeContact(publicKey: string) {
    deleteContact(publicKey)
    setOkMessage(null)
    refresh()
  }

  return (
    <FormPanel>
      <h2 className="text-2xl font-black tracking-tight">Contactos</h2>
      <p className="mt-1.5 text-sm leading-5 text-purple-deep/75">
        Tu libreta vive en este dispositivo: alias para enviar sin pegar la
        llave G… completa.
      </p>

      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => void addContact(event)}
      >
        <Field label="Alias">
          <TextInput
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="Mamá"
            maxLength={40}
          />
        </Field>
        <Field label="Public key">
          <TextInput
            value={walletKey}
            onChange={(event) => setWalletKey(event.target.value)}
            placeholder="G..."
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="black">
            Guardar contacto
          </Button>
        </div>
      </form>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {okMessage ? <Alert tone="ok">{okMessage}</Alert> : null}

      {contacts.length === 0 ? (
        <p className="mt-4 text-base text-purple-deep/70">
          Todavía no tenés contactos. Guardalos desde acá o desde el
          historial.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-purple/15">
          {contacts.map((contact) => (
            <li
              key={contact.publicKey}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-semibold">{contact.alias || truncateKey(contact.publicKey, 5)}</p>
                <p
                  className="font-mono text-xs text-purple-deep/60"
                  title={contact.publicKey}
                >
                  {truncateKey(contact.publicKey, 5)}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-purple underline"
                onClick={() => removeContact(contact.publicKey)}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </FormPanel>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">{value}</span>
      </div>
      <Progress value={value} />
    </div>
  )
}
