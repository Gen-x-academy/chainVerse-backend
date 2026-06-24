import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TutorJwtAuthController } from './tutor-jwt-auth.controller';
import { TutorJwtAuthService } from './tutor-jwt-auth.service';
import {
  TutorJwtAuth,
  TutorJwtAuthSchema,
} from './schemas/tutor-jwt-auth.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TutorJwtAuth.name, schema: TutorJwtAuthSchema },
    ]),
  ],
  controllers: [TutorJwtAuthController],
  providers: [TutorJwtAuthService],
})
export class TutorJwtAuthModule {}
