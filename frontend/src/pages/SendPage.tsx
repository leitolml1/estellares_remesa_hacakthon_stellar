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
import { tx } from '../i18n'
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
      title={tx('ENVIAR', 'SEND')}
      subtitle={tx(
        'Armá el envío, firmá en tu billetera y llega en segundos.',
        'Build the payment, sign in your wallet, and it arrives in seconds.',
      )}
    >
      <WalletGate
        title={tx('Conectá para enviar', 'Connect to send')}
        description={tx(
          'Conectá tu billetera. El pago se arma acá y se confirma en la red; nosotros no firmamos por vos.',
          'Connect your wallet. The payment is built here and confirmed on the network; we do not sign for you.',
        )}
        badge={
          <StellarMark size={18} tone="light" className="mt-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
              {tx('Sobre Stellar testnet', 'On Stellar testnet')}
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
      setStatus({
        kind: 'error',
        message: tx(
          'La cuenta destino no es una public key G… válida.',
          'The destination account is not a valid G… public key.',
        ),
      })
      return
    }
    if (!amountValid) {
      setStatus({
        kind: 'error',
        message: tx(
          'El monto tiene que ser positivo, con hasta 7 decimales.',
          'The amount must be positive, with up to 7 decimals.',
        ),
      })
      return
    }
    if (crossAsset && (quoteLoading || !quote || quoteError)) {
      setStatus({
        kind: 'error',
        message: tx(
          'Falta la cotización para el cambio de activo. Esperala o elegí el mismo activo en los dos extremos.',
          'The quote for the asset change is missing. Wait for it, or pick the same asset on both sides.',
        ),
      })
      return
    }
    if (sendAsset.code !== 'XLM' && !sendAsset.issuer) {
      setStatus({
        kind: 'error',
        message: tx('Un asset no nativo necesita issuer.', 'A non-native asset needs an issuer.'),
      })
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
          <Field
            label={tx('Destino', 'Destination')}
            hint={tx('Public key G… de la cuenta que recibe', 'G… public key of the account that receives')}
          >
            <TextInput
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G..."
              autoComplete="off"
              spellCheck={false}
            />
            {matchedContact?.alias ? (
              <p className="mt-2 text-sm text-purple-deep/70">
                {tx('Para', 'For')} <strong>{matchedContact.alias}</strong>
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
          <Field label={tx(`Monto (en ${sendCode})`, `Amount (in ${sendCode})`)}>
            <TextInput
              value={sendAmount}
              onChange={(event) => setSendAmount(event.target.value)}
              placeholder="25.5"
              inputMode="decimal"
            />
          </Field>
          <div className="send-assets sm:col-span-2">
            <Field label={tx('Enviás', 'You send')}>
              <AssetChips value={sendCode} onChange={setSendCode} />
            </Field>
            <span className="send-assets-arrow" aria-hidden="true">
              →
            </span>
            <Field label={tx('Recibe', 'They receive')}>
              <AssetChips
                value={destCode}
                onChange={(code) => setDestCode(code)}
              />
            </Field>
            <p className="send-assets-hint">
              {crossAsset
                ? quoteLoading
                  ? tx('Buscando el mejor camino de conversión…', 'Looking for the best conversion path…')
                  : quote
                    ? tx(
                        `Tasa: 1 ${sendCode} ≈ ${quote.rate} ${destCode} (${
                          quote.source === 'dex'
                            ? 'camino on-chain'
                            : quote.source === 'reference'
                              ? 'tasa referencial'
                              : 'directo'
                        }) · mínimo que recibe: ${formatAmount(quote.destMin, destCode)}`,
                        `Rate: 1 ${sendCode} ≈ ${quote.rate} ${destCode} (${
                          quote.source === 'dex'
                            ? 'on-chain path'
                            : quote.source === 'reference'
                              ? 'reference rate'
                              : 'direct'
                        }) · minimum they receive: ${formatAmount(quote.destMin, destCode)}`,
                      )
                    : null
                : tx(
                    'Mismo activo: el destinatario recibe lo que enviás.',
                    'Same asset: the recipient gets exactly what you send.',
                  )}
            </p>
          </div>
          {crossAsset && amountValid && quote ? (
            <div className="sm:col-span-2">
              <Alert tone="info">
                {tx('Enviás', 'You send')} {formatAmount(quote.sendAmount, quote.sendAsset)} → {tx('recibe', 'they receive')}{' '}
                <strong>{formatAmount(quote.destAmount, quote.destAsset)}</strong>
                {quote.destMin !== quote.destAmount
                  ? tx(
                      ` (mínimo ${formatAmount(quote.destMin, quote.destAsset)})`,
                      ` (minimum ${formatAmount(quote.destMin, quote.destAsset)})`,
                    )
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
            <Field label={tx('Nota', 'Note')}>
              <TextInput
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={tx('para el alquiler de abril', 'april rent')}
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
                  {tx(
                    `Confirmada en el ledger ${status.ledger}.`,
                    `Confirmed in ledger ${status.ledger}.`,
                  )}{' '}
                  <a
                    className="underline"
                    href={explorerTxUrl(status.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx('Ver en Stellar Expert', 'View on Stellar Expert')}
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
                <Button variant="white">{tx('Seguí tu remesa →', 'Track your remittance →')}</Button>
              </Link>
              <span className="text-sm text-white/55">
                {tx('Compartí el seguimiento con quien recibe.', 'Share the tracking link with whoever receives.')}
              </span>
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || submitDisabled}>
              {crossAsset
                ? tx('Cotizar y enviar →', 'Quote and send →')
                : tx('Firmar y enviar →', 'Sign and send →')}
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
