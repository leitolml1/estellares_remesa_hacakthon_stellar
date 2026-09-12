import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PoolsService } from './pools.service';
import { Pool } from './pool.entity';
import { StellarService } from '../stellar/stellar.service';
import { POOL_SHORT_CODE_LENGTH } from './pools.constants';

const DESTINATION_PUBLIC_KEY =
  'GDESTPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Mock minimo de Repository<Pool>: solo lo que PoolsService realmente usa. */
function createPoolRepositoryMock() {
  return {
    create: vi.fn((partial: Partial<Pool>): Partial<Pool> => partial),
    save: vi.fn((pool: Partial<Pool>): Promise<Pool> =>
      Promise.resolve({
        id: 'fake-uuid',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        ...pool,
      } as Pool),
    ),
    findOne: vi.fn(),
  };
}

function createStellarServiceMock() {
  return {
    getTransactionHistory: vi.fn(),
  };
}

function createFakePool(overrides: Partial<Pool> = {}): Pool {
  return {
    id: 'pool-1',
    shortCode: 'abc1234567',
    walletPublicKey: DESTINATION_PUBLIC_KEY,
    title: 'Ayuda para Juan',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PoolsService', () => {
  let service: PoolsService;
  let repoMock: ReturnType<typeof createPoolRepositoryMock>;
  let stellarServiceMock: ReturnType<typeof createStellarServiceMock>;

  beforeEach(async () => {
    repoMock = createPoolRepositoryMock();
    stellarServiceMock = createStellarServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoolsService,
        { provide: getRepositoryToken(Pool), useValue: repoMock },
        { provide: StellarService, useValue: stellarServiceMock },
      ],
    }).compile();

    service = module.get(PoolsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createPool', () => {
    it('regenera el shortCode y reintenta si el primer candidato colisiona', async () => {
      // 1er intento: el shortCode generado ya existe -> colision.
      // 2do intento: no existe -> se persiste.
      repoMock.findOne
        .mockResolvedValueOnce(createFakePool({ shortCode: 'colisionado' }))
        .mockResolvedValueOnce(null);

      const pool = await service.createPool({
        walletPublicKey: DESTINATION_PUBLIC_KEY,
        title: 'Ayuda para Juan',
      });

      expect(repoMock.findOne).toHaveBeenCalledTimes(2);
      expect(repoMock.create).toHaveBeenCalledTimes(1);
      expect(repoMock.save).toHaveBeenCalledTimes(1);
      expect(typeof pool.shortCode).toBe('string');
      expect(pool.shortCode).toHaveLength(POOL_SHORT_CODE_LENGTH);
    });

    it('falla con un error claro si los 2 intentos colisionan', async () => {
      repoMock.findOne.mockResolvedValue(createFakePool());

      await expect(
        service.createPool({
          walletPublicKey: DESTINATION_PUBLIC_KEY,
          title: 'Ayuda para Juan',
        }),
      ).rejects.toThrow();

      expect(repoMock.findOne).toHaveBeenCalledTimes(2);
      expect(repoMock.save).not.toHaveBeenCalled();
    });
  });

  describe('buildPaymentUri', () => {
    it('arma el URI SEP-7 sin amount (verificando el string exacto)', () => {
      const pool = createFakePool();

      const uri = service.buildPaymentUri(pool);

      expect(uri).toBe(
        `web+stellar:pay?destination=${DESTINATION_PUBLIC_KEY}&memo=abc1234567&memo_type=MEMO_TEXT`,
      );
    });

    it('agrega amount como query param solo si se pasa explicitamente', () => {
      const pool = createFakePool();

      const uri = service.buildPaymentUri(pool, '25');

      expect(uri).toBe(
        `web+stellar:pay?destination=${DESTINATION_PUBLIC_KEY}&memo=abc1234567&memo_type=MEMO_TEXT&amount=25`,
      );
    });
  });

  describe('syncPoolDonations', () => {
    it('delega en getTransactionHistory con el walletPublicKey y memoFilter del pool', async () => {
      const pool = createFakePool();
      repoMock.findOne.mockResolvedValue(pool);
      const historyResult = { records: [], nextCursor: null };
      stellarServiceMock.getTransactionHistory.mockResolvedValue(historyResult);

      const result = await service.syncPoolDonations(pool.id, 'some-cursor');

      expect(repoMock.findOne).toHaveBeenCalledWith({
        where: { id: pool.id },
      });
      expect(stellarServiceMock.getTransactionHistory).toHaveBeenCalledWith(
        pool.walletPublicKey,
        { memoFilter: pool.shortCode, cursor: 'some-cursor' },
      );
      expect(result).toBe(historyResult);
    });

    it('lanza NotFoundException si el pool no existe', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(
        service.syncPoolDonations('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
