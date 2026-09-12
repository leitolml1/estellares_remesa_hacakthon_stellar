import { Controller, Get, Param, Query } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { AccountBalanceDto } from './dto/account-balance.dto';
import { TrustlineCheckQueryDto } from './dto/trustline-check-query.dto';
import { PublicKeyParamDto } from './dto/public-key-param.dto';

/**
 * Controller separado de StellarController (que vive en /stellar/payments)
 * porque estas rutas son sobre el estado de una cuenta (balances,
 * trustlines), no sobre pagos.
 */
@Controller('stellar/accounts')
export class StellarAccountsController {
  constructor(private readonly stellarService: StellarService) {}

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Get(':publicKey/balance')
  getBalance(@Param() params: PublicKeyParamDto): Promise<AccountBalanceDto> {
    return this.stellarService.getAccountBalance(params.publicKey);
  }

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Get(':publicKey/trustline-check')
  async checkTrustline(
    @Param() params: PublicKeyParamDto,
    @Query() query: TrustlineCheckQueryDto,
  ): Promise<{ hasTrustline: boolean }> {
    const hasTrustline = await this.stellarService.hasTrustline(
      params.publicKey,
      query.assetCode,
      query.assetIssuer,
    );
    return { hasTrustline };
  }
}
