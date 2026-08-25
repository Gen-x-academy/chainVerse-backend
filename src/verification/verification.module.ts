import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import {
  VerificationLogModel,
  VerificationLogSchema,
} from './schemas/verification-log.schema';

/**
 * Verification Module
 *
 * Provides an append-only audit trail of ticket scan attempts backed
 * by MongoDB/Mongoose. The module is self-contained — it has no
 * dependency on a tickets-inventory or events module.
 *
 * The VerificationService is exported so other modules (e.g. an
 * admission or check-in module) can record scan outcomes.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VerificationLogModel.name, schema: VerificationLogSchema },
    ]),
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
