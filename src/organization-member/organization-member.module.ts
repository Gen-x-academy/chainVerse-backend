import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationMemberController } from './organization-member.controller';
import { OrganizationMemberService } from './organization-member.service';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from './schemas/organization-member.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [OrganizationMemberController],
  providers: [OrganizationMemberService],
  exports: [OrganizationMemberService],
})
export class OrganizationMemberModule {}
