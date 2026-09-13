import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { StellarController } from './stellar.controller';
import { StellarAccountsController } from './stellar-accounts.controller';
import { StellarService } from './stellar.service';
import {
  STELLAR_CONFIG_KEYS,
  STELLAR_DEFAULTS,
  STELLAR_SERVER,
} from './stellar.constants';

@Module({
  imports: [ConfigModule],
  controllers: [StellarController, StellarAccountsController],
  providers: [
    StellarService,
    {
      provide: STELLAR_SERVER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Horizon.Server => {
        const horizonUrl = configService.get<string>(
          STELLAR_CONFIG_KEYS.HORIZON_URL,
          STELLAR_DEFAULTS.HORIZON_URL,
        );
        return new Horizon.Server(horizonUrl);
      },
    },
  ],
  // STELLAR_SERVER se exporta tambien: family-pools necesita construir sus
  // propias transacciones (setOptions/payment) con el mismo Horizon.Server,
  // sin reimplementar la conexion.
  exports: [StellarService, STELLAR_SERVER],
})
export class StellarModule {}
