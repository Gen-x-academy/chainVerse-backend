import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationMemberController } from './organization-member.controller';
import { OrganizationMemberService } from './organization-member.service';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from './schemas/organization-member.schema';
import { OrganizationInvitationController } from './organization-invitation.controller';
import { OrganizationInvitationService } from './organization-invitation.service';
import {
  OrganizationInvitation,
  OrganizationInvitationSchema,
} from './schemas/organization-invitation.schema';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { PaginationModule } from '../common/pagination/pagination.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      {
        name: OrganizationInvitation.name,
        schema: OrganizationInvitationSchema,
      },
    ]),
    PaginationModule,
  ],
  controllers: [OrganizationMemberController, OrganizationInvitationController],
  providers: [
    OrganizationMemberService,
    OrganizationInvitationService,
    OrganizationRolesGuard,
  ],
  exports: [OrganizationMemberService, OrganizationInvitationService],
})
export class OrganizationMemberModule {}
