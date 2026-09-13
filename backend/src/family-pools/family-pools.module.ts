import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarModule } from '../stellar/stellar.module';
import { BlendModule } from '../blend/blend.module';
import { FamilyPool, FamilyPoolSigner } from './family-pool.entity';
import { FamilyPoolsService } from './family-pools.service';
import { FamilyPoolsController } from './family-pools.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FamilyPool, FamilyPoolSigner]),
    StellarModule,
    BlendModule,
  ],
  controllers: [FamilyPoolsController],
  providers: [FamilyPoolsService],
  exports: [FamilyPoolsService],
})
export class FamilyPoolsModule {}
