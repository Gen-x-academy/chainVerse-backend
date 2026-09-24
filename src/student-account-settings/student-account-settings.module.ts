import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StudentAccountSettings,
  StudentAccountSettingsSchema,
} from './schemas/student-account-settings.schema';
import { StudentAccountSettingsController } from './student-account-settings.controller';
import { StudentAccountSettingsService } from './student-account-settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: StudentAccountSettings.name,
        schema: StudentAccountSettingsSchema,
      },
    ]),
  ],
  controllers: [StudentAccountSettingsController],
  providers: [StudentAccountSettingsService],
  exports: [StudentAccountSettingsService],
})
export class StudentAccountSettingsModule {}
