import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Stellar representa montos con hasta 7 decimales y no admite negativos ni
// notacion cientifica: se valida con un regex propio en vez de IsNumberString
// (que permite formatos como "-1" o "1e10" que Horizon rechazaria igual).
const STELLAR_AMOUNT_REGEX = /^\d+(\.\d{1,7})?$/;

@ValidatorConstraint({ name: 'isStellarAmount', async: false })
class IsStellarAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !STELLAR_AMOUNT_REGEX.test(value)) {
      return false;
    }
    return Number(value) > 0;
  }

  defaultMessage(): string {
    return '$property debe ser un monto positivo en formato string, con hasta 7 decimales (ej: "50.1234567")';
  }
}

export function IsStellarAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStellarAmountConstraint,
    });
  };
}
