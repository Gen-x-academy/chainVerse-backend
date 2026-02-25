import { Module } from '@nestjs/common';
import { StudentAuthController } from './student-auth.controller';
import { StudentAuthService } from './student-auth.service';

@Module({
  controllers: [StudentAuthController],
  providers: [StudentAuthService],
  exports: [StudentAuthService],
})
export class StudentAuthModule {}
