import {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api'
import { tx } from '../i18n'

type FreighterApiError = NonNullable<
  Awaited<ReturnType<typeof signTransaction>>['error']
>

export class FreighterNotInstalledError extends Error {
  constructor(
    message = tx(
      'Freighter no está instalado o no se detecta en este navegador.',
      'Freighter is not installed or was not detected in this browser.',
    ),
  ) {
    super(message)
    this.name = 'FreighterNotInstalledError'
  }
}

export class FreighterAccessDeniedError extends Error {
  constructor(message = tx('Rechazaste la conexión con Freighter.', 'You rejected the Freighter connection.')) {
    super(message)
    this.name = 'FreighterAccessDeniedError'
  }
}

export class FreighterSignatureRejectedError extends Error {
  constructor(
    message = tx(
      'Cancelaste la firma en el popup de Freighter.',
      'You cancelled the signature in the Freighter popup.',
    ),
  ) {
    super(message)
    this.name = 'FreighterSignatureRejectedError'
  }
}

export class FreighterAccountMismatchError extends Error {
  readonly activeAddress: string

  constructor(expectedAddress: string, activeAddress: string) {
    const short = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`
    super(
      tx(
        `Freighter está con otra cuenta (${short(activeAddress)}) y no con la que la app espera (${short(expectedAddress)}). Seleccioná la wallet correcta en la extensión y reconectá la sesión.`,
        `Freighter is on another account (${short(activeAddress)}), not the one this app expects (${short(expectedAddress)}). Select the right wallet in the extension and reconnect.`,
      ),
    )
    this.name = 'FreighterAccountMismatchError'
    this.activeAddress = activeAddress
  }
}

export class FreighterUnexpectedError extends Error {
  readonly freighterError: FreighterApiError

  constructor(freighterError: FreighterApiError) {
    super(freighterError.message || tx('Error inesperado de Freighter.', 'Unexpected Freighter error.'))
    this.name = 'FreighterUnexpectedError'
    this.freighterError = freighterError
  }
}

function isUserRejectionMessage(message: string | undefined): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return normalized.includes('declin') || normalized.includes('reject')
}

export async function isFreighterAvailable(): Promise<boolean> {
  const result = await isConnected()
  return Boolean(result.isConnected) && !result.error
}

export async function connectFreighter(): Promise<{ publicKey: string }> {
  const available = await isFreighterAvailable()
  if (!available) {
    throw new FreighterNotInstalledError()
  }

  const result = await requestAccess()

  if (result.error) {
    if (isUserRejectionMessage(result.error.message)) {
      throw new FreighterAccessDeniedError(result.error.message)
    }
    throw new FreighterUnexpectedError(result.error)
  }

  if (!result.address) {
    throw new FreighterUnexpectedError({
      code: -1,
      message: tx(
        'Freighter no devolvió una dirección de cuenta válida.',
        'Freighter did not return a valid account address.',
      ),
    })
  }

  return { publicKey: result.address }
}

export async function getActiveAccount(): Promise<string | null> {
  try {
    const result = await getAddress()
    if (result.error || !result.address) return null
    return result.address
  } catch {
    // Versiones viejas de Freighter no exponen getAddress: no bloqueamos
    // la firma por no poder verificar, Horizon valida igual.
    return null
  }
}

export async function signTransactionWithFreighter(
  xdr: string,
  networkPassphrase: string,
  address?: string,
): Promise<{ signedXdr: string }> {
  // Anti tx_bad_auth_extra: si Freighter esta con otra cuenta activa,
  // su firma no vale para la caja y Horizon rechaza la tx con un codigo
  // criptico. Se detecta ANTES de firmar, con un mensaje claro.
  if (address) {
    const active = await getActiveAccount()
    if (active && active !== address) {
      throw new FreighterAccountMismatchError(address, active)
    }
  }

  const result = await signTransaction(xdr, {
    networkPassphrase,
    ...(address ? { address } : {}),
  })

  if (result.error) {
    if (isUserRejectionMessage(result.error.message)) {
      throw new FreighterSignatureRejectedError(result.error.message)
    }
    throw new FreighterUnexpectedError(result.error)
  }

  if (!result.signedTxXdr) {
    throw new FreighterUnexpectedError({
      code: -1,
      message: tx('Freighter no devolvió un XDR firmado.', 'Freighter did not return a signed XDR.'),
    })
  }

  return { signedXdr: result.signedTxXdr }
}

export function humanizeFreighterError(error: unknown): string {
  if (error instanceof FreighterNotInstalledError) {
    return tx(
      'Freighter no está instalado o no se detecta en este navegador. Instalá la extensión y recargá.',
      'Freighter is not installed or was not detected in this browser. Install the extension and reload.',
    )
  }
  if (error instanceof FreighterAccessDeniedError) {
    return tx('Rechazaste la conexión con Freighter.', 'You rejected the Freighter connection.')
  }
  if (error instanceof FreighterSignatureRejectedError) {
    return tx('Cancelaste la firma en el popup de Freighter.', 'You cancelled the signature in the Freighter popup.')
  }
  if (error instanceof FreighterAccountMismatchError) {
    const short = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`
    const active = short(error.activeAddress)
    return tx(
      `Freighter está con otra cuenta (${active}). Seleccioná la wallet correcta en la extensión y reconectá la sesión.`,
      `Freighter is on another account (${active}). Select the right wallet in the extension and reconnect.`,
    )
  }
  if (error instanceof FreighterUnexpectedError) return error.message
  if (error instanceof Error) return error.message
  return tx('No se pudo hablar con Freighter.', 'Could not reach Freighter.')
}
