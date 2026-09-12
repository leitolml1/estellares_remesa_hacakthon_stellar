import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
import { StellarService } from './stellar.service';
import { STELLAR_SERVER } from './stellar.constants';
import { BuildPaymentDto } from './dto/build-payment.dto';

/**
 * Mock minimo de Horizon.Server: solo se implementan los metodos que el
 * servicio realmente usa, para no pegarle a la red real en el test unitario.
 */
function createHorizonServerMock() {
  return {
    loadAccount: vi.fn(),
    fetchBaseFee: vi.fn(),
    submitTransaction: vi.fn(),
    payments: vi.fn(),
  };
}

function createConfigServiceMock() {
  return {
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
  };
}

/** Mock fluido del call builder de .payments(): forAccount/order/limit/cursor/call. */
function createPaymentsCallBuilderMock(page: { records: unknown[] }) {
  const builder = {
    forAccount: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    cursor: vi.fn(() => builder),
    call: vi.fn().mockResolvedValue(page),
  };
  return builder;
}

/** Fake payment record minimo, con record.transaction() mockeado para el memo. */
function createFakePaymentRecord(overrides: {
  id: string;
  pagingToken: string;
  memo?: string;
}) {
  return {
    id: overrides.id,
    type: 'payment',
    from: 'GFROMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    to: 'GTOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amount: '10.0000000',
    asset_type: 'native',
    created_at: '2026-01-01T00:00:00Z',
    transaction_hash: `hash-${overrides.id}`,
    paging_token: overrides.pagingToken,
    transaction: vi.fn().mockResolvedValue({ memo: overrides.memo }),
  };
}

