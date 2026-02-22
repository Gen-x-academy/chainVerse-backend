import { Module } from '@nestjs/common';
import { PrivacyPolicyManagementController } from './privacy-policy-management.controller';
import { PrivacyPolicyManagementService } from './privacy-policy-management.service';

@Module({
  controllers: [PrivacyPolicyManagementController],
  providers: [PrivacyPolicyManagementService],
})
export class PrivacyPolicyManagementModule {}
