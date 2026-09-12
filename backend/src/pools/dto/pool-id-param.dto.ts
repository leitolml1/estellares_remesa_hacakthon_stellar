import { IsUUID } from 'class-validator';

/** DTO minimo para validar el :id de la ruta GET /pools/:id/donations. */
export class PoolIdParamDto {
  @IsUUID()
  id!: string;
}
