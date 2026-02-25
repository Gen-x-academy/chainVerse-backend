import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

export interface Organization {
  id: string;
  name: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrganizationService {
  private readonly organizations: Organization[] = [];

  create(payload: CreateOrganizationDto): Organization {
    const organization: Organization = {
      id: crypto.randomUUID(),
      name: payload.name,
      description: payload.description,
      website: payload.website,
      logoUrl: payload.logoUrl,
      metadata: payload.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.organizations.push(organization);
    return organization;
  }

  findAll(): Organization[] {
    return this.organizations;
  }

  findOne(id: string): Organization {
    const org = this.organizations.find((o) => o.id === id);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  update(id: string, payload: UpdateOrganizationDto): Organization {
    const org = this.findOne(id);
    Object.assign(org, { ...payload, updatedAt: new Date() });
    return org;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.organizations.findIndex((o) => o.id === id);
    if (index === -1) {
      throw new NotFoundException('Organization not found');
    }
    this.organizations.splice(index, 1);
    return { id, deleted: true };
  }
}
