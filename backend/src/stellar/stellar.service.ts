import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  AssetType,
  Horizon,
  Memo,
  NetworkError,
  NotFoundError,
  Operation,
  TransactionBuilder,
  TransactionFailedError,
} from '@stellar/stellar-sdk';
import {
  DEFAULT_PAYMENT_HISTORY_LIMIT,
  MAX_CONCURRENT_MEMO_LOOKUPS,
  NATIVE_ASSET_CODE,
  STELLAR_CONFIG_KEYS,
  STELLAR_DEFAULTS,
  STELLAR_SERVER,
  TRANSACTION_TIMEOUT_SECONDS,
} from './stellar.constants';
import { BuildPaymentDto, PaymentAssetDto } from './dto/build-payment.dto';
import { PaymentRecordDto } from './dto/payment-record.dto';
import { AccountBalanceDto, AssetBalanceDto } from './dto/account-balance.dto';

/** Union completa de los tipos de operacion que puede devolver payments(). */
type PaymentsPageOperationRecord =
  | Horizon.ServerApi.PaymentOperationRecord
  | Horizon.ServerApi.CreateAccountOperationRecord
  | Horizon.ServerApi.AccountMergeOperationRecord
  | Horizon.ServerApi.PathPaymentOperationRecord
  | Horizon.ServerApi.PathPaymentStrictSendOperationRecord
  | Horizon.ServerApi.InvokeHostFunctionOperationRecord;

/**
 * Subset de records que efectivamente representan un pago (from/to/amount).
 * Incluye path_payment_strict_send a proposito: es la unica operacion que
 * emite buildPathPaymentTx en este mismo servicio, asi que dejar afuera
 * este tipo hubiera hecho que memoFilter nunca matchee un pago hecho por
 * esta app (el spec original solo mencionaba type === 'payment').
 */
type PaymentLikeOperationRecord =
  | Horizon.ServerApi.PaymentOperationRecord
  | Horizon.ServerApi.PathPaymentOperationRecord
  | Horizon.ServerApi.PathPaymentStrictSendOperationRecord;

