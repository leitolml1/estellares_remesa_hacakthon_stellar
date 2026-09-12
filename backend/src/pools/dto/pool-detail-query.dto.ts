import { IsOptional } from 'class-validator';
import { IsStellarAmount } from '../../stellar/validators/is-stellar-amount.validator';

/**
 * amount es opcional a proposito (ver buildPaymentUri): esto es para
 * donaciones libres, asi que el query param solo existe para el caso en
 * que el frontend quiera ofrecer un monto sugerido prellenado en la wallet
 * del que dona, nunca para forzar un monto.
 */
export class PoolDetailQueryDto {
  @IsOptional()
  @IsStellarAmount()
  amount?: string;
}
