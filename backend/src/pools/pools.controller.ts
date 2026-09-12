import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PoolsService } from './pools.service';
import { CreatePoolDto } from './dto/create-pool.dto';
import { PoolShortCodeParamDto } from './dto/pool-short-code-param.dto';
import { PoolIdParamDto } from './dto/pool-id-param.dto';
import { PoolDonationsQueryDto } from './dto/pool-donations-query.dto';
import { PoolDetailQueryDto } from './dto/pool-detail-query.dto';
import { PoolWithPaymentUriDto } from './dto/pool-with-payment-uri.dto';
import { PaymentRecordDto } from '../stellar/dto/payment-record.dto';

@Controller('pools')
export class PoolsController {
  constructor(private readonly poolsService: PoolsService) {}

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Post()
  async createPool(@Body() dto: CreatePoolDto): Promise<PoolWithPaymentUriDto> {
    const pool = await this.poolsService.createPool(dto);
    return { pool, paymentUri: this.poolsService.buildPaymentUri(pool) };
  }

  // Sin guard a proposito: cualquiera con el link/QR (incluso sin wallet
  // registrada en la app) tiene que poder ver el detalle del pool y donar.
  @Get(':shortCode')
  async getPoolDetail(
    @Param() params: PoolShortCodeParamDto,
    @Query() query: PoolDetailQueryDto,
  ): Promise<PoolWithPaymentUriDto> {
    const pool = await this.poolsService.getPoolByShortCode(params.shortCode);
    return {
      pool,
      paymentUri: this.poolsService.buildPaymentUri(pool, query.amount),
    };
  }

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Get(':id/donations')
  getDonations(
    @Param() params: PoolIdParamDto,
    @Query() query: PoolDonationsQueryDto,
  ): Promise<{ records: PaymentRecordDto[]; nextCursor: string | null }> {
    return this.poolsService.syncPoolDonations(params.id, query.cursor);
  }
}
