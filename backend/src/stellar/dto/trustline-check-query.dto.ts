import { IsNotEmpty, IsString } from 'class-validator';
import { IsStellarPublicKey } from '../validators/is-stellar-public-key.validator';

export class TrustlineCheckQueryDto {
  @IsString()
  @IsNotEmpty()
  assetCode!: string;

  @IsStellarPublicKey({
    message: 'assetIssuer debe ser una public key de Stellar valida',
  })
  assetIssuer!: string;
}
