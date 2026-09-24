import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      // Registered here too: the org service seeds the owner membership and
      // OrganizationRolesGuard resolves memberships from this model.
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRolesGuard],
  exports: [OrganizationService],
})
export class OrganizationModule {}
