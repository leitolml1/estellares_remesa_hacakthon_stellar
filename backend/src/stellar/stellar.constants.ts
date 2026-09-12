import { Networks } from '@stellar/stellar-sdk';

/** DI token para la instancia de Horizon.Server inyectada en el modulo. */
export const STELLAR_SERVER = Symbol('STELLAR_SERVER');

/** Nombres de variables de entorno leidas via ConfigService (nada hardcodeado). */
export const STELLAR_CONFIG_KEYS = {
  HORIZON_URL: 'STELLAR_HORIZON_URL',
  NETWORK_PASSPHRASE: 'STELLAR_NETWORK_PASSPHRASE',
} as const;

/**
 * Defaults de testnet. Se usan solo si la variable de entorno no esta
 * definida, para que el modulo funcione out-of-the-box en desarrollo.
 */
export const STELLAR_DEFAULTS = {
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  // Se reutiliza la constante del SDK en vez de tipear el string a mano
  // para evitar un typo silencioso que rompa la firma de las tx.
  NETWORK_PASSPHRASE: Networks.TESTNET,
} as const;

/** Codigo que usamos como convencion para representar el asset nativo (XLM). */
export const NATIVE_ASSET_CODE = 'XLM';

export const DEFAULT_PAYMENT_HISTORY_LIMIT = 20;
export const MAX_PAYMENT_HISTORY_LIMIT = 200;

/**
 * El memo de una operacion de pago vive en la transacción padre, no en la
 * operacion: para popularlo hay que pedir record.transaction() por cada
 * record, 1 request extra por record. Se resuelven en batches para no
 * disparar N requests concurrentes contra Horizon testnet y comerse un
 * rate limit.
 */
export const MAX_CONCURRENT_MEMO_LOOKUPS = 5;

/**
 * Ventana de validez de la tx sin firmar. Sin un timeout finito, Horizon
 * podria considerar la tx "pendiente" indefinidamente si el cliente nunca
 * llega a firmarla y enviarla.
 */
export const TRANSACTION_TIMEOUT_SECONDS = 30;
