import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationMemberController } from './organization-member.controller';
import { OrganizationMemberService } from './organization-member.service';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from './schemas/organization-member.schema';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [OrganizationMemberController],
  providers: [OrganizationMemberService, OrganizationRolesGuard],
  exports: [OrganizationMemberService],
})
export class OrganizationMemberModule {}
