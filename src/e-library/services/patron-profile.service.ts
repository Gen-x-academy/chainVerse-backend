import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PatronProfile, PatronProfileDocument, PatronStatus, PatronRole } from '../schemas/patron-profile.schema';
import { CreatePatronProfileDto, UpdatePatronStatusDto } from '../dto/patron.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';

@Injectable()
export class PatronProfileService {
  constructor(
    @InjectModel(PatronProfile.name)
    private readonly patronModel: Model<PatronProfileDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async createProfile(dto: CreatePatronProfileDto): Promise<PatronProfile> {
    const existing = await this.patronModel.findOne({ platformUserId: dto.platformUserId });
    if (existing) {
      throw new ConflictException('Patron profile already exists for this user');
    }

    const normalizedRole = this.normalizeRole(dto.role);
    const profile = await new this.patronModel({
      platformUserId: dto.platformUserId,
      role: normalizedRole,
      displayName: dto.displayName,
      email: dto.email,
      status: PatronStatus.ACTIVE,
      statusChangedAt: new Date(),
    }).save();

    return profile;
  }

  async getProfile(platformUserId: string): Promise<PatronProfileDocument> {
    const profile = await this.patronModel.findOne({ platformUserId }).exec();
    if (!profile) {
      throw new NotFoundException('Patron profile not found');
    }
    return profile;
  }

  async updateStatus(platformUserId: string, dto: UpdatePatronStatusDto, changedBy: string): Promise<PatronProfile> {
    const profile = await this.getProfile(platformUserId);

    if (profile.status === dto.status) {
      throw new ConflictException(`Patron is already ${dto.status}`);
    }

    const updated = await this.patronModel.findOneAndUpdate(
      { platformUserId },
      {
        $set: {
          status: dto.status,
          statusChangedAt: new Date(),
          statusChangedBy: changedBy,
          statusReason: dto.reason,
          appealNote: dto.appealNote ?? profile.appealNote,
          statusExpiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      },
      { new: true },
    );

    return updated as PatronProfile;
  }

  async isCheckoutAllowed(platformUserId: string): Promise<{ allowed: boolean; reason?: string }> {
    const profile = await this.getProfile(platformUserId);

    if (profile.status === PatronStatus.BLOCKED) {
      return { allowed: false, reason: 'Account is blocked' };
    }

    if (profile.status === PatronStatus.SUSPENDED) {
      if (profile.statusExpiresAt && profile.statusExpiresAt > new Date()) {
        return { allowed: false, reason: `Account is suspended until ${profile.statusExpiresAt.toISOString()}` };
      }
      // Suspension expired — auto-reactivate
      await this.patronModel.findOneAndUpdate(
        { platformUserId },
        { $set: { status: PatronStatus.ACTIVE, statusExpiresAt: null } },
      );
    }

    if (profile.status === PatronStatus.EXPIRED) {
      return { allowed: false, reason: 'Account has expired' };
    }

    return { allowed: true };
  }

  async listPatrons(paginationDto: PaginationDto, filter: Record<string, unknown> = {}) {
    return this.paginationService.paginate(this.patronModel, paginationDto, filter);
  }

  private normalizeRole(role: string): PatronRole {
    const lower = role.toLowerCase();
    if (lower === 'tutor') return PatronRole.TUTOR;
    return PatronRole.STUDENT;
  }
}
