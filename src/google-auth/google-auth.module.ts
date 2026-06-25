import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { GoogleUser, GoogleUserSchema } from './schemas/google-user.schema';
import { StudentAuthModule } from '../student-auth/student-auth.module';
import { GoogleStrategy } from './google.strategy';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoogleUser.name, schema: GoogleUserSchema },
    ]),
    StudentAuthModule,
  ],
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService, GoogleStrategy],
  exports: [GoogleAuthService],
})
export class GoogleAuthModule {}
