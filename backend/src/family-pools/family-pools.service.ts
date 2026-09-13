import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Asset,
  Horizon,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  STELLAR_CONFIG_KEYS,
  STELLAR_DEFAULTS,
  STELLAR_SERVER,
  TRANSACTION_TIMEOUT_SECONDS,
} from '../stellar/stellar.constants';
import { BlendService } from '../blend/blend.service';
import { FamilyPool, FamilyPoolSigner } from './family-pool.entity';
import { CreateFamilyPoolDto } from './dto/create-family-pool.dto';

/** Igual que en todo el proyecto: los montos de Stellar tienen 7 decimales. */
const STROOP_DECIMALS = 7;

@Injectable()
export class FamilyPoolsService {
  private readonly networkPassphrase: string;

  constructor(
    @InjectRepository(FamilyPool)
    private readonly familyPoolRepository: Repository<FamilyPool>,
    @InjectRepository(FamilyPoolSigner)
    private readonly signerRepository: Repository<FamilyPoolSigner>,
    @Inject(STELLAR_SERVER) private readonly server: Horizon.Server,
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly blendService: BlendService,
  ) {
    this.networkPassphrase = this.configService.get<string>(
      STELLAR_CONFIG_KEYS.NETWORK_PASSPHRASE,
      STELLAR_DEFAULTS.NETWORK_PASSPHRASE,
    );
  }

  /** Solo persiste en Postgres. No toca Horizon: la config on-chain es un paso aparte. */
  async createFamilyPool(dto: CreateFamilyPoolDto): Promise<FamilyPool> {
    if (dto.investedAssetCode && !dto.investedAssetIssuer) {
      throw new UnprocessableEntityException(
        'investedAssetIssuer es requerido cuando se especifica investedAssetCode.',
      );
    }

    const familyPool = await this.familyPoolRepository.save(
      this.familyPoolRepository.create({
        walletPublicKey: dto.walletPublicKey,
        ownerPublicKey: dto.ownerPublicKey,
        withdrawalLimitPerTx: dto.withdrawalLimitPerTx,
        medThreshold: dto.medThreshold,
        investedAssetCode: dto.investedAssetCode,
        investedAssetIssuer: dto.investedAssetIssuer,
        blendPoolId: dto.blendPoolId,
      }),
    );

    const signers = await this.signerRepository.save(
      dto.signers.map((signerDto) =>
        this.signerRepository.create({
          familyPoolId: familyPool.id,
          publicKey: signerDto.publicKey,
          weight: signerDto.weight,
          label: signerDto.label,
        }),
      ),
    );

    familyPool.signers = signers;
    return familyPool;
  }

  /**
   * Arma (sin firmar) la tx que reconfigura la cuenta on-chain: una
   * operacion setOptions por cada signer (el SDK solo permite un signer
   * por operacion, ver Operation.setOptions) + una operacion final que
   * fija el medThreshold. La tiene que firmar el master weight actual de
   * la cuenta (tipicamente ownerPublicKey, antes de que se reconfigure) —
   * mismo patron de siempre: build sin firmar aca, firma client-side,
   * submit via stellarService.submitSignedTx.
   */
  async configureMultisig(familyPoolId: string): Promise<{ xdr: string }> {
    const familyPool = await this.getFamilyPoolWithSignersOrThrow(familyPoolId);

    try {
      const account = await this.server.loadAccount(familyPool.walletPublicKey);
      const baseFee = await this.server.fetchBaseFee();

      const txBuilder = new TransactionBuilder(account, {
        fee: baseFee.toString(),
        networkPassphrase: this.networkPassphrase,
      });

      for (const signer of familyPool.signers ?? []) {
        txBuilder.addOperation(
          Operation.setOptions({
            signer: {
              ed25519PublicKey: signer.publicKey,
              weight: signer.weight,
            },
          }),
        );
      }

      txBuilder.addOperation(
        Operation.setOptions({ medThreshold: familyPool.medThreshold }),
      );

      const transaction = txBuilder
        .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
        .build();
      return { xdr: transaction.toXDR() };
    } catch (error) {
      this.stellarService.mapHorizonError(error);
    }
  }

