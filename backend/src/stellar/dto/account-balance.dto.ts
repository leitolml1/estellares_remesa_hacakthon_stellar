import { AssetType } from '@stellar/stellar-sdk';

/**
 * Se reusa el AssetType del SDK (en vez de una union string a mano) para no
 * desincronizarse si Stellar agrega/cambia tipos de asset. OJO: el .d.ts
 * instalado (@stellar/stellar-sdk@17.0.1, ver HorizonApi.BalanceLine) tiene
 * una 4ta variante ademas de native/credit_alphanum4/credit_alphanum12:
 * "liquidity_pool_shares" (pool de liquidez). No tiene assetCode/assetIssuer,
 * tiene liquidityPoolId en su lugar. Se mapea sin romper en vez de asumir
 * que balances[] solo trae los 3 tipos "normales".
 */
export class AssetBalanceDto {
  assetType!: AssetType;

  /** undefined para 'native' y para 'liquidity_pool_shares'. */
  assetCode?: string;

  /** undefined para 'native' y para 'liquidity_pool_shares'. */
  assetIssuer?: string;

  /** String tal como lo devuelve el SDK, sin convertir a number (precision). */
  balance!: string;

  /** Limite de la trustline. No existe para 'native'. */
  limit?: string;

  /** Solo presente cuando assetType === 'liquidity_pool_shares'. */
  liquidityPoolId?: string;
}

export class AccountBalanceDto {
  publicKey!: string;
  balances!: AssetBalanceDto[];
}
