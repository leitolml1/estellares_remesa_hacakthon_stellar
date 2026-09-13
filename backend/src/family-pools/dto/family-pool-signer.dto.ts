import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsStellarPublicKey } from '../../stellar/validators/is-stellar-public-key.validator';

export class FamilyPoolSignerDto {
  @IsStellarPublicKey()
  publicKey!: string;

  /** 0-255: mismo rango que el weight nativo de un signer en Stellar. */
  @IsInt()
  @Min(0)
  @Max(255)
  weight!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}
