import { Module } from '@nestjs/common';
import { StudentAccountSettingsController } from './student-account-settings.controller';
import { StudentAccountSettingsService } from './student-account-settings.service';

@Module({
  controllers: [StudentAccountSettingsController],
  providers: [StudentAccountSettingsService],
})
export class StudentAccountSettingsModule {}
