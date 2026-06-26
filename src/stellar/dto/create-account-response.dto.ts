import { ApiProperty } from '@nestjs/swagger';

export class CreateAccountResponseDto {
  @ApiProperty({
    description: 'Stellar public key (G...) for the newly created testnet account',
    example: 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV4UHEIPZXB',
  })
  publicKey: string;

  @ApiProperty({
    description:
      'Secret key (S...) returned exactly once. Save it immediately — the server does not store it and cannot recover it.',
    example: 'SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  secretKey: string;

  @ApiProperty({
    description: 'Whether Friendbot successfully funded the account on testnet',
  })
  funded: boolean;

  @ApiProperty({ description: 'Configured Stellar network', example: 'testnet' })
  network: string;

  @ApiProperty({
    description:
      'Security notice: you are solely responsible for storing and protecting your secret key.',
  })
  message: string;
}

export class MainnetAccountGuideDto {
  @ApiProperty({
    description: 'Why automatic account creation is unavailable on mainnet',
  })
  message: string;

  @ApiProperty({
    description: 'Steps to create and fund a Stellar mainnet account manually',
    type: [String],
  })
  steps: string[];
}
