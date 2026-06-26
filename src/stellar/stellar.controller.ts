import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Validate } from 'class-validator';
import { IsStellarPublicKey } from '../common/validators/is-stellar-public-key.validator';
import { StellarService } from './stellar.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { CreateAccountResponseDto } from './dto/create-account-response.dto';

export class WalletPublicKeyDto {
  @Validate(IsStellarPublicKey)
  publicKey: string;
}

@ApiTags('Stellar')
@Controller('stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @ApiOperation({ summary: 'Verify a Stellar payment transaction' })
  @Post('verify-payment')
  async verifyPayment(@Body() body: VerifyPaymentDto) {
    return this.stellarService.verifyPayment(body);
  }

  @ApiOperation({
    summary: 'Get CHV token and XLM balance for a Stellar public key',
  })
  @Get('balance/:publicKey')
  async getBalance(@Param('publicKey') publicKey: string) {
    return this.stellarService.getBalance(publicKey);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create a funded Stellar testnet account (testnet only)',
    description:
      'Generates a new Ed25519 keypair, funds it via Friendbot on testnet, and returns the keys once. ' +
      'The server never stores the secret key — save it immediately. ' +
      'On mainnet, this endpoint returns guidance for creating an account with a wallet instead.',
  })
  @ApiResponse({
    status: 201,
    description: 'Testnet account created and funded via Friendbot',
    type: CreateAccountResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Not on testnet — returns mainnet wallet setup guidance',
  })
  @ApiResponse({
    status: 503,
    description: 'Friendbot funding failed',
  })
  @Post('create-account')
  @HttpCode(201)
  async createAccount() {
    return this.stellarService.createAccount();
  }
}
