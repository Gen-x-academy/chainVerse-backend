import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipEscrowController } from './mentorship-escrow.controller';
import { MentorshipEscrowService } from './mentorship-escrow.service';
import {
  EscrowFunding,
  EscrowFundingSchema,
} from './schemas/escrow-funding.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EscrowFunding.name, schema: EscrowFundingSchema },
    ]),
  ],
  controllers: [MentorshipEscrowController],
  providers: [MentorshipEscrowService],
  exports: [MentorshipEscrowService],
})
export class MentorshipEscrowModule {}
