import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Account, Keypair, xdr } from '@stellar/stellar-sdk';
import { BlendService } from './blend.service';
import { SOROBAN_RPC_SERVER } from './blend.constants';

// Contract ids reales de testnet (confirmados contra
// blend-capital/blend-utils/testnet.contracts.json), usados solo para que
// el encoding de Address dentro de PoolContract.submit() tenga un strkey
// valido -- no se llega a tocar la red en estos tests.
const TESTNET_POOL_ID =
  'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF';
const TESTNET_USDC_CONTRACT_ID =
  'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';

function createConfigServiceMock() {
  return {
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
  };
}

function createRpcServerMock() {
  return {
    getAccount: vi.fn(),
    prepareTransaction: vi.fn(),
  };
}

describe('BlendService', () => {
  let service: BlendService;
  let rpcServerMock: ReturnType<typeof createRpcServerMock>;

  beforeEach(async () => {
    rpcServerMock = createRpcServerMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlendService,
        { provide: SOROBAN_RPC_SERVER, useValue: rpcServerMock },
        { provide: ConfigService, useValue: createConfigServiceMock() },
      ],
    }).compile();

    service = module.get(BlendService);
  });

  it('arma la operacion de Supply offline, sin tocar el RPC', async () => {
    const userAddress = Keypair.random().publicKey();

    const operation = await service.buildSupplyOperation(
      TESTNET_POOL_ID,
      userAddress,
      10_0000000n,
      TESTNET_USDC_CONTRACT_ID,
    );

    expect(operation).toBeInstanceOf(xdr.Operation);
    expect(rpcServerMock.getAccount).not.toHaveBeenCalled();
  });

  it('arma la operacion de Withdraw offline, sin tocar el RPC', async () => {
    const userAddress = Keypair.random().publicKey();

    const operation = await service.buildWithdrawOperation(
      TESTNET_POOL_ID,
      userAddress,
      5_0000000n,
      TESTNET_USDC_CONTRACT_ID,
    );

    expect(operation).toBeInstanceOf(xdr.Operation);
    expect(rpcServerMock.getAccount).not.toHaveBeenCalled();
  });

  it('buildAndSimulateBlendTx carga la cuenta y prepara la tx contra el RPC de Soroban', async () => {
    const sourcePublicKey = Keypair.random().publicKey();
    const operation = await service.buildSupplyOperation(
      TESTNET_POOL_ID,
      sourcePublicKey,
      1_0000000n,
      TESTNET_USDC_CONTRACT_ID,
    );

    rpcServerMock.getAccount.mockResolvedValue(
      new Account(sourcePublicKey, '5'),
    );
    const preparedTxXdr = 'fake-prepared-tx-xdr';
    rpcServerMock.prepareTransaction.mockResolvedValue({
      toXDR: () => preparedTxXdr,
    });

    const result = await service.buildAndSimulateBlendTx(
      operation,
      sourcePublicKey,
    );

    expect(rpcServerMock.getAccount).toHaveBeenCalledWith(sourcePublicKey);
    expect(rpcServerMock.prepareTransaction).toHaveBeenCalledOnce();
    expect(result).toEqual({ xdr: preparedTxXdr });
  });
});
