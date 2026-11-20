import { Module } from '@nestjs/common';
import { ProjectFundingAuditService } from './project-funding-audit.service';
import { ProjectFundingController } from './project-funding.controller';
import { ProjectFundingRepository } from './project-funding.repository';
import { ProjectFundingRolesGuard } from './project-funding-roles.guard';
import { ProjectFundingService } from './project-funding.service';

@Module({
  controllers: [ProjectFundingController],
  providers: [
    ProjectFundingService,
    ProjectFundingRepository,
    ProjectFundingAuditService,
    ProjectFundingRolesGuard,
  ],
  exports: [ProjectFundingService],
})
export class ProjectFundingModule {}
