import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  NotFoundError,
  Operation,
  TransactionBuilder,
  TransactionFailedError,
} from '@stellar/stellar-sdk'
import { TESTNET_NETWORK_PASSPHRASE } from './format'
import type { AccountBalance, PaymentAsset } from '../types'

export const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const TX_TIMEOUT_SECONDS = 180
const MIN_CREATE_ACCOUNT_XLM = 1
const FEE_MULTIPLIER = 20

const server = new Horizon.Server(HORIZON_URL)

function toAsset(asset: PaymentAsset): Asset {
  if (!asset.code || asset.code.toUpperCase() === 'XLM') {
    return Asset.native()
  }
  if (!asset.issuer) {
    throw new Error(`El asset ${asset.code} necesita issuer.`)
  }
  return new Asset(asset.code.toUpperCase(), asset.issuer)
}

export function nativeXlmBalance(account: AccountBalance): string {
  const native = account.balances.find(
    (item) => item.assetType === 'native' || item.assetCode === 'XLM',
  )
  return native?.balance ?? '0'
}

export async function getAccountBalance(
  publicKey: string,
): Promise<AccountBalance> {
  try {
    const account = await server.loadAccount(publicKey)
    return {
      publicKey,
      balances: account.balances.map((item) => ({
        assetType: item.asset_type,
        assetCode:
          'asset_code' in item ? item.asset_code : item.asset_type === 'native' ? 'XLM' : undefined,
        assetIssuer: 'asset_issuer' in item ? item.asset_issuer : undefined,
        balance: item.balance,
        limit: 'limit' in item ? item.limit : undefined,
        liquidityPoolId:
          'liquidity_pool_id' in item ? item.liquidity_pool_id : undefined,
      })),
    }
  } catch (error) {
    throw mapHorizonError(error)
  }
}

export async function checkTrustline(
  publicKey: string,
  assetCode: string,
  assetIssuer: string,
): Promise<{ hasTrustline: boolean }> {
  const account = await getAccountBalance(publicKey)
  const hasTrustline = account.balances.some(
    (item) =>
      item.assetCode === assetCode && item.assetIssuer === assetIssuer,
  )
  return { hasTrustline }
}

export async function buildPaymentXdr(input: {
  sourcePublicKey: string
  destinationPublicKey: string
  sendAsset: PaymentAsset
  sendAmount: string
  destAsset: PaymentAsset
  destMin: string
  memo?: string
}): Promise<{ xdr: string }> {
  const sendAsset = toAsset(input.sendAsset)
  const destAsset = toAsset(input.destAsset)

  const destIssuer = destAsset.getIssuer()
  if (!destAsset.isNative() && destIssuer) {
    const trust = await checkTrustline(
      input.destinationPublicKey,
      destAsset.getCode(),
      destIssuer,
    )
    if (!trust.hasTrustline) {
      throw new Error(
        `La cuenta destino no tiene trustline para ${destAsset.getCode()}.`,
      )
    }
  }

  try {
    const destinationExists = await accountExists(input.destinationPublicKey)
    const sameAsset =
      sendAsset.equals(destAsset) && input.sendAmount === input.destMin

    if (!destinationExists) {
      if (!sameAsset || !sendAsset.isNative()) {
        throw new Error(
          'La cuenta destino no existe o no está fondeada en testnet. Pedile que la cree con Friendbot.',
        )
      }
      if (Number(input.sendAmount) < MIN_CREATE_ACCOUNT_XLM) {
        throw new Error(
          `Esa cuenta todavía no existe. Para crearla el envío tiene que ser de al menos ${MIN_CREATE_ACCOUNT_XLM} XLM.`,
        )
      }
    }

    const sourceAccount = await server.loadAccount(input.sourcePublicKey)
    const baseFee = await server.fetchBaseFee()
    const builder = new TransactionBuilder(sourceAccount, {
      fee: String(Math.max(baseFee, 100) * FEE_MULTIPLIER),
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    })

    if (!destinationExists && sameAsset && sendAsset.isNative()) {
      builder.addOperation(
        Operation.createAccount({
          destination: input.destinationPublicKey,
          startingBalance: input.sendAmount,
        }),
      )
    } else if (sameAsset) {
      builder.addOperation(
        Operation.payment({
          destination: input.destinationPublicKey,
          asset: sendAsset,
          amount: input.sendAmount,
        }),
      )
    } else {
      builder.addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount: input.sendAmount,
          destination: input.destinationPublicKey,
          destAsset,
          destMin: input.destMin,
        }),
      )
    }

    if (input.memo) {
      builder.addMemo(Memo.text(input.memo))
    }

    return { xdr: builder.setTimeout(TX_TIMEOUT_SECONDS).build().toXDR() }
  } catch (error) {
    throw mapHorizonError(error)
  }
}

export async function buildChangeTrustXdr(input: {
  sourcePublicKey: string
  asset: PaymentAsset
}): Promise<{ xdr: string }> {
  try {
    const sourceAccount = await server.loadAccount(input.sourcePublicKey)
    const baseFee = await server.fetchBaseFee()
    const builder = new TransactionBuilder(sourceAccount, {
      fee: String(Math.max(baseFee, 100) * FEE_MULTIPLIER),
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    })
    builder.addOperation(Operation.changeTrust({ asset: toAsset(input.asset) }))
    return { xdr: builder.setTimeout(TX_TIMEOUT_SECONDS).build().toXDR() }
  } catch (error) {
    throw mapHorizonError(error)
  }
}

