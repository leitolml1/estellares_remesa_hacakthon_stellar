import { Body, Controller, Param, Post } from '@nestjs/common';
import { FamilyPoolsService } from './family-pools.service';
import { CreateFamilyPoolDto } from './dto/create-family-pool.dto';
import { BuildWithdrawalDto } from './dto/build-withdrawal.dto';
import { BuildSupplyToBlendDto } from './dto/build-supply-to-blend.dto';
import { FamilyPoolIdParamDto } from './dto/family-pool-id-param.dto';
import { FamilyPool } from './family-pool.entity';
import { SubmitPaymentDto } from '../stellar/dto/submit-payment.dto';

@Controller('family-pools')
export class FamilyPoolsController {
  constructor(private readonly familyPoolsService: FamilyPoolsService) {}

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Post()
  createFamilyPool(@Body() dto: CreateFamilyPoolDto): Promise<FamilyPool> {
    return this.familyPoolsService.createFamilyPool(dto);
  }

  // TODO: JwtAuthGuard + verificar que quien pide esto es el ownerPublicKey.
  @Post(':id/configure-multisig')
  configureMultisig(
    @Param() params: FamilyPoolIdParamDto,
  ): Promise<{ xdr: string }> {
    return this.familyPoolsService.configureMultisig(params.id);
  }

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  // Devuelve redeemXdr (null si el pool no tiene Blend habilitado) +
  // paymentXdr: si redeemXdr no es null, hay que firmarlo/enviarlo ANTES
  // que paymentXdr (ver comentario en FamilyPoolsService.buildWithdrawalTx).
  @Post(':id/withdrawals/build')
  buildWithdrawal(
    @Param() params: FamilyPoolIdParamDto,
    @Body() dto: BuildWithdrawalDto,
  ): Promise<{ redeemXdr: string | null; paymentXdr: string }> {
    return this.familyPoolsService.buildWithdrawalTx(
      params.id,
      dto.destinationPublicKey,
      dto.amount,
    );
  }

  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  // Paso explicito (no automatico post-deposito): requiere juntar firmas
  // igual que un retiro, ver comentario en el service.
  @Post(':id/deposits/build-supply-to-blend')
  buildSupplyToBlend(
    @Param() params: FamilyPoolIdParamDto,
    @Body() dto: BuildSupplyToBlendDto,
  ): Promise<{ xdr: string }> {
    return this.familyPoolsService.buildSupplyToBlendTx(params.id, dto.amount);
  }

  // Sin :id a proposito (ver spec): el XDR firmado ya identifica la cuenta
  // origen: no hace falta el familyPoolId para hacer el submit.
  // TODO: JwtAuthGuard una vez que exista el modulo auth (firma por wallet, ej. Freighter).
  @Post('withdrawals/submit')
  submitWithdrawal(
    @Body() dto: SubmitPaymentDto,
  ): Promise<{ hash: string; ledger: number }> {
    return this.familyPoolsService.submitMultiSignedWithdrawal(dto.signedXdr);
  }
}
