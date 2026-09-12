import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStellarPublicKey } from '../../stellar/validators/is-stellar-public-key.validator';
import { IsStellarAmount } from '../../stellar/validators/is-stellar-amount.validator';

export class CreatePoolDto {
  /**
   * Cuenta Stellar que va a recibir las donaciones. La validacion de
   * formato pasa por este decorator (reusado del modulo stellar) y por el
   * ValidationPipe global (whitelist + transform): PoolsService no
   * necesita re-validarla a mano.
   */
  @IsStellarPublicKey()
  walletPublicKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsStellarAmount()
  goalAmount?: string;
}
