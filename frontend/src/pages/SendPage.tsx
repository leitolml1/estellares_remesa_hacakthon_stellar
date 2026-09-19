import { animate } from 'animejs'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { StellarMark } from '../components/layout/StellarMark'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AssetChips } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { TxStepper } from '../components/ui/TxStepper'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import {
  getQuote,
  humanizeApiError,
  savePaymentMetadata,
  type Quote,
} from '../lib/api'
import {
  contactLabel,
  searchContacts,
} from '../lib/contacts'
import {
  getKnownAsset,
  isKnownAssetCode,
  toPaymentAsset,
  type KnownAssetCode,
} from '../lib/assets'
import {
  TESTNET_NETWORK_PASSPHRASE,
  explorerTxUrl,
  formatAmount,
  isStellarAmount,
  isStellarPublicKey,
} from '../lib/format'
import {
  humanizeFreighterError,
  signTransactionWithFreighter,
} from '../lib/freighter'
import { buildPaymentXdr, submitSignedXdr } from '../lib/horizon'

type Status =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'signing' }
  | { kind: 'submitting' }
  | { kind: 'ok'; hash: string; ledger: number }
  | { kind: 'error'; message: string }

const QUOTE_DEBOUNCE_MS = 400

export function SendPage() {
  return (
    <PageStage
      title="ENVIAR"
      subtitle="Armá el envío, firmá en tu billetera y llega en segundos."
    >
      <WalletGate
        title="Conectá para enviar"
        description="Conectá tu billetera. El pago se arma acá y se confirma en la red; nosotros no firmamos por vos."
        badge={
          <StellarMark size={18} tone="light" className="mt-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
              Sobre Stellar testnet
            </span>
          </StellarMark>
        }
      >
        <SendForm />
      </WalletGate>
    </PageStage>
  )
}

