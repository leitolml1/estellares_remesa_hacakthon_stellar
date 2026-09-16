import { animate } from 'animejs'
import { useLayoutEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { StellarMark } from '../components/layout/StellarMark'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AssetChips } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import { humanizeApiError, savePaymentMetadata } from '../lib/api'
import {
  getKnownAsset,
  isKnownAssetCode,
  toPaymentAsset,
  type KnownAssetCode,
} from '../lib/assets'
import {
  TESTNET_NETWORK_PASSPHRASE,
  explorerTxUrl,
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

export function SendPage() {
  return (
    <PageStage
      kicker="Módulo 1"
      title="ENVIAR"
      subtitle="El navegador arma el XDR, Freighter lo firma y Horizon lo confirma. Enviá XLM, USDC o EURC."
    >
      <WalletGate
        title="Conectá para enviar"
        description="Conectá Freighter. El pago se construye acá y se manda directo a Horizon; Django no firma nada."
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
  const initialCode: KnownAssetCode = isKnownAssetCode(
    (presetAsset ?? '').toUpperCase(),
  )
    ? ((presetAsset ?? '').toUpperCase() as KnownAssetCode)
    : 'XLM'
  const [destination, setDestination] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendCode, setSendCode] = useState<KnownAssetCode>(initialCode)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const reveal = useUnfoldDown('send-form')

  const sendAsset = useMemo(() => {
    const known = getKnownAsset(sendCode)
    return known ? toPaymentAsset(known) : { code: 'XLM' }
  }, [sendCode])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!publicKey) return

    if (!isStellarPublicKey(destination)) {
      setStatus({ kind: 'error', message: 'La cuenta destino no es una public key G… válida.' })
      return
    }
    if (!isStellarAmount(sendAmount)) {
      setStatus({ kind: 'error', message: 'El monto tiene que ser positivo, con hasta 7 decimales.' })
      return
    }
    if (sendAsset.code !== 'XLM' && !sendAsset.issuer) {
      setStatus({ kind: 'error', message: 'Un asset no nativo necesita issuer.' })
      return
    }

    try {
      setStatus({ kind: 'building' })
      const amount = sendAmount.trim()
      const { xdr } = await buildPaymentXdr({
        sourcePublicKey: publicKey,
        destinationPublicKey: destination.trim(),
        sendAsset,
        sendAmount: amount,
        destAsset: sendAsset,
        destMin: amount,
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
          </Field>
          <Field label="Monto">
            <TextInput
              value={sendAmount}
              onChange={(event) => setSendAmount(event.target.value)}
              placeholder="25.5"
              inputMode="decimal"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Asset">
              <AssetChips value={sendCode} onChange={setSendCode} />
            </Field>
          </div>
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
          {busy ? (
            <div className="sm:col-span-2">
              <Spinner
                label={
                  status.kind === 'building'
                    ? 'Armando la transacción…'
                    : status.kind === 'signing'
                      ? 'Esperando la firma en Freighter…'
                      : 'Enviando a Horizon…'
                }
              />
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              Firmar y enviar →
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