export async function submitSignedXdr(
  signedXdr: string,
): Promise<{ hash: string; ledger: number }> {
  try {
    const transaction = TransactionBuilder.fromXDR(
      signedXdr,
      TESTNET_NETWORK_PASSPHRASE,
    )
    const result = await server.submitTransaction(transaction)
    return {
      hash: result.hash,
      ledger: result.ledger,
    }
  } catch (error) {
    throw mapHorizonError(error)
  }
}

export function generatePoolKeypair(): { publicKey: string; secret: string } {
  const pair = Keypair.random()
  return { publicKey: pair.publicKey(), secret: pair.secret() }
}

export function signXdrWithSecret(xdr: string, secret: string): string {
  const transaction = TransactionBuilder.fromXDR(
    xdr,
    TESTNET_NETWORK_PASSPHRASE,
  )
  if (!('sign' in transaction)) {
    throw new Error('El XDR no es una transacción simple.')
  }
  transaction.sign(Keypair.fromSecret(secret))
  return transaction.toXDR()
}

async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await server.loadAccount(publicKey)
    return true
  } catch (error) {
    if (error instanceof NotFoundError) return false
    const status = horizonStatus(error)
    if (status === 404) return false
    throw mapHorizonError(error)
  }
}

function horizonStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const obj = error as { response?: { status?: number }; status?: number }
  return obj.response?.status ?? obj.status
}

function extractResultCodes(error: unknown): {
  transaction?: string
  operations: string[]
} {
  if (error instanceof TransactionFailedError) {
    const codes = error.getResultCodes()
    return {
      transaction: codes.transaction,
      operations: codes.operations ?? [],
    }
  }

  const extras = findHorizonExtras(error)
  const codes = extras?.result_codes
  return {
    transaction: codes?.transaction,
    operations: codes?.operations ?? [],
  }
}

function findHorizonExtras(
  error: unknown,
  depth = 0,
): { result_codes?: { transaction?: string; operations?: string[] } } | undefined {
  if (!error || typeof error !== 'object' || depth > 4) return undefined
  const obj = error as Record<string, unknown>

  if (typeof (obj.extras as { result_codes?: unknown } | undefined)?.result_codes === 'object') {
    return obj.extras as { result_codes?: { transaction?: string; operations?: string[] } }
  }

  const data = obj.data
  if (data && typeof data === 'object') {
    const extras = (data as { extras?: unknown }).extras
    if (extras && typeof extras === 'object' && extras !== null && 'result_codes' in extras) {
      return extras as { result_codes?: { transaction?: string; operations?: string[] } }
    }
  }

  const response = obj.response
  if (response && typeof response === 'object') {
    const found = findHorizonExtras(response, depth + 1)
    if (found) return found
  }

  if (obj.cause) {
    const found = findHorizonExtras(obj.cause, depth + 1)
    if (found) return found
  }

  return undefined
}

function messageForResultCodes(txCode?: string, opCode?: string): string | null {
  if (txCode === 'tx_no_source_account') {
    return 'Tu cuenta no existe o todavía no fue fondeada en testnet. Usá Friendbot y reconectá Freighter.'
  }
  if (txCode === 'tx_bad_seq') {
    return 'La secuencia de la cuenta cambió. Volvé a tocar enviar.'
  }
  if (txCode === 'tx_bad_auth' || txCode === 'tx_bad_auth_extra') {
    return 'Freighter firmó con otra cuenta o no está en Testnet. Elegí la misma wallet y red Test SDF.'
  }
  if (txCode === 'tx_insufficient_balance' || opCode === 'op_underfunded') {
    return 'No hay fondos suficientes (dejá al menos 1 XLM de reserva + la comisión).'
  }
  if (txCode === 'tx_insufficient_fee') {
    return 'La comisión quedó corta. Reintentá el envío.'
  }
  if (txCode === 'tx_too_late' || txCode === 'tx_too_early') {
    return 'La transacción venció. Armala de nuevo y firmá más rápido.'
  }
  if (opCode === 'op_no_destination') {
    return 'La cuenta destino no existe en testnet. Pedile que la fondee con Friendbot, o enviá al menos 1 XLM para crearla.'
  }
  if (opCode === 'op_no_trust' || opCode === 'op_src_no_trust') {
    return 'Falta una trustline para ese asset.'
  }
  if (opCode === 'op_low_reserve') {
    return 'El saldo quedaría por debajo de la reserva mínima de Stellar.'
  }
  if (opCode === 'op_line_full') {
    return 'El destino no puede recibir más de ese asset (línea llena).'
  }
  if (opCode === 'op_too_few_offers' || opCode === 'op_under_dest_min') {
    return 'No hay camino de conversión para ese path payment. Probá enviar el mismo asset.'
  }
  if (opCode === 'op_malformed' || txCode === 'tx_malformed') {
    return 'La transacción quedó mal armada. Revisá monto, destino y asset.'
  }
  return null
}

function mapHorizonError(error: unknown): Error {
  const status = horizonStatus(error)
  const { transaction: txCode, operations } = extractResultCodes(error)
  const opCode = operations[0]
  const mapped = messageForResultCodes(txCode, opCode)
  if (mapped) return new Error(mapped)

  if (status === 404) {
    return new Error('La cuenta no existe o todavía no fue fondeada en testnet.')
  }
  if (status === 504 || status === 503) {
    return new Error('Horizon no responde. Probá de nuevo en unos segundos.')
  }

  if (txCode || opCode) {
    const suffix = [txCode, opCode].filter(Boolean).join(' / ')
    return new Error(`Horizon rechazó la transacción (${suffix}).`)
  }

  if (error instanceof Error) {
    if (error.message.includes('extras.result_codes')) {
      return new Error('Horizon rechazó la transacción. Revisá fondos, destino y que Freighter esté en Testnet.')
    }
    return error
  }
  return new Error('Horizon rechazó la transacción.')
}
