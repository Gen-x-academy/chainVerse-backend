import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateOrganizationMemberDto } from './dto/create-organization-member.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-member.dto';

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrganizationMemberService {
  private readonly members: OrganizationMember[] = [];

  addMember(payload: CreateOrganizationMemberDto): OrganizationMember {
    const existing = this.members.find(
      (m) =>
        m.organizationId === payload.organizationId &&
        m.userId === payload.userId,
    );
    if (existing) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    const member: OrganizationMember = {
      id: crypto.randomUUID(),
      organizationId: payload.organizationId,
      userId: payload.userId,
      role: payload.role,
      joinedAt: new Date(),
      updatedAt: new Date(),
    };
    this.members.push(member);
    return member;
  }

  findByOrganization(organizationId: string): OrganizationMember[] {
    return this.members.filter((m) => m.organizationId === organizationId);
  }

  findByUser(userId: string): OrganizationMember[] {
    return this.members.filter((m) => m.userId === userId);
  }

  findOne(id: string): OrganizationMember {
    const member = this.members.find((m) => m.id === id);
    if (!member) {
      throw new NotFoundException('Organization member not found');
    }
    return member;
  }

  updateRole(
    id: string,
    payload: UpdateOrganizationMemberDto,
  ): OrganizationMember {
    const member = this.findOne(id);
    if (payload.role !== undefined) member.role = payload.role;
    member.updatedAt = new Date();
    return member;
  }

  removeMember(id: string): { id: string; deleted: boolean } {
    const index = this.members.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new NotFoundException('Organization member not found');
    }
    this.members.splice(index, 1);
    return { id, deleted: true };
  }
}
