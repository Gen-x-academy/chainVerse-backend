import { Module } from '@nestjs/common';
import { OrganizationMemberController } from './organization-member.controller';
import { OrganizationMemberService } from './organization-member.service';

@Module({
  controllers: [OrganizationMemberController],
  providers: [OrganizationMemberService],
  exports: [OrganizationMemberService],
})
export class OrganizationMemberModule {}