describe('StellarService', () => {
  let service: StellarService;
  let serverMock: ReturnType<typeof createHorizonServerMock>;

  beforeEach(async () => {
    serverMock = createHorizonServerMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        { provide: STELLAR_SERVER, useValue: serverMock },
        { provide: ConfigService, useValue: createConfigServiceMock() },
      ],
    }).compile();

    service = module.get(StellarService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildPathPaymentTx', () => {
    it('arma la tx con la operacion pathPaymentStrictSend a partir del mock de loadAccount', async () => {
      const source = Keypair.random();
      const destination = Keypair.random();

      serverMock.loadAccount.mockResolvedValue(
        new Account(source.publicKey(), '100'),
      );
      serverMock.fetchBaseFee.mockResolvedValue(100);

      const dto: BuildPaymentDto = {
        sourcePublicKey: source.publicKey(),
        destinationPublicKey: destination.publicKey(),
        sendAsset: { code: 'XLM' },
        sendAmount: '50',
        destAsset: { code: 'XLM' },
        destMin: '50',
      };

      const result = await service.buildPathPaymentTx(dto);

      expect(serverMock.loadAccount).toHaveBeenCalledWith(source.publicKey());
      expect(serverMock.fetchBaseFee).toHaveBeenCalled();
      expect(typeof result.xdr).toBe('string');

      const decoded = TransactionBuilder.fromXDR(result.xdr, Networks.TESTNET);
      expect('operations' in decoded ? decoded.operations : []).toHaveLength(1);
      if ('operations' in decoded) {
        const [operation] = decoded.operations;
        expect(operation.type).toBe('pathPaymentStrictSend');
      }
    });

    it('lanza UnprocessableEntityException si destAsset no es nativo y el destino no tiene trustline, sin llegar a armar la tx', async () => {
      const source = Keypair.random();
      const destination = Keypair.random();
      const issuer = Keypair.random().publicKey();

      // loadAccount se usa tanto para chequear la trustline del destino
      // como (si se llegara a armar la tx) para cargar la cuenta origen;
      // se mockea sin la trustline para forzar el guard.
      serverMock.loadAccount.mockResolvedValue({ balances: [] });

      const dto: BuildPaymentDto = {
        sourcePublicKey: source.publicKey(),
        destinationPublicKey: destination.publicKey(),
        sendAsset: { code: 'XLM' },
        sendAmount: '50',
        destAsset: { code: 'USDC', issuer },
        destMin: '50',
      };

      await expect(service.buildPathPaymentTx(dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      // Solo se llamo loadAccount para chequear la trustline del destino:
      // si se hubiera llamado una 2da vez, significaria que el guard no
      // corto antes de seguir armando la tx (ej. cargando la cuenta origen).
      expect(serverMock.loadAccount).toHaveBeenCalledTimes(1);
      expect(serverMock.loadAccount).toHaveBeenCalledWith(
        destination.publicKey(),
      );
      expect(serverMock.fetchBaseFee).not.toHaveBeenCalled();
    });
  });

  describe('submitSignedTx', () => {
    it('mapea un error tx_bad_seq de Horizon a ConflictException', async () => {
      const source = Keypair.random();
      const destination = Keypair.random();
      const account = new Account(source.publicKey(), '100');

      // XDR firmado valido (offline, sin red) para pasarle a submitSignedTx.
      const transaction = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: Asset.native(),
            sendAmount: '50',
            destination: destination.publicKey(),
            destAsset: Asset.native(),
            destMin: '50',
          }),
        )
        .setTimeout(30)
        .build();
      transaction.sign(source);
      const signedXdr = transaction.toXDR();

      const txBadSeqError = new TransactionFailedError('Transaction failed', {
        data: {
          extras: {
            result_codes: {
              transaction:
                Horizon.HorizonApi.TransactionFailedResultCodes.TX_BAD_SEQ,
              operations: [],
            },
          },
        },
      });
      serverMock.submitTransaction.mockRejectedValue(txBadSeqError);

      await expect(service.submitSignedTx(signedXdr)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('filtra por memo exacto resolviendo record.transaction() por cada record', async () => {
      const records = [
        createFakePaymentRecord({
          id: '1',
          pagingToken: 'p1',
          memo: 'pool_a3f9k2',
        }),
        createFakePaymentRecord({
          id: '2',
          pagingToken: 'p2',
          memo: 'otro-memo',
        }),
        createFakePaymentRecord({
          id: '3',
          pagingToken: 'p3',
          memo: 'pool_a3f9k2',
        }),
      ];
      const callBuilder = createPaymentsCallBuilderMock({ records });
      serverMock.payments.mockReturnValue(callBuilder);

      const result = await service.getTransactionHistory('GANYPUBLICKEY', {
        memoFilter: 'pool_a3f9k2',
      });

      expect(result.records).toHaveLength(2);
      expect(
        result.records.every((record) => record.memo === 'pool_a3f9k2'),
      ).toBe(true);
      // El cursor se calcula sobre la respuesta cruda, no sobre la lista
      // filtrada: debe ser el paging_token del ultimo record devuelto por
      // Horizon (id "3"), no del ultimo record que sobrevivio al filtro.
      expect(result.nextCursor).toBe('p3');

      for (const record of records) {
        expect(record.transaction).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('hasTrustline', () => {
    it('devuelve true para el asset nativo sin pegarle a Horizon', async () => {
      const result = await service.hasTrustline(
        'GDESTPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'XLM',
        Keypair.random().publicKey(),
      );

      expect(result).toBe(true);
      expect(serverMock.loadAccount).not.toHaveBeenCalled();
    });

    it('devuelve true si la cuenta tiene una balance line que matchea assetCode + assetIssuer', async () => {
      const issuer = Keypair.random().publicKey();
      serverMock.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: issuer,
            balance: '0.0000000',
            limit: '922337203685.4775807',
          },
        ],
      });

      const result = await service.hasTrustline(
        'GDESTPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'USDC',
        issuer,
      );

      expect(result).toBe(true);
    });

    it('devuelve false si la cuenta no tiene ninguna balance line para ese asset', async () => {
      serverMock.loadAccount.mockResolvedValue({ balances: [] });

      const result = await service.hasTrustline(
        'GDESTPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'USDC',
        Keypair.random().publicKey(),
      );

      expect(result).toBe(false);
    });
  });
});
