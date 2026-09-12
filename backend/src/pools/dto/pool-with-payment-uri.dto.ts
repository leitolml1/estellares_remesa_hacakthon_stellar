import { Pool } from '../pool.entity';

/**
 * Se devuelve el pool + el URI SEP-7 ya armado en un solo response, para
 * que el frontend no tenga que llamar 2 endpoints para mostrar el QR.
 */
export interface PoolWithPaymentUriDto {
  pool: Pool;
  paymentUri: string;
}
