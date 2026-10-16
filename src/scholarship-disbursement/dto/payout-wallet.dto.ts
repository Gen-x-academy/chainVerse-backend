import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Validate } from 'class-validator';
import { IsStellarPublicKey } from '../../common/validators/is-stellar-public-key.validator';

export class CreateWalletChallengeDto {
  @ApiProperty({ description: 'Stellar account (G...) to receive payouts' })
  @IsString()
  @Validate(IsStellarPublicKey)
  address!: string;
}

export class VerifyWalletChallengeDto {
  @ApiProperty({
    description:
      'SEP-53 signature of the challenge message (base64 or hex), e.g. from Freighter signMessage',
  })
  @IsString()
  @Matches(/^(?:[0-9a-fA-F]{128}|[A-Za-z0-9+/]{86}==)$/, {
    message: 'signature must be a 64-byte ed25519 signature in base64 or hex',
  })
  signature!: string;
}
