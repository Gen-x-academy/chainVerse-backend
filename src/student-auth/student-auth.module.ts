import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentAuthController } from './student-auth.controller';
import { StudentAuthService } from './student-auth.service';
import { Student, StudentSchema } from './schemas/student.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from './schemas/password-reset-token.schema';
import { EmailModule } from '../email/email.module';
import { SessionModule } from '../session/session.module';
import { SessionService } from '../session/session.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
    EmailModule,
    SessionModule,
  ],
  controllers: [StudentAuthController],
  providers: [StudentAuthService, SessionService],
  exports: [StudentAuthService],
})
export class StudentAuthModule {}