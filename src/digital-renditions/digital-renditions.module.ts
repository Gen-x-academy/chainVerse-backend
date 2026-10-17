import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DigitalRenditionsController } from './digital-renditions.controller';
import { DigitalRenditionsService } from './digital-renditions.service';
import { DigitalRenditionStorageService } from './digital-renditions.storage';
import { RenditionAccessToken } from './entities/rendition-access-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RenditionAccessToken])],
  controllers: [DigitalRenditionsController],
  providers: [
    DigitalRenditionsService,
    DigitalRenditionStorageService,
    /*
     * TODO: Register the project's concrete LoanRepository and
     * RenditionRepository adapter providers here so that
     * DigitalRenditionsService can inject them.
     */
  ],
  exports: [DigitalRenditionsService],
})
export class DigitalRenditionsModule {}
