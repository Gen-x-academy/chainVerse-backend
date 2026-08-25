import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BorrowerLibraryPreference,
  BorrowerLibraryPreferenceSchema,
} from './schemas/borrower-library-preference.schema';
import { BorrowerPreferencesService } from './borrower-preferences.service';
import { BorrowerPreferencesController } from './borrower-preferences.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: BorrowerLibraryPreference.name,
        schema: BorrowerLibraryPreferenceSchema,
      },
    ]),
  ],
  controllers: [BorrowerPreferencesController],
  providers: [BorrowerPreferencesService],
  exports: [BorrowerPreferencesService],
})
export class BorrowerPreferencesModule {}