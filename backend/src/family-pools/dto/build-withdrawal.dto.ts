import { IsStellarPublicKey } from '../../stellar/validators/is-stellar-public-key.validator';
import { IsStellarAmount } from '../../stellar/validators/is-stellar-amount.validator';

export class BuildWithdrawalDto {
  @IsStellarPublicKey()
  destinationPublicKey!: string;

  @IsStellarAmount()
  amount!: string;
}
