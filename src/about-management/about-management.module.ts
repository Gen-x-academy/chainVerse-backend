import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AboutManagementController } from './about-management.controller';
import { AboutManagementService } from './about-management.service';
import {
  AboutContentRevision,
  AboutContentRevisionSchema,
} from './schemas/about-content-revision.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AboutContentRevision.name,
        schema: AboutContentRevisionSchema,
      },
    ]),
  ],
  controllers: [AboutManagementController],
  providers: [AboutManagementService],
})
export class AboutManagementModule {}
