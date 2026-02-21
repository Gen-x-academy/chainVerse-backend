import { Module } from '@nestjs/common';
import { TutorJwtAuthController } from './tutor-jwt-auth.controller';
import { TutorJwtAuthService } from './tutor-jwt-auth.service';

@Module({
  controllers: [TutorJwtAuthController],
  providers: [TutorJwtAuthService],
})
export class TutorJwtAuthModule {}
