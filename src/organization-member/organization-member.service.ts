import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrganizationMemberDto } from './dto/create-organization-member.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-member.dto';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from './schemas/organization-member.schema';

@Injectable()
export class OrganizationMemberService {
  constructor(
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
  ) {}

  async addMember(
    payload: CreateOrganizationMemberDto,
  ): Promise<OrganizationMember> {
    const existing = await this.memberModel
      .findOne({
        organizationId: payload.organizationId,
        userId: payload.userId,
      })
      .exec();
    if (existing) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    const member = new this.memberModel(payload);
    return member.save();
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationMember[]> {
    return this.memberModel.find({ organizationId }).exec();
  }

  async findByUser(userId: string): Promise<OrganizationMember[]> {
    return this.memberModel.find({ userId }).exec();
  }

  async findOne(id: string): Promise<OrganizationMemberDocument> {
    const member = await this.memberModel.findById(id).exec();
    if (!member) {
      throw new NotFoundException('Organization member not found');
    }
    return member;
  }

  async updateRole(
    id: string,
    payload: UpdateOrganizationMemberDto,
  ): Promise<OrganizationMember> {
    const member = await this.memberModel
      .findByIdAndUpdate(id, { role: payload.role }, { new: true })
      .exec();
    if (!member) {
      throw new NotFoundException('Organization member not found');
    }
    return member;
  }

  async removeMember(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.memberModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Organization member not found');
    }
    return { id, deleted: true };
  }
}