function isPaymentLikeOperationRecord(
  record: PaymentsPageOperationRecord,
): record is PaymentLikeOperationRecord {
  return 'amount' in record && 'from' in record && 'to' in record;
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly networkPassphrase: string;

  constructor(
    @Inject(STELLAR_SERVER) private readonly server: Horizon.Server,
    private readonly configService: ConfigService,
  ) {
    this.networkPassphrase = this.configService.get<string>(
      STELLAR_CONFIG_KEYS.NETWORK_PASSPHRASE,
      STELLAR_DEFAULTS.NETWORK_PASSPHRASE,
    );
  }

  /**
   * Arma (sin firmar) una tx con una operacion path_payment_strict_send.
   * La firma queda 100% del lado del cliente (con Freighter u otra wallet
   * compatible, el backend es agnostico): este metodo jamas recibe, genera
   * ni loguea una private key.
   */
  async buildPathPaymentTx(dto: BuildPaymentDto): Promise<{ xdr: string }> {
    try {
      const sendAsset = this.toAsset(dto.sendAsset);
      const destAsset = this.toAsset(dto.destAsset);

      // Chequeo preventivo: si destAsset no es nativo y el destino no tiene
      // la trustline, Horizon va a rechazar el submit con op_no_trust de
      // todas formas. Se corta aca para ahorrarle al cliente un roundtrip
      // completo de build -> firma -> submit -> error por algo que ya se
      // puede saber de antemano.
      const destIssuer = destAsset.getIssuer();
      if (!destAsset.isNative() && destIssuer) {
        const destHasTrustline = await this.hasTrustline(
          dto.destinationPublicKey,
          destAsset.getCode(),
          destIssuer,
        );
        if (!destHasTrustline) {
          throw new UnprocessableEntityException(
            `La cuenta destino no tiene trustline para ${destAsset.getCode()}. El destinatario debe agregarla antes de recibir este pago.`,
          );
        }
      }

      const sourceAccount = await this.server.loadAccount(dto.sourcePublicKey);

      // El fee se consulta a Horizon en vez de hardcodearse: en testnet (y
      // sobre todo en mainnet) el fee base varia con la congestion de la red,
      // y un valor fijo desactualizado puede hacer que Horizon rechace la tx
      // con tx_insufficient_fee.
      const baseFee = await this.server.fetchBaseFee();

      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: baseFee.toString(),
        networkPassphrase: this.networkPassphrase,
      }).addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount: dto.sendAmount,
          destination: dto.destinationPublicKey,
          destAsset,
          destMin: dto.destMin,
        }),
      );

      if (dto.memo) {
        txBuilder.addMemo(Memo.text(dto.memo));
      }

      // Timeout finito: sin setTimeout, una tx nunca firmada/enviada por el
      // cliente quedaria con timebounds abiertos indefinidamente.
      const transaction = txBuilder
        .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
        .build();

      return { xdr: transaction.toXDR() };
    } catch (error) {
      this.mapHorizonError(error);
    }
  }

  /**
   * Reconstruye la tx a partir del XDR ya firmado por el cliente y la
   * envia a Horizon. Separado de buildPathPaymentTx a proposito: el build
   * es puro (no side-effects en la red) y solo el submit efectivamente
   * gasta el sequence number de la cuenta, asi el cliente puede reintentar
   * el build cuantas veces necesite sin quemar secuencias.
   */
  async submitSignedTx(
    signedXdr: string,
  ): Promise<{ hash: string; ledger: number }> {
    try {
      const transaction = TransactionBuilder.fromXDR(
        signedXdr,
        this.networkPassphrase,
      );
      const response = await this.server.submitTransaction(transaction);
      return { hash: response.hash, ledger: response.ledger };
    } catch (error) {
      this.mapHorizonError(error);
    }
  }

  /**
   * Helper de lectura reusable para historial de pagos: paginacion real via
   * cursor de Horizon (no se trae todo para despues cortar en memoria) y
   * filtro opcional por memo exacto de la transaccion padre. Pensado para
   * que lo reutilicen el Modulo 2 (pool comunitario) y el Modulo 3.
   */
  async getTransactionHistory(
    publicKey: string,
    options?: {
      limit?: number;
      cursor?: string;
      memoFilter?: string;
    },
  ): Promise<{ records: PaymentRecordDto[]; nextCursor: string | null }> {
    try {
      let callBuilder = this.server
        .payments()
        .forAccount(publicKey)
        .order('desc')
        .limit(options?.limit ?? DEFAULT_PAYMENT_HISTORY_LIMIT);

      if (options?.cursor) {
        callBuilder = callBuilder.cursor(options.cursor);
      }

      const page = await callBuilder.call();

      const paymentLikeRecords = page.records.filter(
        isPaymentLikeOperationRecord,
      );
      const records = await this.attachMemos(paymentLikeRecords);

      const filteredRecords = options?.memoFilter
        ? records.filter((record) => record.memo === options.memoFilter)
        : records;

      // El cursor de la proxima pagina se calcula sobre la respuesta cruda
      // de Horizon, no sobre la lista ya filtrada por memo: asi la
      // paginacion avanza de forma consistente aunque memoFilter descarte
      // records de esta pagina.
      const lastRawRecord = page.records[page.records.length - 1];
      const nextCursor = lastRawRecord?.paging_token ?? null;

      return { records: filteredRecords, nextCursor };
    } catch (error) {
      this.mapHorizonError(error);
    }
  }

  /**
   * Balances de una cuenta, mapeados a un DTO propio (nunca se devuelve el
   * objeto crudo de account.balances).
   */
  async getAccountBalance(publicKey: string): Promise<AccountBalanceDto> {
    try {
      const account = await this.server.loadAccount(publicKey);
      return {
        publicKey,
        balances: account.balances.map((line) => this.toAssetBalanceDto(line)),
      };
    } catch (error) {
      this.mapHorizonError(error);
    }
  }

  /**
   * Chequea si `publicKey` tiene trustline para un asset. El activo nativo
   * (XLM) no requiere trustline, asi que siempre devuelve true sin pegarle
   * a Horizon. Reusa getAccountBalance en vez de duplicar el loadAccount.
   */
  async hasTrustline(
    publicKey: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<boolean> {
    if (assetCode.toUpperCase() === NATIVE_ASSET_CODE) {
      return true;
    }
    const { balances } = await this.getAccountBalance(publicKey);
    return balances.some(
      (balance) =>
        balance.assetCode === assetCode && balance.assetIssuer === assetIssuer,
    );
  }

  /**
   * HorizonApi.BalanceLine tiene 3 formas segun asset_type: native,
   * credit_alphanum4/12 (con asset_code/asset_issuer/limit), y
   * liquidity_pool_shares (con liquidity_pool_id en vez de asset_code, ver
   * .d.ts de @stellar/stellar-sdk@17.0.1). Se mapean las 3 en vez de asumir
   * que balances[] solo trae los 2 tipos "normales" de un pago P2P.
   */
  private toAssetBalanceDto(
    line: Horizon.HorizonApi.BalanceLine,
  ): AssetBalanceDto {
    if (line.asset_type === AssetType.native) {
      return { assetType: AssetType.native, balance: line.balance };
    }

    if (line.asset_type === AssetType.liquidityPoolShares) {
      return {
        assetType: AssetType.liquidityPoolShares,
        balance: line.balance,
        limit: line.limit,
        liquidityPoolId: line.liquidity_pool_id,
      };
    }

    return {
      assetType: line.asset_type,
      assetCode: line.asset_code,
      assetIssuer: line.asset_issuer,
      balance: line.balance,
      limit: line.limit,
    };
  }

  private toAsset(asset: PaymentAssetDto): Asset {
    if (asset.code.toUpperCase() === NATIVE_ASSET_CODE) {
      return Asset.native();
    }
    if (!asset.issuer) {
      throw new UnprocessableEntityException(
        `El asset "${asset.code}" no es XLM nativo y requiere un issuer.`,
      );
    }
    return new Asset(asset.code, asset.issuer);
  }

  /**
   * El memo vive en la transaccion padre, no en la operacion: por cada
   * record hay que pedir record.transaction() (1 request extra). Se
   * resuelve en batches de tamano fijo para no disparar todas las
   * llamadas en paralelo y comerse el rate limit de Horizon testnet.
   */
  private async attachMemos(
    records: PaymentLikeOperationRecord[],
  ): Promise<PaymentRecordDto[]> {
    return this.mapInBatches(
      records,
      MAX_CONCURRENT_MEMO_LOOKUPS,
      async (record) => {
        const transaction = await record.transaction();
        return this.toPaymentRecordDto(record, transaction.memo);
      },
    );
  }

  private async mapInBatches<T, R>(
    items: T[],
    batchSize: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let offset = 0; offset < items.length; offset += batchSize) {
      const chunk = items.slice(offset, offset + batchSize);
      const chunkResults = await Promise.all(chunk.map(mapper));
      results.push(...chunkResults);
    }
    return results;
  }

  private toPaymentRecordDto(
    record: PaymentLikeOperationRecord,
    memo?: string,
  ): PaymentRecordDto {
    const isNative = record.asset_type === AssetType.native;
    return {
      id: record.id,
      from: record.from,
      to: record.to,
      amount: record.amount,
      assetCode: isNative ? AssetType.native : (record.asset_code ?? ''),
      assetIssuer: isNative ? undefined : record.asset_issuer,
      memo,
      createdAt: record.created_at,
      transactionHash: record.transaction_hash,
    };
  }

  /**
   * Centraliza el mapeo de errores de Horizon/SDK a excepciones legibles de
   * Nest, para no repetir el switch en cada metodo publico del servicio.
   * Nunca propaga el error crudo del SDK al cliente.
   */
  private mapHorizonError(error: unknown): never {
    // Las excepciones propias de Nest (ej. el UnprocessableEntityException
    // del chequeo de trustline o el de toAsset) ya son la respuesta final
    // que quiero devolver: si se re-mapean igual que un error del SDK caen
    // en el fallback generico de mas abajo y el cliente pierde el mensaje
    // especifico.
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof TransactionFailedError) {
      const { transaction, operations } = error.getResultCodes();

      if (
        transaction ===
        Horizon.HorizonApi.TransactionFailedResultCodes.TX_BAD_SEQ
      ) {
        throw new ConflictException(
          'La cuenta tiene una transaccion pendiente o el sequence number esta desactualizado, reintenta.',
        );
      }

      if (operations.includes('op_underfunded')) {
        throw new UnprocessableEntityException(
          'Fondos insuficientes en la cuenta de origen para completar el pago.',
        );
      }

      if (operations.includes('op_no_trust')) {
        throw new UnprocessableEntityException(
          'La cuenta destino no tiene una trustline para el asset solicitado.',
        );
      }

      this.logger.error(
        `Transaccion rechazada por Horizon: ${JSON.stringify({ transaction, operations })}`,
      );
      throw new BadRequestException(
        'La transaccion fue rechazada por la red Stellar.',
      );
    }

    if (error instanceof NotFoundError) {
      throw new NotFoundException(
        'La cuenta no existe o todavia no fue fondeada en la red Stellar.',
      );
    }

    if (error instanceof NetworkError) {
      // Cubre BadRequestError / BadResponseError (no tx_failed) / cualquier
      // otro NetworkError no manejado arriba: se loguea completo server-side
      // pero al cliente se le devuelve un mensaje generico.
      this.logger.error(
        `Error de Horizon no mapeado: ${JSON.stringify(error.getResponse())}`,
      );
      throw new InternalServerErrorException(
        'Ocurrio un error inesperado al comunicarse con la red Stellar.',
      );
    }

    // Errores que no llegan a tener una respuesta HTTP de Horizon (timeout,
    // DNS, conexion rechazada, etc.) no son instancias de NetworkError.
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Fallo de red/timeout hablando con Horizon: ${message}`);
    throw new ServiceUnavailableException(
      'El servicio de Stellar Horizon no esta disponible en este momento, reintenta en unos segundos.',
    );
  }
}
