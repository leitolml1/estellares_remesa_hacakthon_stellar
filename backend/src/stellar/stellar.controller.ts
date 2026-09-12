import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { BuildPaymentDto } from './dto/build-payment.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';
import { PaymentHistoryQueryDto } from './dto/payment-history-query.dto';
import { PaymentRecordDto } from './dto/payment-record.dto';
import { PublicKeyParamDto } from './dto/public-key-param.dto';

@Controller('stellar/payments')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Post('build')
  buildPayment(@Body() dto: BuildPaymentDto): Promise<{ xdr: string }> {
    return this.stellarService.buildPathPaymentTx(dto);
  }

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Post('submit')
  submitPayment(
    @Body() dto: SubmitPaymentDto,
  ): Promise<{ hash: string; ledger: number }> {
    return this.stellarService.submitSignedTx(dto.signedXdr);
  }

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Get(':publicKey')
  getHistory(
    @Param() params: PublicKeyParamDto,
    @Query() query: PaymentHistoryQueryDto,
  ): Promise<{ records: PaymentRecordDto[]; nextCursor: string | null }> {
    return this.stellarService.getTransactionHistory(params.publicKey, {
      limit: query.limit,
      cursor: query.cursor,
      memoFilter: query.memo,
    });
  }
}
