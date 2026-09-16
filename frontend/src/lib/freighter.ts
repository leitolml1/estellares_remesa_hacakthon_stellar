import {
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

export async function signTransactionWithFreighter(
  xdr: string,
  networkPassphrase: string,
  address?: string,
): Promise<{ signedXdr: string }> {
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
  if (error instanceof FreighterUnexpectedError) return error.message
  if (error instanceof Error) return error.message
  return 'No se pudo hablar con Freighter.'
}
