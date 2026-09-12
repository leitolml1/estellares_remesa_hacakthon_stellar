import { IsOptional, IsString } from 'class-validator';

export class PoolDonationsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}
