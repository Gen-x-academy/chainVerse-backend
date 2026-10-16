import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';

@ValidatorConstraint({ name: 'IsStellarPublicKey', async: false })
export class IsStellarPublicKey implements ValidatorConstraintInterface {
  validate(key: string): boolean {
    return StrKey.isValidEd25519PublicKey(key);
  }

  defaultMessage(): string {
    return 'Invalid Stellar public key';
  }
}
