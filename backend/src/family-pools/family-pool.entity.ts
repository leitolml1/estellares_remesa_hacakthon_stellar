import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';

@Entity()
export class FamilyPool {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  /** Cuenta Stellar de la caja familiar (recibe depositos libremente). */
  @Column()
  walletPublicKey!: string;

  /** Quien creo el pool; tipicamente el weight mas alto post-configuracion. */
  @Column()
  ownerPublicKey!: string;

  /**
   * Tope de monto por retiro. El protocolo (multisig nativo) no valida
   * montos por signer, asi que esto es 100% responsabilidad del backend
   * (ver FamilyPoolsService.buildWithdrawalTx).
   */
  @Column()
  withdrawalLimitPerTx!: string;

  /**
   * Threshold configurado on-chain (aplica a Payment). Se guarda tambien
   * aca para no tener que leerlo de Horizon cada vez que se valida/reusa.
   */
  @Column({ type: 'smallint' })
  medThreshold!: number;

  /**
   * Asset clasico Stellar que se invierte en Blend (ej. USDC). undefined =
   * XLM nativo. No se guarda el contract id de Soroban por separado: se
   * deriva con Asset(code, issuer).contractId(networkPassphrase) -- es
   * determinístico, guardarlo aparte solo introduciria una fuente mas de
   * inconsistencia.
   */
  @Column({ nullable: true })
  investedAssetCode?: string;

  @Column({ nullable: true })
  investedAssetIssuer?: string;

  /**
   * Contract id (C...) del pool de Blend contra el que se hace supply/
   * withdraw. undefined = Plan B: el pool familiar funciona sin Blend
   * (depositar/retirar directo, sin yield, igual que en la parte a). Es
   * opt-in a proposito: activar Blend no es gratis para el usuario, un
   * supply/withdraw hacia Blend pasa por el mismo multisig que un retiro
   * (ver comentario en FamilyPoolsService.buildSupplyToBlendTx).
   */
  @Column({ nullable: true })
  blendPoolId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => FamilyPoolSigner, (signer) => signer.familyPool, {
    cascade: true,
  })
  signers?: FamilyPoolSigner[];
}

@Entity()
export class FamilyPoolSigner {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column()
  familyPoolId!: string;

  @ManyToOne(() => FamilyPool, (pool) => pool.signers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyPoolId' })
  familyPool?: FamilyPool;

  @Column()
  publicKey!: string;

  /** 0-255, igual que el weight nativo de Stellar (0 = sin permiso real). */
  @Column({ type: 'smallint' })
  weight!: number;

  /** Solo para UI (ej. "Mama", "Hijo mayor"): no afecta nada on-chain. */
  @Column({ nullable: true })
  label?: string;
}
