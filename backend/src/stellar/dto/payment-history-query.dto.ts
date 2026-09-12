import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PAYMENT_HISTORY_LIMIT } from '../stellar.constants';

export class PaymentHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAYMENT_HISTORY_LIMIT)
  limit?: number;

  /** paging_token de Horizon devuelto como nextCursor en la pagina anterior. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Filtra por memo exacto de la transaccion padre. Mismo limite de 28
   * bytes que un memo de texto de Stellar (ver BuildPaymentDto.memo).
   */
  @IsOptional()
  @IsString()
  @MaxLength(28)
  memo?: string;
}
