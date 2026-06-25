import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StellarService } from './stellar.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@ApiTags('Stellar')
@Controller('api/v1/stellar')
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

  @ApiOperation({
    summary:
      'Create a new testnet Stellar account (keypair generated and funded via Friendbot)',
  })
  @Post('create-account')
  async createAccount() {
    return this.stellarService.createAccount();
  }
}
