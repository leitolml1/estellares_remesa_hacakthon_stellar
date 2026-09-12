import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { StellarService } from '../stellar/stellar.service';
import { PaymentRecordDto } from '../stellar/dto/payment-record.dto';
import { Pool } from './pool.entity';
import { CreatePoolDto } from './dto/create-pool.dto';
import {
  POOL_SHORT_CODE_LENGTH,
  POOL_SHORT_CODE_MAX_ATTEMPTS,
  SEP7_MEMO_TYPE_TEXT,
  SEP7_PAY_URI_PREFIX,
} from './pools.constants';

@Injectable()
export class PoolsService {
  constructor(
    @InjectRepository(Pool) private readonly poolRepository: Repository<Pool>,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * walletPublicKey ya se valida como public key de Stellar en
   * CreatePoolDto (@IsStellarPublicKey, reusado del modulo stellar) + el
   * ValidationPipe global: no se repite esa validacion aca.
   */
  async createPool(dto: CreatePoolDto): Promise<Pool> {
    const shortCode = await this.generateUniqueShortCode();
    const pool = this.poolRepository.create({
      shortCode,
      walletPublicKey: dto.walletPublicKey,
      title: dto.title,
      description: dto.description,
      goalAmount: dto.goalAmount,
    });
    return this.poolRepository.save(pool);
  }

  async getPoolByShortCode(shortCode: string): Promise<Pool> {
    const pool = await this.poolRepository.findOne({ where: { shortCode } });
    if (!pool) {
      throw new NotFoundException(
        `No existe un pool con shortCode "${shortCode}".`,
      );
    }
    return pool;
  }

  /**
   * Arma el URI de pago SEP-7 (web+stellar:pay?...) para que cualquier
   * wallet compatible (Freighter, Lobstr, etc.) pueda donar escaneando un
   * QR, sin estar registrada en la app. amount es opcional a proposito:
   * las donaciones son libres, asi que por default no se fuerza un monto
   * (queda undefined salvo que el caller pida explicitamente sugerir uno).
   */
  buildPaymentUri(pool: Pool, amount?: string): string {
    // URLSearchParams en vez de concatenar strings a mano: evita bugs de
    // encoding si shortCode o walletPublicKey tuvieran caracteres
    // especiales (hoy no los tienen, pero no hay que asumirlo a futuro).
    const params = new URLSearchParams({
      destination: pool.walletPublicKey,
      memo: pool.shortCode,
      memo_type: SEP7_MEMO_TYPE_TEXT,
    });

    if (amount) {
      params.set('amount', amount);
    }

    return `${SEP7_PAY_URI_PREFIX}?${params.toString()}`;
  }

  /**
   * Sincroniza las donaciones de un pool: reusa getTransactionHistory del
   * Modulo 1 tal cual (paginacion por cursor + filtro por memo), no
   * reimplementa nada de Horizon aca.
   */
  async syncPoolDonations(
    poolId: string,
    cursor?: string,
  ): Promise<{ records: PaymentRecordDto[]; nextCursor: string | null }> {
    const pool = await this.getPoolByIdOrThrow(poolId);
    return this.stellarService.getTransactionHistory(pool.walletPublicKey, {
      memoFilter: pool.shortCode,
      cursor,
    });
  }

  private async getPoolByIdOrThrow(id: string): Promise<Pool> {
    const pool = await this.poolRepository.findOne({ where: { id } });
    if (!pool) {
      throw new NotFoundException(`No existe un pool con id "${id}".`);
    }
    return pool;
  }

  /**
   * Una colision de nanoid(10) es extremadamente improbable, pero es una
   * sola query extra: se chequea antes de persistir y, si colisiona, se
   * regenera y reintenta una vez mas antes de fallar con un error claro
   * (en vez de un error crudo de constraint unique de Postgres).
   */
  private async generateUniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < POOL_SHORT_CODE_MAX_ATTEMPTS; attempt++) {
      const candidate = nanoid(POOL_SHORT_CODE_LENGTH);
      const existing = await this.poolRepository.findOne({
        where: { shortCode: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new InternalServerErrorException(
      'No se pudo generar un shortCode unico para el pool, intenta de nuevo.',
    );
  }
}
