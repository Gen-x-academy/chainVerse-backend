import { Module } from '@nestjs/common';
import { FaqManagementController } from './faq-management.controller';
import { FaqManagementService } from './faq-management.service';

@Module({
  controllers: [FaqManagementController],
  providers: [FaqManagementService],
})
export class FaqManagementModule {}
