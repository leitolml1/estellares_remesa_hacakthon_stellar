import { IsStellarPublicKey } from '../validators/is-stellar-public-key.validator';

/** DTO compartido para validar un :publicKey de ruta en cualquier controller. */
export class PublicKeyParamDto {
  @IsStellarPublicKey()
  publicKey!: string;
}
