import { Module } from '@nestjs/common';
import { TermsConditionsManagementController } from './terms-conditions-management.controller';
import { TermsConditionsManagementService } from './terms-conditions-management.service';

@Module({
  controllers: [TermsConditionsManagementController],
  providers: [TermsConditionsManagementService],
})
export class TermsConditionsManagementModule {}
