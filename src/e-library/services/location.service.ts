import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LibraryLocation, LibraryLocationDocument, LocationType } from '../schemas/library-location.schema';
import { CreateLocationDto, UpdateLocationDto } from '../dto/location.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(LibraryLocation.name)
    private readonly locationModel: Model<LibraryLocationDocument>,
  ) {}

  async createLocation(dto: CreateLocationDto): Promise<LibraryLocation> {
    if (dto.parentId) {
      const parent = await this.locationModel.findById(dto.parentId).exec();
      if (!parent) {
        throw new ResourceNotFoundException('Parent location not found', ErrorCode.RES_NOT_FOUND);
      }
      if (parent.type === LocationType.SHELF) {
        throw new ResourceConflictException(
          'Shelf locations cannot have children',
          ErrorCode.BIZ_DUPLICATE_REQUEST,
        );
      }
    }

    const location = await new this.locationModel({
      type: dto.type,
      name: dto.name,
      parentId: dto.parentId,
      description: dto.description,
      sortOrder: dto.sortOrder ? parseInt(dto.sortOrder, 10) : 0,
      isActive: true,
    }).save();

    return location;
  }

  async updateLocation(locationId: string, dto: UpdateLocationDto): Promise<LibraryLocation> {
    const location = await this.locationModel.findById(locationId).exec();
    if (!location) {
      throw new ResourceNotFoundException('Location not found', ErrorCode.RES_NOT_FOUND);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.sortOrder !== undefined) updateData.sortOrder = parseInt(dto.sortOrder, 10);

    const updated = await this.locationModel.findByIdAndUpdate(
      locationId,
      { $set: updateData },
      { new: true },
    ).exec();

    return updated as LibraryLocation;
  }

  async getLocation(locationId: string): Promise<LibraryLocationDocument> {
    const location = await this.locationModel.findById(locationId).exec();
    if (!location) {
      throw new ResourceNotFoundException('Location not found', ErrorCode.RES_NOT_FOUND);
    }
    return location;
  }

  async listLocations(type?: LocationType): Promise<LibraryLocation[]> {
    const filter = type ? { type } : {};
    return this.locationModel.find(filter).sort({ sortOrder: 1, name: 1 }).exec();
  }

  async getChildren(parentId: string): Promise<LibraryLocation[]> {
    return this.locationModel.find({ parentId }).sort({ sortOrder: 1, name: 1 }).exec();
  }

  async deactivateLocation(locationId: string): Promise<LibraryLocation> {
    const location = await this.locationModel.findById(locationId).exec();
    if (!location) {
      throw new ResourceNotFoundException('Location not found', ErrorCode.RES_NOT_FOUND);
    }

    const children = await this.locationModel.countDocuments({ parentId: locationId });
    if (children > 0) {
      throw new ResourceConflictException(
        'Cannot deactivate a location with active children',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    const updated = await this.locationModel.findByIdAndUpdate(
      locationId,
      { $set: { isActive: false } },
      { new: true },
    ).exec();

    return updated as LibraryLocation;
  }
}
