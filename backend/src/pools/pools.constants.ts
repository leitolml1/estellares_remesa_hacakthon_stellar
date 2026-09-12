// Un memo de texto en Stellar tiene un limite de 28 bytes: 10 caracteres del
// alfabeto default de nanoid (A-Za-z0-9_-, todo ASCII de 1 byte) deja margen
// de sobra y sigue siendo lo bastante largo para que una colision al azar
// sea extremadamente improbable.
export const POOL_SHORT_CODE_LENGTH = 10;

// "Regenerar y reintentar una vez mas antes de fallar": 1 intento inicial +
// 1 reintento = 2 intentos totales.
export const POOL_SHORT_CODE_MAX_ATTEMPTS = 2;

// Ver SEP-7: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
export const SEP7_PAY_URI_PREFIX = 'web+stellar:pay';
export const SEP7_MEMO_TYPE_TEXT = 'MEMO_TEXT';