  /**
   * Arma (sin firmar) el/los paso(s) necesarios para retirar. El multisig
   * nativo NO valida montos por signer -> el tope se chequea aca, ANTES de
   * tocar Horizon/Soroban o armar nada.
   *
   * Si el pool tiene Blend habilitado (blendPoolId), un retiro completo son
   * DOS transacciones encadenadas:
   *   1. redeemXdr: Withdraw en Blend, trae los fondos de vuelta a la
   *      wallet del pool (sin esto, la wallet no tiene el dinero liquido
   *      para pagarle al destinatario -- esta invertido en Blend).
   *   2. paymentXdr: Payment de la wallet del pool hacia destinationPublicKey.
   * Ambas requieren el MISMO set de firmas (mismos signers/threshold, son
   * operaciones de la misma cuenta) y se firman/envian en ese orden: la
   * sequence de paymentXdr ya asume que redeemXdr se aplico. Si el pool NO
   * tiene Blend habilitado, redeemXdr es null y solo existe paymentXdr
   * (comportamiento identico al de la parte a).
   */
  async buildWithdrawalTx(
    familyPoolId: string,
    destinationPublicKey: string,
    amount: string,
  ): Promise<{ redeemXdr: string | null; paymentXdr: string }> {
    const familyPool = await this.getFamilyPoolOrThrow(familyPoolId);

    // Comparacion numerica simple (mismo criterio que IsStellarAmount en
    // el resto del proyecto): suficiente para los montos de un pool
    // familiar, no se introduce una lib de precision arbitraria para esto.
    if (Number(amount) > Number(familyPool.withdrawalLimitPerTx)) {
      throw new UnprocessableEntityException(
        `El monto solicitado (${amount}) supera el limite por retiro configurado para este pool (${familyPool.withdrawalLimitPerTx}).`,
      );
    }

    const asset = this.toClassicAsset(familyPool);

    try {
      const account = await this.server.loadAccount(familyPool.walletPublicKey);
      const baseFee = await this.server.fetchBaseFee();

      let redeemXdr: string | null = null;

      if (familyPool.blendPoolId) {
        const assetAddress = asset.contractId(this.networkPassphrase);
        const withdrawOperation =
          await this.blendService.buildWithdrawOperation(
            familyPool.blendPoolId,
            familyPool.walletPublicKey,
            this.toStroops(amount),
            assetAddress,
          );
        const blendTx = await this.blendService.buildAndSimulateBlendTx(
          withdrawOperation,
          familyPool.walletPublicKey,
        );
        redeemXdr = blendTx.xdr;

        // El redeem incrementa la sequence on-chain en 1 al aplicarse. Se
        // refleja aca en el mismo objeto Account (cargado de Horizon) que
        // se usa para armar el Payment de abajo, para que quede con la
        // sequence correcta (n+2) -- asumiendo que el frontend firma y
        // envia redeemXdr ANTES que paymentXdr, como se documenta arriba.
        account.incrementSequenceNumber();
      }

      const paymentTransaction = new TransactionBuilder(account, {
        fee: baseFee.toString(),
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: destinationPublicKey,
            asset,
            amount,
          }),
        )
        .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
        .build();

      return { redeemXdr, paymentXdr: paymentTransaction.toXDR() };
    } catch (error) {
      this.stellarService.mapHorizonError(error);
    }
  }

  /**
   * Arma (sin firmar) la operacion de Supply hacia Blend desde la wallet
   * del pool. Paso EXPLICITO, no automatico post-deposito: aunque depositar
   * en el pool (Payment de un familiar hacia la wallet) no requiere firma
   * de la wallet, mover ese capital a Blend si la requiere -- el threshold
   * de una cuenta clasica aplica a TODAS sus operaciones salientes
   * (incluida invokeHostFunction, la que arma PoolContract.submit por
   * debajo), no solo a Payment. Por eso esto junta firmas igual que un
   * retiro (mismo flujo build -> firma client-side -> submitSignedTx).
   */
  async buildSupplyToBlendTx(
    familyPoolId: string,
    amount: string,
  ): Promise<{ xdr: string }> {
    const familyPool = await this.getFamilyPoolOrThrow(familyPoolId);

    if (!familyPool.blendPoolId) {
      throw new UnprocessableEntityException(
        'Este pool familiar no tiene Blend habilitado (falta blendPoolId).',
      );
    }

    const asset = this.toClassicAsset(familyPool);
    const assetAddress = asset.contractId(this.networkPassphrase);

    const supplyOperation = await this.blendService.buildSupplyOperation(
      familyPool.blendPoolId,
      familyPool.walletPublicKey,
      this.toStroops(amount),
      assetAddress,
    );

    return this.blendService.buildAndSimulateBlendTx(
      supplyOperation,
      familyPool.walletPublicKey,
    );
  }

  /**
   * Wrapper fino sobre submitSignedTx: el XDR ya viene con las firmas
   * acumuladas de cada familiar. Sirve tanto para retiros (Payment/redeem)
   * como para el supply a Blend -- stellarService.submitSignedTx es
   * agnostico al tipo de operacion. Si no llegan las firmas al threshold,
   * Horizon rechaza con tx_bad_auth, que ya mapea (via mapHorizonError) a
   * un 422 con mensaje especifico.
   */
  submitMultiSignedWithdrawal(
    signedXdr: string,
  ): Promise<{ hash: string; ledger: number }> {
    return this.stellarService.submitSignedTx(signedXdr);
  }

  /**
   * Asset clasico configurado para este pool (XLM nativo si no se
   * configuro investedAssetCode). El contract id de Soroban que Blend
   * necesita se deriva de este asset con Asset.contractId(), nunca se
   * guarda por separado (ver comentario en la entidad).
   */
  private toClassicAsset(familyPool: FamilyPool): Asset {
    if (!familyPool.investedAssetCode) {
      return Asset.native();
    }
    if (!familyPool.investedAssetIssuer) {
      throw new UnprocessableEntityException(
        `El pool ${familyPool.id} tiene investedAssetCode sin investedAssetIssuer configurado.`,
      );
    }
    return new Asset(
      familyPool.investedAssetCode,
      familyPool.investedAssetIssuer,
    );
  }

  /**
   * Convierte un monto decimal (string, 7 decimales max, igual que el
   * resto del proyecto) al entero crudo en bigint que espera Blend
   * (Request.amount es i128 = bigint). Sin pasar por number en ningun
   * momento para no perder precision. Asume 7 decimales porque el asset
   * usado con Blend es siempre un asset clasico de Stellar envuelto
   * (Stellar Asset Contract), que siempre usa 7 decimales -- no aplica a
   * tokens Soroban arbitrarios con otra cantidad de decimales.
   */
  private toStroops(amount: string): bigint {
    const [integerPart, decimalPartRaw = ''] = amount.split('.');
    if (decimalPartRaw.length > STROOP_DECIMALS) {
      throw new UnprocessableEntityException(
        `El monto "${amount}" tiene mas de ${STROOP_DECIMALS} decimales.`,
      );
    }
    const decimalPart = decimalPartRaw.padEnd(STROOP_DECIMALS, '0');
    return (
      BigInt(integerPart || '0') * BigInt(10 ** STROOP_DECIMALS) +
      BigInt(decimalPart || '0')
    );
  }

  private async getFamilyPoolOrThrow(id: string): Promise<FamilyPool> {
    const familyPool = await this.familyPoolRepository.findOne({
      where: { id },
    });
    if (!familyPool) {
      throw new NotFoundException(`No existe un family pool con id "${id}".`);
    }
    return familyPool;
  }

  private async getFamilyPoolWithSignersOrThrow(
    id: string,
  ): Promise<FamilyPool> {
    const familyPool = await this.familyPoolRepository.findOne({
      where: { id },
      relations: { signers: true },
    });
    if (!familyPool) {
      throw new NotFoundException(`No existe un family pool con id "${id}".`);
    }
    return familyPool;
  }
}
