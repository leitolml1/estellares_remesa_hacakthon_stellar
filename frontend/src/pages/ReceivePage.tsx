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
import { explorerAccountUrl, formatAmount } from '../lib/format'

export function ReceivePage() {
  const { publicKey } = useWallet()

  return (
    <PageStage
      title="RECIBIR"
      subtitle="Mostrá tu QR. Cualquiera puede pagarte desde su billetera."
      lead={publicKey ? <ReceiveBalances /> : null}
    >
      <WalletGate
        title="Conectá para recibir"
        description="Mostrá tu QR o copiá tu cuenta. Cualquier billetera Stellar puede pagarte."
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
        Tu QR
      </p>
      <div className="mt-5">
        <AssetChips value={assetCode} onChange={setAssetCode} tone="dark" />
      </div>
      {missingTrustline ? (
        <div className="mt-5 w-full">
          <Alert tone="error">
            Tu cuenta todavía no acepta {assetCode}. Activalo
            en tu billetera antes de pedir ese activo.
          </Alert>
        </div>
      ) : null}
      <div className="mt-6">
        <QrPanel
          value={uri}
          caption={`Pago con QR en ${assetCode}. Cualquier billetera compatible puede escanearlo.`}
        />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => void copy(publicKey, 'key')}>
          Copiar cuenta
        </Button>
        <Button variant="white" onClick={() => void copy(uri, 'uri')}>
          Copiar link de pago
        </Button>
      </div>
      {copied ? (
        <div className="mt-4 w-full">
          <Alert tone="ok">
            {copied === 'key' ? 'Cuenta copiada.' : 'Link de pago copiado.'}
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
            <Spinner label="Leyendo Horizon…" />
          </div>
        ) : null}
        {!balancesLoading && !balances ? (
          <div className="mt-4">
            <Alert tone="error">
              No encontramos la cuenta en testnet. Fondeala con Friendbot
              y recargá.
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
          Ver cuenta en Stellar Expert
        </a>
      </FormPanel>
      <DarkPanel>
        <p className="text-base leading-7 text-white/75">
          Si te van a pagar USDC o EURC, primero tenés que activar el
          activo. El envío lo chequea antes de firmar.
        </p>
      </DarkPanel>
    </>
  )
}
