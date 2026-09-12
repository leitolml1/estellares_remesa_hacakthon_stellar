/**
 * Vista simplificada de una operacion de pago (payment o path payment)
 * devuelta por Horizon. Es el DTO de lectura reusable: lo va a consumir
 * el Modulo 2 (pool comunitario, filtra por memo) y potencialmente el
 * Modulo 3, asi que solo incluye los campos que un consumidor generico
 * necesita, no la forma cruda de la respuesta de Horizon.
 */
export class PaymentRecordDto {
  id!: string;
  from!: string;
  to!: string;
  amount!: string;
  /** "native" para XLM, o el asset code (ej. "USDC") para otros assets. */
  assetCode!: string;
  assetIssuer?: string;
  /**
   * Memo de la transaccion padre. Requiere 1 request extra a Horizon
   * (record.transaction()) por record, ver getTransactionHistory.
   */
  memo?: string;
  createdAt!: string;
  transactionHash!: string;
}
