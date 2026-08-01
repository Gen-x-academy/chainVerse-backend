import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationMemberController } from './organization-member.controller';
import { OrganizationMemberService } from './organization-member.service';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from './schemas/organization-member.schema';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { PaginationModule } from '../common/pagination/pagination.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
    PaginationModule,
  ],
  controllers: [OrganizationMemberController],
  providers: [OrganizationMemberService, OrganizationRolesGuard],
  exports: [OrganizationMemberService],
})
export class OrganizationMemberModule {}
