import {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api'

type FreighterApiError = NonNullable<
  Awaited<ReturnType<typeof signTransaction>>['error']
>

export class FreighterNotInstalledError extends Error {
  constructor(
    message = 'Freighter no está instalado o no se detecta en este navegador.',
  ) {
    super(message)
    this.name = 'FreighterNotInstalledError'
  }
}

export class FreighterAccessDeniedError extends Error {
  constructor(message = 'Rechazaste la conexión con Freighter.') {
    super(message)
    this.name = 'FreighterAccessDeniedError'
  }
}

export class FreighterSignatureRejectedError extends Error {
  constructor(message = 'Cancelaste la firma en el popup de Freighter.') {
    super(message)
    this.name = 'FreighterSignatureRejectedError'
  }
}

export class FreighterAccountMismatchError extends Error {
  readonly activeAddress: string

  constructor(expectedAddress: string, activeAddress: string) {
    const short = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`
    super(
      `Freighter está con otra cuenta (${short(activeAddress)}) y no con la que la app espera ` +
        `(${short(expectedAddress)}). Seleccioná la wallet correcta en la extensión y reconectá la sesión.`,
    )
    this.name = 'FreighterAccountMismatchError'
    this.activeAddress = activeAddress
  }
}

export class FreighterUnexpectedError extends Error {
  readonly freighterError: FreighterApiError

  constructor(freighterError: FreighterApiError) {
    super(freighterError.message || 'Error inesperado de Freighter.')
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
      message: 'Freighter no devolvió una dirección de cuenta válida.',
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
      message: 'Freighter no devolvió un XDR firmado.',
    })
  }

  return { signedXdr: result.signedTxXdr }
}

export function humanizeFreighterError(error: unknown): string {
  if (error instanceof FreighterNotInstalledError) {
    return `${error.message} Instalá la extensión y recargá.`
  }
  if (error instanceof FreighterAccessDeniedError) return error.message
  if (error instanceof FreighterSignatureRejectedError) return error.message
  if (error instanceof FreighterAccountMismatchError) return error.message
  if (error instanceof FreighterUnexpectedError) return error.message
  if (error instanceof Error) return error.message
  return 'No se pudo hablar con Freighter.'
}
