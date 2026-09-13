import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Account,
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  TransactionFailedError,
} from '@stellar/stellar-sdk';
import { FamilyPoolsService } from './family-pools.service';
import { FamilyPool, FamilyPoolSigner } from './family-pool.entity';
import { STELLAR_SERVER } from '../stellar/stellar.constants';
import { StellarService } from '../stellar/stellar.service';
import { BlendService } from '../blend/blend.service';
import { SOROBAN_RPC_SERVER } from '../blend/blend.constants';

const DESTINATION_PUBLIC_KEY = Keypair.random().publicKey();
// Contract ids reales de testnet (confirmados contra
// blend-capital/blend-utils/testnet.contracts.json), para que el encoding
// de Address dentro de PoolContract.submit() tenga un strkey valido.
const TESTNET_BLEND_POOL_ID =
  'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF';
const TESTNET_USDC_ISSUER = Keypair.random().publicKey();

function createRepositoryMock() {
  return {
    create: vi.fn((partial: unknown) => partial),
    save: vi.fn((entity: unknown) => Promise.resolve(entity)),
    findOne: vi.fn(),
  };
}

/**
 * Mock minimo de Horizon.Server. Se comparte entre FamilyPoolsService y una
 * instancia REAL de StellarService (no mockeada): asi submitSignedTx y
 * mapHorizonError se ejercitan tal como corren en produccion, en vez de
 * reimplementar/mockear ese mapeo de errores en este spec.
 */
function createHorizonServerMock() {
  return {
    loadAccount: vi.fn(),
    fetchBaseFee: vi.fn(),
    submitTransaction: vi.fn(),
  };
}

function createConfigServiceMock() {
  return {
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
  };
}

function createFakeFamilyPool(overrides: Partial<FamilyPool> = {}): FamilyPool {
  return {
    id: 'family-pool-1',
    walletPublicKey: Keypair.random().publicKey(),
    ownerPublicKey: Keypair.random().publicKey(),
    withdrawalLimitPerTx: '100',
    medThreshold: 2,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    signers: [],
    ...overrides,
  };
}

function createSorobanRpcServerMock() {
  return {
    getAccount: vi.fn(),
    prepareTransaction: vi.fn(),
  };
}

