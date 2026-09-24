import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationForm,
  ApplicationFormSchema,
} from './schemas/application-form.schema';
import { ApplicationFormService } from './services/application-form.service';
import { ApplicationFormController } from './controllers/application-form.controller';

/**
 * ScholarshipsModule bundles all scholarship-related features.
 *
 * Currently provides:
 *  - Configurable application forms (issue #1131)
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApplicationForm.name, schema: ApplicationFormSchema },
    ]),
  ],
  controllers: [ApplicationFormController],
  providers: [ApplicationFormService],
  exports: [ApplicationFormService],
})
export class ScholarshipsModule {}
