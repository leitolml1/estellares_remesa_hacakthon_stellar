import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BASE_FEE, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { PoolContractV2, RequestType } from '@blend-capital/blend-sdk';
import {
  STELLAR_CONFIG_KEYS,
  STELLAR_DEFAULTS,
} from '../stellar/stellar.constants';
import {
  BLEND_TRANSACTION_TIMEOUT_SECONDS,
  SOROBAN_RPC_SERVER,
} from './blend.constants';

/**
 * Integracion con Blend (protocolo de lending sobre Soroban). A diferencia
 * del resto del proyecto (que solo habla con Horizon), esto interactua con
 * un RPC de Soroban separado: las tx con operaciones de Blend necesitan
 * simularse contra ese RPC (server.prepareTransaction) para que el SDK
 * popule el SorobanData, o Horizon las rechaza.
 *
 * IMPORTANTE (interop XDR): @blend-capital/blend-sdk trae su propia copia
 * interna de @stellar/stellar-sdk (hoy 16.0.0, mientras este proyecto usa
 * 17.0.1 -- confirmado con `npm ls`). Pasar objetos XDR "vivos" entre las
 * dos copias del SDK rompe instanceof/checks internos (issue conocido:
 * https://github.com/stellar/js-stellar-base/issues/617, documentado en el
 * propio README de blend-sdk-js). Por eso PoolContract.submit() se usa solo
 * para obtener un string base64, que se reconstruye acá con
 * xdr.Operation.fromXDR() de NUESTRA copia del SDK. Nunca se debe pasar un
 * objeto vivo (Address, xdr.Operation, etc.) de blend-sdk hacia el resto
 * del proyecto o viceversa.
 */
@Injectable()
export class BlendService {
  private readonly logger = new Logger(BlendService.name);
  private readonly networkPassphrase: string;

  constructor(
    @Inject(SOROBAN_RPC_SERVER) private readonly rpcServer: rpc.Server,
    private readonly configService: ConfigService,
  ) {
    this.networkPassphrase = this.configService.get<string>(
      STELLAR_CONFIG_KEYS.NETWORK_PASSPHRASE,
      STELLAR_DEFAULTS.NETWORK_PASSPHRASE,
    );
  }

  /**
   * Arma (offline, sin tocar el RPC) la operacion de Supply hacia el pool
   * de Blend. userAddress es, en el contexto de family-pools, la wallet del
   * pool familiar (Blend soporta cuentas clasicas G... como Address
   * directamente, no hace falta una smart wallet).
   */
  buildSupplyOperation(
    poolId: string,
    userAddress: string,
    amount: bigint,
    assetAddress: string,
  ): Promise<xdr.Operation> {
    return Promise.resolve(
      this.buildSubmitOperation(
        poolId,
        userAddress,
        RequestType.Supply,
        amount,
        assetAddress,
      ),
    );
  }

  /** Mismo patron que buildSupplyOperation, con RequestType.Withdraw. */
  buildWithdrawOperation(
    poolId: string,
    userAddress: string,
    amount: bigint,
    assetAddress: string,
  ): Promise<xdr.Operation> {
    return Promise.resolve(
      this.buildSubmitOperation(
        poolId,
        userAddress,
        RequestType.Withdraw,
        amount,
        assetAddress,
      ),
    );
  }

  private buildSubmitOperation(
    poolId: string,
    userAddress: string,
    requestType: RequestType,
    amount: bigint,
    assetAddress: string,
  ): xdr.Operation {
    // Blend testnet corre v2 (confirmado contra blend-utils/testnet.contracts.json).
    const poolContract = new PoolContractV2(poolId);
    const operationXdr = poolContract.submit({
      from: userAddress,
      spender: userAddress,
      to: userAddress,
      requests: [
        {
          request_type: requestType,
          address: assetAddress,
          amount,
        },
      ],
    });
    return xdr.Operation.fromXDR(operationXdr, 'base64');
  }

  /**
   * Arma la tx con la operacion de Blend (mismo patron loadAccount +
   * TransactionBuilder que stellarService, pero contra el RPC de Soroban)
   * y la simula/prepara para popular el SorobanData. prepareTransaction ya
   * hace simulateTransaction + assembleTransaction internamente (confirmado
   * contra rpc/server.d.ts de @stellar/stellar-sdk@17.0.1) y ajusta el fee
   * con el resource fee real de la simulacion.
   */
  async buildAndSimulateBlendTx(
    operation: xdr.Operation,
    sourcePublicKey: string,
  ): Promise<{ xdr: string }> {
    try {
      const account = await this.rpcServer.getAccount(sourcePublicKey);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(BLEND_TRANSACTION_TIMEOUT_SECONDS)
        .build();

      const prepared = await this.rpcServer.prepareTransaction(transaction);
      return { xdr: prepared.toXDR() };
    } catch (error) {
      this.mapSorobanError(error);
    }
  }

  /**
   * Mapeo minimo de errores del RPC/simulacion. A diferencia de Horizon
   * (mapHorizonError en stellar.service.ts), la superficie de errores de
   * simulateTransaction/prepareTransaction no esta tan documentada con
   * codigos estables -- se loguea el detalle crudo server-side y se
   * devuelve un mensaje generico al cliente, sin propagar el error interno.
   */
  private mapSorobanError(error: unknown): never {
    this.logger.error('Error simulando/preparando tx de Blend', error);

    if (
      error instanceof Error &&
      /connect|network|fetch|timeout/i.test(error.message)
    ) {
      throw new ServiceUnavailableException(
        'No se pudo contactar al RPC de Soroban. Reintenta en unos segundos.',
      );
    }

    throw new BadRequestException(
      'No se pudo simular la operacion contra el pool de Blend (revisa el balance disponible y que el asset este soportado por el pool).',
    );
  }
}