describe('FamilyPoolsService', () => {
  let service: FamilyPoolsService;
  let familyPoolRepoMock: ReturnType<typeof createRepositoryMock>;
  let signerRepoMock: ReturnType<typeof createRepositoryMock>;
  let serverMock: ReturnType<typeof createHorizonServerMock>;
  let sorobanRpcServerMock: ReturnType<typeof createSorobanRpcServerMock>;

  beforeEach(async () => {
    familyPoolRepoMock = createRepositoryMock();
    signerRepoMock = createRepositoryMock();
    serverMock = createHorizonServerMock();
    sorobanRpcServerMock = createSorobanRpcServerMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FamilyPoolsService,
        StellarService,
        BlendService,
        {
          provide: getRepositoryToken(FamilyPool),
          useValue: familyPoolRepoMock,
        },
        {
          provide: getRepositoryToken(FamilyPoolSigner),
          useValue: signerRepoMock,
        },
        { provide: STELLAR_SERVER, useValue: serverMock },
        { provide: SOROBAN_RPC_SERVER, useValue: sorobanRpcServerMock },
        { provide: ConfigService, useValue: createConfigServiceMock() },
      ],
    }).compile();

    service = module.get(FamilyPoolsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildWithdrawalTx', () => {
    it('rechaza con UnprocessableEntityException si amount supera withdrawalLimitPerTx, sin llegar a Horizon', async () => {
      const familyPool = createFakeFamilyPool({ withdrawalLimitPerTx: '100' });
      familyPoolRepoMock.findOne.mockResolvedValue(familyPool);

      await expect(
        service.buildWithdrawalTx(familyPool.id, DESTINATION_PUBLIC_KEY, '150'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(serverMock.loadAccount).not.toHaveBeenCalled();
      expect(serverMock.fetchBaseFee).not.toHaveBeenCalled();
    });

    it('arma la tx de Payment cuando el monto esta dentro del limite', async () => {
      const sourceKeypair = Keypair.random();
      const familyPool = createFakeFamilyPool({
        walletPublicKey: sourceKeypair.publicKey(),
        withdrawalLimitPerTx: '100',
      });
      familyPoolRepoMock.findOne.mockResolvedValue(familyPool);
      serverMock.loadAccount.mockResolvedValue(
        new Account(sourceKeypair.publicKey(), '10'),
      );
      serverMock.fetchBaseFee.mockResolvedValue(100);

      const result = await service.buildWithdrawalTx(
        familyPool.id,
        DESTINATION_PUBLIC_KEY,
        '50',
      );

      expect(serverMock.loadAccount).toHaveBeenCalledWith(
        familyPool.walletPublicKey,
      );
      // Sin blendPoolId configurado (Plan B / comportamiento de la parte a):
      // no hay leg de redeem, solo el Payment directo.
      expect(result.redeemXdr).toBeNull();
      expect(typeof result.paymentXdr).toBe('string');
    });

    it('con blendPoolId configurado, arma redeemXdr (Blend Withdraw) + paymentXdr encadenados', async () => {
      const sourceKeypair = Keypair.random();
      const familyPool = createFakeFamilyPool({
        walletPublicKey: sourceKeypair.publicKey(),
        withdrawalLimitPerTx: '100',
        blendPoolId: TESTNET_BLEND_POOL_ID,
        investedAssetCode: 'USDC',
        investedAssetIssuer: TESTNET_USDC_ISSUER,
      });
      familyPoolRepoMock.findOne.mockResolvedValue(familyPool);
      serverMock.loadAccount.mockResolvedValue(
        new Account(sourceKeypair.publicKey(), '10'),
      );
      serverMock.fetchBaseFee.mockResolvedValue(100);
      sorobanRpcServerMock.getAccount.mockResolvedValue(
        new Account(sourceKeypair.publicKey(), '10'),
      );
      const preparedRedeemXdr = 'fake-prepared-redeem-xdr';
      sorobanRpcServerMock.prepareTransaction.mockResolvedValue({
        toXDR: () => preparedRedeemXdr,
      });

      const result = await service.buildWithdrawalTx(
        familyPool.id,
        DESTINATION_PUBLIC_KEY,
        '50',
      );

      expect(sorobanRpcServerMock.prepareTransaction).toHaveBeenCalledOnce();
      expect(result.redeemXdr).toBe(preparedRedeemXdr);
      expect(typeof result.paymentXdr).toBe('string');
      // El Payment se firma DESPUES del redeem (sequence n+2): el mock de
      // loadAccount se comparte, asi que si no se incrementa la sequence
      // entre uno y otro, paymentTransaction quedaria con la misma sequence
      // que hubiera tenido sin Blend -- lo cual seria un bug de replay.
    });
  });

  describe('buildSupplyToBlendTx', () => {
    it('rechaza con UnprocessableEntityException si el pool no tiene blendPoolId', async () => {
      const familyPool = createFakeFamilyPool({ blendPoolId: undefined });
      familyPoolRepoMock.findOne.mockResolvedValue(familyPool);

      await expect(
        service.buildSupplyToBlendTx(familyPool.id, '50'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(sorobanRpcServerMock.getAccount).not.toHaveBeenCalled();
    });
  });

  describe('submitMultiSignedWithdrawal', () => {
    it('mapea tx_bad_auth simulado al mensaje especifico de firmas insuficientes', async () => {
      // Necesita ser un XDR parseable de verdad (TransactionBuilder.fromXDR
      // corre antes de llegar a submitTransaction, que es lo que se mockea
      // para simular el rechazo de Horizon): las firmas en si no importan
      // para este test, submitTransaction se rechaza sin mirarlas.
      const source = Keypair.random();
      const destination = Keypair.random();
      const account = new Account(source.publicKey(), '100');
      const transaction = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: destination.publicKey(),
            asset: Asset.native(),
            amount: '10',
          }),
        )
        .setTimeout(30)
        .build();
      transaction.sign(source);
      const signedXdr = transaction.toXDR();

      const txBadAuthError = new TransactionFailedError('Transaction failed', {
        data: {
          extras: {
            result_codes: {
              transaction:
                Horizon.HorizonApi.TransactionFailedResultCodes.TX_BAD_AUTH,
              operations: [],
            },
          },
        },
      });
      serverMock.submitTransaction.mockRejectedValue(txBadAuthError);

      await expect(
        service.submitMultiSignedWithdrawal(signedXdr),
      ).rejects.toMatchObject({
        response: {
          message:
            'No se juntaron las firmas suficientes para autorizar este retiro.',
        },
      });
    });
  });
});
