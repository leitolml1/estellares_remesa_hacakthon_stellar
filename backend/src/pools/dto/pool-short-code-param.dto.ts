import { IsNotEmpty, IsString } from 'class-validator';

/** DTO minimo para validar el :shortCode de la ruta GET /pools/:shortCode. */
export class PoolShortCodeParamDto {
  @IsString()
  @IsNotEmpty()
  shortCode!: string;
}
