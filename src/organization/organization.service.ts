import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  async create(payload: CreateOrganizationDto): Promise<Organization> {
    const organization = new this.organizationModel(payload);
    return organization.save();
  }

  async findAll(): Promise<Organization[]> {
    return this.organizationModel.find().exec();
  }

  async findOne(id: string): Promise<OrganizationDocument> {
    const org = await this.organizationModel.findById(id).exec();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(
    id: string,
    payload: UpdateOrganizationDto,
  ): Promise<Organization> {
    const org = await this.organizationModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.organizationModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Organization not found');
    }
    return { id, deleted: true };
  }
}
