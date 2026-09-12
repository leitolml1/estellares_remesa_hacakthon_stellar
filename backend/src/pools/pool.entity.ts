import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity()
export class Pool {
  /**
   * uuid generado por Postgres (gen_random_uuid(), ver uuidExtension:
   * 'pgcrypto' en la config de TypeOrmModule) en vez de en la app: asi el
   * id siempre existe incluso si se inserta una fila fuera de este servicio.
   */
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  /** Codigo corto que va en el memo de la tx (max 28 bytes en Stellar). */
  @Index({ unique: true })
  @Column()
  shortCode!: string;

  /** Cuenta Stellar que recibe las donaciones de este pool. */
  @Column()
  walletPublicKey!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Meta de recaudacion. String por precision, igual que los balances. */
  @Column({ nullable: true })
  goalAmount?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
