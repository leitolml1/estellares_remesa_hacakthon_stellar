import { IsStellarAmount } from '../../stellar/validators/is-stellar-amount.validator';

export class BuildSupplyToBlendDto {
  @IsStellarAmount()
  amount!: string;
}
