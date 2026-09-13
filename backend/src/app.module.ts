import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StellarModule } from './stellar/stellar.module';
import { PoolsModule } from './pools/pools.module';
import { FamilyPoolsModule } from './family-pools/family-pools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: Number(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'remesa_directa'),
        autoLoadEntities: true,
        // synchronize=true esta bien para este hackathon (todavia no hay
        // migraciones); antes de un deploy real esto se reemplaza por
        // migrations y se deja en false.
        synchronize:
          configService.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        // Postgres 13+ ya trae gen_random_uuid() sin necesitar la
        // extension uuid-ossp que usa TypeORM por default.
        uuidExtension: 'pgcrypto' as const,
      }),
    }),
    StellarModule,
    PoolsModule,
    FamilyPoolsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
