/**
 * Modulo cliente standalone (TS puro, sin framework de UI) para conectar
 * Freighter y firmar transacciones en el navegador. El backend nunca ve
 * una private key: solo recibe el XDR ya firmado que devuelve este modulo.
 *
 * Verificado contra los .d.ts instalados de @stellar/freighter-api@6.0.1
 * (no se asumio ningun nombre de memoria):
 * - No existe getPublicKey() en esta version: se usa getAddress() /
 *   requestAccess(), que devuelven { address: string }.
 * - signTransaction(xdr, opts) acepta { networkPassphrase?, address? } —
 *   OJO: el campo "network" que aparece en la documentacion web de
 *   Freighter NO esta en el tipo instalado (`signTransaction.d.ts`), asi
 *   que no se usa aca para no pasar una opcion no tipada.
 * - Los mensajes de error exactos ("The user rejected this request." para
 *   signTransaction, "User declined access" para requestAccess) estan
 *   documentados en https://docs.freighter.app/extension-freighter-api/signing
 *   y /connecting. Se matchean con un substring case-insensitive por las
 *   dudas de que varien levemente entre versiones de la extension.
 */
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';

/**
 * @stellar/freighter-api no re-exporta el tipo FreighterApiError desde su
 * entrypoint publico (vive en un path interno "@shared/api/types" que no
 * es importable desde afuera del paquete). Se deriva el tipo del propio
 * return type de signTransaction en vez de re-declarar la forma a mano,
 * para que quede sincronizado con lo que realmente instale cada version.
 */
type FreighterApiError = NonNullable<
  Awaited<ReturnType<typeof signTransaction>>['error']
>;

/** Se lanza cuando la extension de Freighter no esta instalada/detectada. */
export class FreighterNotInstalledError extends Error {
  constructor(
    message = 'Freighter no esta instalado o no se detecta en este navegador.',
  ) {
    super(message);
    this.name = 'FreighterNotInstalledError';
  }
}

/** Se lanza cuando el usuario rechaza la conexion (requestAccess). */
export class FreighterAccessDeniedError extends Error {
  constructor(message = 'Rechazaste la conexion con Freighter.') {
    super(message);
    this.name = 'FreighterAccessDeniedError';
  }
}

/** Se lanza cuando el usuario cancela la firma en el popup de Freighter. */
export class FreighterSignatureRejectedError extends Error {
  constructor(message = 'Cancelaste la firma en el popup de Freighter.') {
    super(message);
    this.name = 'FreighterSignatureRejectedError';
  }
}

/**
 * Cualquier otro error que devuelva Freighter (no instalado ya se cubre
 * antes, y rechazo de usuario tiene su propia clase): errores de red
 * internos de la extension, XDR malformado, etc. Conserva el error
 * original de Freighter para debugging.
 */
export class FreighterUnexpectedError extends Error {
  constructor(public readonly freighterError: FreighterApiError) {
    super(freighterError.message || 'Error inesperado de Freighter.');
    this.name = 'FreighterUnexpectedError';
  }
}

/** Ver docs.freighter.app: mensajes exactos para rechazo de usuario. */
function isUserRejectionMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('declin') || normalized.includes('reject');
}

/**
 * Chequea si la extension de Freighter esta instalada/disponible en este
 * navegador. No dispara ningun popup.
 */
export async function isFreighterAvailable(): Promise<boolean> {
  const result = await isConnected();
  return Boolean(result.isConnected) && !result.error;
}

/**
 * Pide acceso a Freighter y devuelve la public key del usuario. Dispara el
 * popup de Freighter SOLO si el usuario todavia no autorizo esta app (si ya
 * la autorizo antes, requestAccess() resuelve directo sin popup).
 */
export async function connectFreighter(): Promise<{ publicKey: string }> {
  const available = await isFreighterAvailable();
  if (!available) {
    throw new FreighterNotInstalledError();
  }

  const result = await requestAccess();

  if (result.error) {
    if (isUserRejectionMessage(result.error.message)) {
      throw new FreighterAccessDeniedError(result.error.message);
    }
    throw new FreighterUnexpectedError(result.error);
  }

  if (!result.address) {
    throw new FreighterUnexpectedError({
      code: -1,
      message: 'Freighter no devolvio una direccion de cuenta valida.',
    });
  }

  return { publicKey: result.address };
}

/**
 * Firma un XDR sin firmar con Freighter. Pasa networkPassphrase explicito
 * (no confia en que Freighter este configurado en testnet por default):
 * si el usuario tiene la wallet en otra red, Freighter le muestra un
 * warning en el popup en vez de firmar silenciosamente contra la red
 * equivocada.
 */
export async function signTransactionWithFreighter(
  xdr: string,
  networkPassphrase: string,
): Promise<{ signedXdr: string }> {
  const result = await signTransaction(xdr, { networkPassphrase });

  if (result.error) {
    if (isUserRejectionMessage(result.error.message)) {
      throw new FreighterSignatureRejectedError(result.error.message);
    }
    throw new FreighterUnexpectedError(result.error);
  }

  if (!result.signedTxXdr) {
    throw new FreighterUnexpectedError({
      code: -1,
      message: 'Freighter no devolvio un XDR firmado.',
    });
  }

  return { signedXdr: result.signedTxXdr };
}
