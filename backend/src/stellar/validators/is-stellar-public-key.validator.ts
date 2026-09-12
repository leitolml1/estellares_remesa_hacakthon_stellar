import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';

@ValidatorConstraint({ name: 'isStellarPublicKey', async: false })
class IsStellarPublicKeyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // Se delega en StrKey (SDK oficial) en vez de un regex propio, para
    // heredar cualquier chequeo de checksum/version-byte que Stellar defina.
    return typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
  }

  defaultMessage(): string {
    return '$property debe ser una public key de Stellar valida (formato G...)';
  }
}

export function IsStellarPublicKey(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStellarPublicKeyConstraint,
    });
  };
}
