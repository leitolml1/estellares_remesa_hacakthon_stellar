import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsStellarPublicKey } from '../../stellar/validators/is-stellar-public-key.validator';
import { IsStellarAmount } from '../../stellar/validators/is-stellar-amount.validator';
import { FamilyPoolSignerDto } from './family-pool-signer.dto';

/**
 * Este endpoint solo crea el registro en Postgres. NO configura nada
 * on-chain todavia (eso es POST /family-pools/:id/configure-multisig, que
 * el ownerPublicKey tiene que firmar por separado).
 */
export class CreateFamilyPoolDto {
  @IsStellarPublicKey()
  walletPublicKey!: string;

  @IsStellarPublicKey()
  ownerPublicKey!: string;

  @IsStellarAmount()
  withdrawalLimitPerTx!: string;

  @IsInt()
  @Min(1)
  @Max(255)
  medThreshold!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FamilyPoolSignerDto)
  signers!: FamilyPoolSignerDto[];

  /**
   * Asset a invertir en Blend (ej. "USDC"). Si se omite, el pool queda sin
   * Blend habilitado (Plan B: deposito/retiro directo, sin yield) hasta que
   * se le configure investedAssetCode/Issuer + blendPoolId despues.
   */
  @IsOptional()
  @IsString()
  investedAssetCode?: string;

  @IsOptional()
  @IsStellarPublicKey()
  investedAssetIssuer?: string;

  /** Contract id (C...) del pool de Blend. undefined = Blend deshabilitado. */
  @IsOptional()
  @IsString()
  blendPoolId?: string;
}
