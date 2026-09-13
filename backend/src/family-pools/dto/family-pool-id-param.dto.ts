import { IsUUID } from 'class-validator';

/** DTO minimo para validar el :id de ruta en los endpoints de family-pools. */
export class FamilyPoolIdParamDto {
  @IsUUID()
  id!: string;
}
