/**
 * DI token para la instancia de rpc.Server (Soroban) inyectada en el
 * modulo -- mismo patron que STELLAR_SERVER en stellar.constants.ts, para
 * poder mockearla en tests sin tocar la red real.
 */
export const SOROBAN_RPC_SERVER = Symbol('SOROBAN_RPC_SERVER');

/** Nombres de variables de entorno leidas via ConfigService (nada hardcodeado). */
export const BLEND_CONFIG_KEYS = {
  SOROBAN_RPC_URL: 'SOROBAN_RPC_URL',
} as const;

/**
 * Default de testnet. Confirmado contra developers.stellar.org (seccion RPC):
 * Soroban-RPC se renombro a "Stellar RPC" en nov 2024, pero la URL de
 * testnet sigue siendo esta.
 * @see https://developers.stellar.org/docs/data/apis/rpc
 */
export const BLEND_DEFAULTS = {
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
} as const;

/**
 * Timeout de la tx sin firmar contra Soroban, mismo criterio que
 * TRANSACTION_TIMEOUT_SECONDS en stellar.constants.ts (Horizon).
 */
export const BLEND_TRANSACTION_TIMEOUT_SECONDS = 30;
