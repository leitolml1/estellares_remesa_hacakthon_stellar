import { useState } from 'react'
import { DarkPanel, FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { QrPanel } from '../components/ui/QrPanel'
import { Spinner } from '../components/ui/Spinner'
import { AcceptedAssets, AssetChips, AssetLogo } from '../components/ui/AssetLogo'
import { useWallet } from '../context/WalletContext'
import {
  accountHasAsset,
  buildPayUri,
  displayAssetCode,
  getKnownAsset,
  type KnownAssetCode,
} from '../lib/assets'
import { tx } from '../i18n'
import { explorerAccountUrl, formatAmount } from '../lib/format'

export function ReceivePage() {
  const { publicKey } = useWallet()

  return (
    <PageStage
      title={tx('RECIBIR', 'RECEIVE')}
      subtitle={tx(
        'Mostrá tu QR. Cualquiera puede pagarte desde su billetera.',
        'Show your QR. Anyone can pay you from their wallet.',
      )}
      lead={publicKey ? <ReceiveBalances /> : null}
    >
      <WalletGate
        title={tx('Conectá para recibir', 'Connect to receive')}
        description={tx(
          'Mostrá tu QR o copiá tu cuenta. Cualquier billetera Stellar puede pagarte.',
          'Show your QR or copy your account. Any Stellar wallet can pay you.',
        )}
      >
        <ReceiveQr />
      </WalletGate>
    </PageStage>
  )
}

function ReceiveQr() {
  const { publicKey, balances, balancesLoading } = useWallet()
  const [copied, setCopied] = useState<'key' | 'uri' | null>(null)
  const [assetCode, setAssetCode] = useState<KnownAssetCode>('XLM')

  if (!publicKey) return null

  const selectedAsset = getKnownAsset(assetCode)
  const uri = selectedAsset
    ? buildPayUri({ destination: publicKey, asset: selectedAsset })
    : buildPayUri({ destination: publicKey })
  const missingTrustline =
    Boolean(selectedAsset?.issuer) &&
    !balancesLoading &&
    selectedAsset !== undefined &&
    !accountHasAsset(balances?.balances, selectedAsset)

  async function copy(value: string, kind: 'key' | 'uri') {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div className="stage-card unfold-down flex h-full min-h-full w-full flex-1 flex-col items-center justify-center rounded-[28px] bg-purple p-8 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yellow">
        {tx('Tu QR', 'Your QR')}
      </p>
      <div className="mt-5">
        <AssetChips value={assetCode} onChange={setAssetCode} tone="dark" />
      </div>
      {missingTrustline ? (
        <div className="mt-5 w-full">
          <Alert tone="error">
            {tx(
              `Tu cuenta todavía no acepta ${assetCode}. Activalo en tu billetera antes de pedir ese activo.`,
              `Your account does not accept ${assetCode} yet. Enable it in your wallet before asking for that asset.`,
            )}
          </Alert>
        </div>
      ) : null}
      <div className="mt-6">
        <QrPanel
          value={uri}
          caption={tx(
            `Pago con QR en ${assetCode}. Cualquier billetera compatible puede escanearlo.`,
            `QR payment in ${assetCode}. Any compatible wallet can scan it.`,
          )}
        />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => void copy(publicKey, 'key')}>
          {tx('Copiar cuenta', 'Copy account')}
        </Button>
        <Button variant="white" onClick={() => void copy(uri, 'uri')}>
          {tx('Copiar link de pago', 'Copy payment link')}
        </Button>
      </div>
      {copied ? (
        <div className="mt-4 w-full">
          <Alert tone="ok">
            {copied === 'key'
              ? tx('Cuenta copiada.', 'Account copied.')
              : tx('Link de pago copiado.', 'Payment link copied.')}
          </Alert>
        </div>
      ) : null}
    </div>
  )
}

function ReceiveBalances() {
  const { publicKey, balances, balancesLoading } = useWallet()

  if (!publicKey) return null

  return (
    <>
      <FormPanel>
        <h2 className="text-3xl font-black tracking-tight">Balances</h2>
        <div className="mt-4">
          <AcceptedAssets />
        </div>
        {balancesLoading ? (
          <div className="mt-6">
            <Spinner label={tx('Leyendo Horizon…', 'Reading Horizon…')} />
          </div>
        ) : null}
        {!balancesLoading && !balances ? (
          <div className="mt-4">
            <Alert tone="error">
              {tx(
                'No encontramos la cuenta en testnet. Fondeala con Friendbot y recargá.',
                'We could not find the account on testnet. Fund it with Friendbot and reload.',
              )}
            </Alert>
          </div>
        ) : null}
        <ul className="mt-6 space-y-3">
          {balances?.balances.map((item) => {
            const code = displayAssetCode(item.assetCode, item.assetType)
            return (
              <li
                key={`${item.assetType}-${item.assetCode ?? item.liquidityPoolId ?? 'native'}`}
                className="form-row"
              >
                <span className="inline-flex items-center gap-2 text-base font-medium">
                  <AssetLogo code={code} className="h-6 w-6" />
                  {code}
                </span>
                <span className="font-mono text-base">
                  {formatAmount(item.balance, '')}
                </span>
              </li>
            )
          })}
        </ul>
        <a
          className="mt-6 inline-block text-base text-purple underline"
          href={explorerAccountUrl(publicKey)}
          target="_blank"
          rel="noreferrer"
        >
          {tx('Ver cuenta en Stellar Expert', 'View account on Stellar Expert')}
        </a>
      </FormPanel>
      <DarkPanel>
        <p className="text-base leading-7 text-white/75">
          {tx(
            'Si te van a pagar USDC o EURC, primero tenés que activar el activo. El envío lo chequea antes de firmar.',
            'If someone will pay you in USDC or EURC, enable the asset first. The send flow checks that before signing.',
          )}
        </p>
      </DarkPanel>
    </>
  )
}
