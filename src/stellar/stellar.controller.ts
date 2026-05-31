import { Body, Controller, Post } from '@nestjs/common';
import { StellarService } from './stellar.service';

interface VerifyPaymentDto {
  transactionHash: string;
  expectedAmount: string;
  courseId: string;
}

@Controller('api/v1/stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @Post('verify-payment')
  async verifyPayment(@Body() body: VerifyPaymentDto) {
    return this.stellarService.verifyPayment(body);
  }
}
