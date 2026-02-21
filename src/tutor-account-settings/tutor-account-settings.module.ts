import { Module } from '@nestjs/common';
import { TutorAccountSettingsController } from './tutor-account-settings.controller';
import { TutorAccountSettingsService } from './tutor-account-settings.service';

@Module({
  controllers: [TutorAccountSettingsController],
  providers: [TutorAccountSettingsService],
})
export class TutorAccountSettingsModule {}
