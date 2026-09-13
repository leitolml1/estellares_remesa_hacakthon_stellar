import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rpc } from '@stellar/stellar-sdk';
import { BlendService } from './blend.service';
import {
  BLEND_CONFIG_KEYS,
  BLEND_DEFAULTS,
  SOROBAN_RPC_SERVER,
} from './blend.constants';

@Module({
  providers: [
    BlendService,
    {
      provide: SOROBAN_RPC_SERVER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): rpc.Server => {
        const rpcUrl = configService.get<string>(
          BLEND_CONFIG_KEYS.SOROBAN_RPC_URL,
          BLEND_DEFAULTS.SOROBAN_RPC_URL,
        );
        return new rpc.Server(rpcUrl);
      },
    },
  ],
  exports: [BlendService, SOROBAN_RPC_SERVER],
})
export class BlendModule {}
