import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipApplicationsController } from './mentorship-applications.controller';
import { MentorshipApplicationFormsController } from './mentorship-application-forms.controller';
import { MentorshipApplicationsService } from './mentorship-applications.service';
import { MentorshipApplicationFormsService } from './mentorship-application-forms.service';
import { MentorshipApplicationsTelemetry } from './mentorship-applications.telemetry';
import {
  MentorshipApplication,
  MentorshipApplicationSchema,
} from './schemas/mentorship-application.schema';
import {
  MentorshipApplicationForm,
  MentorshipApplicationFormSchema,
} from './schemas/mentorship-application-form.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipApplication.name, schema: MentorshipApplicationSchema },
      {
        name: MentorshipApplicationForm.name,
        schema: MentorshipApplicationFormSchema,
      },
    ]),
  ],
  controllers: [
    MentorshipApplicationsController,
    MentorshipApplicationFormsController,
  ],
  providers: [
    MentorshipApplicationsService,
    MentorshipApplicationFormsService,
    MentorshipApplicationsTelemetry,
  ],
  exports: [MentorshipApplicationsService],
})
export class MentorshipApplicationsModule {}
