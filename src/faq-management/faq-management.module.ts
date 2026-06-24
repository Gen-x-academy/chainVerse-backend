import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FaqManagementController } from './faq-management.controller';
import { FaqManagementService } from './faq-management.service';
import {
  FaqManagement,
  FaqManagementSchema,
} from './schemas/faq-management.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FaqManagement.name, schema: FaqManagementSchema },
    ]),
  ],
  controllers: [FaqManagementController],
  providers: [FaqManagementService],
})
export class FaqManagementModule {}
