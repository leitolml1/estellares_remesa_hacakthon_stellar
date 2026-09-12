import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsStellarAmount } from '../validators/is-stellar-amount.validator';
import { IsStellarPublicKey } from '../validators/is-stellar-public-key.validator';

/**
 * Representa un asset de Stellar en la request. Convencion: code === "XLM"
 * (sin issuer) se interpreta como el asset nativo; cualquier otro code
 * requiere issuer.
 */
export class PaymentAssetDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsStellarPublicKey({
    message: 'issuer debe ser una public key de Stellar valida',
  })
  issuer?: string;
}

export class BuildPaymentDto {
  @IsStellarPublicKey()
  sourcePublicKey!: string;

  @IsStellarPublicKey()
  destinationPublicKey!: string;

  @ValidateNested()
  @Type(() => PaymentAssetDto)
  sendAsset!: PaymentAssetDto;

  @IsStellarAmount()
  sendAmount!: string;

  @ValidateNested()
  @Type(() => PaymentAssetDto)
  destAsset!: PaymentAssetDto;

  /** Minimo a recibir en destAsset (proteccion de slippage del path payment). */
  @IsStellarAmount()
  destMin!: string;

  // Los memos de texto en Stellar estan limitados a 28 bytes UTF-8; 28 chars
  // es un limite conservador (asume peor caso de 1 byte por char).
  @IsOptional()
  @IsString()
  @MaxLength(28)
  memo?: string;
}