function SendForm() {
  const { publicKey, refreshBalances } = useWallet()
  const [searchParams] = useSearchParams()
  const presetAsset = searchParams.get('asset')
  const presetTo = searchParams.get('to') ?? ''
  const presetAmount = searchParams.get('amount') ?? ''
  const initialCode: KnownAssetCode = isKnownAssetCode(
    (presetAsset ?? '').toUpperCase(),
  )
    ? ((presetAsset ?? '').toUpperCase() as KnownAssetCode)
    : 'XLM'
  const [destination, setDestination] = useState(presetTo)
  const [sendAmount, setSendAmount] = useState(presetAmount)
  const [sendCode, setSendCode] = useState<KnownAssetCode>(initialCode)
  const [destCode, setDestCode] = useState<KnownAssetCode>(initialCode)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const reveal = useUnfoldDown('send-form')

  const sendAsset = useMemo(() => {
    const known = getKnownAsset(sendCode)
    return known ? toPaymentAsset(known) : { code: 'XLM' }
  }, [sendCode])

  const destAsset = useMemo(() => {
    const known = getKnownAsset(destCode)
    return known ? toPaymentAsset(known) : { code: 'XLM' }
  }, [destCode])

  const crossAsset = sendCode !== destCode
  const amountValid = isStellarAmount(sendAmount)
  const contactSuggestions = useMemo(
    () => searchContacts(destination, 5),
    [destination],
  )
  const matchedContact = useMemo(() => {
    const key = destination.trim()
    if (!isStellarPublicKey(key)) return undefined
    return searchContacts(key, 1)[0]
  }, [destination])

  useEffect(() => {
    if (!crossAsset || !amountValid) {
      setQuote(null)
      setQuoteError(null)
      setQuoteLoading(false)
      return
    }
    let cancelled = false
    setQuoteLoading(true)
    const timer = window.setTimeout(() => {
      getQuote(sendCode, destCode, sendAmount.trim())
        .then((next) => {
          if (cancelled) return
          setQuote(next)
          setQuoteError(null)
          setQuoteLoading(false)
        })
        .catch((caught) => {
          if (cancelled) return
          setQuote(null)
          setQuoteError(humanizeApiError(caught))
          setQuoteLoading(false)
        })
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [crossAsset, amountValid, sendAmount, sendCode, destCode])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!publicKey) return

    if (!isStellarPublicKey(destination)) {
      setStatus({ kind: 'error', message: 'La cuenta destino no es una public key G… válida.' })
      return
    }
    if (!amountValid) {
      setStatus({ kind: 'error', message: 'El monto tiene que ser positivo, con hasta 7 decimales.' })
      return
    }
    if (crossAsset && (quoteLoading || !quote || quoteError)) {
      setStatus({
        kind: 'error',
        message: 'Falta la cotización para el cambio de activo. Esperala o elegí el mismo activo en los dos extremos.',
      })
      return
    }
    if (sendAsset.code !== 'XLM' && !sendAsset.issuer) {
      setStatus({ kind: 'error', message: 'Un asset no nativo necesita issuer.' })
      return
    }

    try {
      setStatus({ kind: 'building' })
      const amount = sendAmount.trim()
      const destMin = crossAsset && quote ? quote.destMin : amount
      const { xdr } = await buildPaymentXdr({
        sourcePublicKey: publicKey,
        destinationPublicKey: destination.trim(),
        sendAsset,
        sendAmount: amount,
        destAsset: crossAsset ? destAsset : sendAsset,
        destMin,
      })

      setStatus({ kind: 'signing' })
      const { signedXdr } = await signTransactionWithFreighter(
        xdr,
        TESTNET_NETWORK_PASSPHRASE,
        publicKey,
      )

      setStatus({ kind: 'submitting' })
      const result = await submitSignedXdr(signedXdr)
      if (note.trim()) {
        try {
          await savePaymentMetadata({
            tx_hash: result.hash,
            note: note.trim(),
          })
        } catch {
          // El pago ya está on-chain; la nota es opcional.
        }
      }
      setStatus({ kind: 'ok', hash: result.hash, ledger: result.ledger })
      void refreshBalances()
    } catch (error) {
      setStatus({
        kind: 'error',
        message: humanizeFlowError(error),
      })
    }
  }

  useLayoutEffect(() => {
    if (status.kind !== 'ok') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const card = document.querySelector('.tx-ok-pop')
    if (!card) return
    animate(card, {
      scale: [0.92, 1],
      opacity: [0, 1],
      duration: 420,
      ease: 'out(4)',
    })
  }, [status])

  const busy =
    status.kind === 'building' ||
    status.kind === 'signing' ||
    status.kind === 'submitting'
  const submitDisabled = busy || (crossAsset && (quoteLoading || Boolean(quoteError)))

  return (
    <div ref={reveal}>
      <FormPanel>
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => void onSubmit(event)}
        >
          <Field label="Destino" hint="Public key G… de la cuenta que recibe">
            <TextInput
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G..."
              autoComplete="off"
              spellCheck={false}
            />
            {matchedContact?.alias ? (
              <p className="mt-2 text-sm text-purple-deep/70">
                Para <strong>{matchedContact.alias}</strong>
              </p>
            ) : null}
            {contactSuggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {contactSuggestions.map((contact) => (
                  <button
                    key={contact.publicKey}
                    type="button"
                    className="inline-flex items-center rounded-full border border-purple/25 bg-white/60 px-3 py-1.5 text-sm font-semibold text-ink transition hover:border-purple/60"
                    onClick={() => setDestination(contact.publicKey)}
                    title={contact.publicKey}
                  >
                    {contactLabel(contact, 3)}
                  </button>
                ))}
              </div>
            ) : null}
          </Field>
          <Field label={`Monto (en ${sendCode})`}>
            <TextInput
              value={sendAmount}
              onChange={(event) => setSendAmount(event.target.value)}
              placeholder="25.5"
              inputMode="decimal"
            />
          </Field>
          <div className="send-assets sm:col-span-2">
            <Field label="Enviás">
              <AssetChips value={sendCode} onChange={setSendCode} />
            </Field>
            <span className="send-assets-arrow" aria-hidden="true">
              →
            </span>
            <Field label="Recibe">
              <AssetChips
                value={destCode}
                onChange={(code) => setDestCode(code)}
              />
            </Field>
            <p className="send-assets-hint">
              {crossAsset
                ? quoteLoading
                  ? 'Buscando el mejor camino de conversión…'
                  : quote
                    ? `Tasa: 1 ${sendCode} ≈ ${quote.rate} ${destCode} (${
                        quote.source === 'dex'
                          ? 'camino on-chain'
                          : quote.source === 'reference'
                            ? 'tasa referencial'
                            : 'directo'
                      }) · mínimo que recibe: ${formatAmount(quote.destMin, destCode)}`
                    : null
                : 'Mismo activo: el destinatario recibe lo que enviás.'}
            </p>
          </div>
          {crossAsset && amountValid && quote ? (
            <div className="sm:col-span-2">
              <Alert tone="info">
                Enviás {formatAmount(quote.sendAmount, quote.sendAsset)} → recibe{' '}
                <strong>{formatAmount(quote.destAmount, quote.destAsset)}</strong>
                {quote.destMin !== quote.destAmount
                  ? ` (mínimo ${formatAmount(quote.destMin, quote.destAsset)})`
                  : ''}
              </Alert>
            </div>
          ) : null}
          {quoteError ? (
            <div className="sm:col-span-2">
              <Alert tone="error">{quoteError}</Alert>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Field label="Nota">
              <TextInput
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="para el alquiler de abril"
              />
            </Field>
          </div>

          {status.kind === 'error' ? (
            <div className="sm:col-span-2">
              <Alert tone="error">{status.message}</Alert>
            </div>
          ) : null}
          {status.kind === 'ok' ? (
            <div className="sm:col-span-2">
              <Alert tone="ok">
                <span className="tx-ok-pop block">
                  Confirmada en el ledger {status.ledger}.{' '}
                  <a
                    className="underline"
                    href={explorerTxUrl(status.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en Stellar Expert
                  </a>
                </span>
              </Alert>
            </div>
          ) : null}
          {busy || status.kind === 'ok' ? (
            <div className="sm:col-span-2">
              <TxStepper status={status.kind} />
            </div>
          ) : null}
          {status.kind === 'ok' ? (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Link to={`/track/${status.hash}`}>
                <Button variant="white">Seguí tu remesa →</Button>
              </Link>
              <span className="text-sm text-white/55">
                Compartí el seguimiento con quien recibe.
              </span>
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || submitDisabled}>
              {crossAsset ? 'Cotizar y enviar →' : 'Firmar y enviar →'}
            </Button>
          </div>
        </form>
      </FormPanel>
    </div>
  )
}

function humanizeFlowError(error: unknown): string {
  if (error instanceof Error && error.name.startsWith('Freighter')) {
    return humanizeFreighterError(error)
  }
  return humanizeApiError(error)
}
