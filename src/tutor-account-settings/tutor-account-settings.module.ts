import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TutorAccountSettings,
  TutorAccountSettingsSchema,
} from './schemas/tutor-account-settings.schema';
import { TutorAccountSettingsController } from './tutor-account-settings.controller';
import { TutorAccountSettingsService } from './tutor-account-settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: TutorAccountSettings.name,
        schema: TutorAccountSettingsSchema,
      },
    ]),
  ],
  controllers: [TutorAccountSettingsController],
  providers: [TutorAccountSettingsService],
  exports: [TutorAccountSettingsService],
})
export class TutorAccountSettingsModule {}
