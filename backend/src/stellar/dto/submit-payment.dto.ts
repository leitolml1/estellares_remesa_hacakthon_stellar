import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitPaymentDto {
  /**
   * XDR de la transaccion ya firmada del lado del cliente. Este DTO/servicio
   * es agnostico a que wallet produjo la firma (Freighter u otra
   * compatible con Stellar): nunca ve ni maneja la private key, solo
   * recibe el resultado ya firmado para reenviarlo a Horizon.
   */
  @IsString()
  @IsNotEmpty()
  signedXdr!: string;
}
