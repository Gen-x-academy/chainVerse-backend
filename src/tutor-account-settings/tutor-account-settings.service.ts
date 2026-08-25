import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RequestActor,
  assertOwner,
  assertOwnerOrStaff,
  isStaff,
} from '../common/auth/resource-owner';
import { CreateTutorAccountSettingsDto } from './dto/create-tutor-account-settings.dto';
import { UpdateTutorAccountSettingsDto } from './dto/update-tutor-account-settings.dto';
import {
  TutorAccountSettings,
  TutorAccountSettingsDocument,
} from './schemas/tutor-account-settings.schema';

const RESOURCE = 'account settings';

@Injectable()
export class TutorAccountSettingsService {
  constructor(
    @InjectModel(TutorAccountSettings.name)
    private readonly settingsModel: Model<TutorAccountSettingsDocument>,
  ) {}

  async findAll(): Promise<TutorAccountSettingsDocument[]> {
    return this.settingsModel.find().sort({ createdAt: -1 }).exec();
  }

  async findMine(actor: RequestActor): Promise<TutorAccountSettingsDocument> {
    const existing = await this.settingsModel
      .findOne({ tutorId: actor.id })
      .exec();
    if (existing) {
      return existing;
    }
    return this.settingsModel.create({ tutorId: actor.id });
  }

  async findOne(
    id: string,
    actor: RequestActor,
  ): Promise<TutorAccountSettingsDocument> {
    const settings = await this.settingsModel.findById(id).exec();
    if (!settings) {
      throw new NotFoundException(`Account settings ${id} not found`);
    }
    assertOwnerOrStaff(settings.tutorId, actor, RESOURCE);
    return settings;
  }

  async create(
    payload: CreateTutorAccountSettingsDto,
    actor: RequestActor,
  ): Promise<TutorAccountSettingsDocument> {
    const existing = await this.settingsModel
      .findOne({ tutorId: actor.id })
      .exec();
    if (existing) {
      return this.applyChanges(existing, payload);
    }
    return this.settingsModel.create({ ...payload, tutorId: actor.id });
  }

  async updateMine(
    payload: UpdateTutorAccountSettingsDto,
    actor: RequestActor,
  ): Promise<TutorAccountSettingsDocument> {
    const settings = await this.findMine(actor);
    return this.applyChanges(settings, payload);
  }

  async update(
    id: string,
    payload: UpdateTutorAccountSettingsDto,
    actor: RequestActor,
  ): Promise<TutorAccountSettingsDocument> {
    const settings = await this.settingsModel.findById(id).exec();
    if (!settings) {
      throw new NotFoundException(`Account settings ${id} not found`);
    }
    assertOwner(settings.tutorId, actor, RESOURCE);
    return this.applyChanges(settings, payload);
  }

  async remove(
    id: string,
    actor: RequestActor,
  ): Promise<{ id: string; deleted: true }> {
    const settings = await this.settingsModel.findById(id).exec();
    if (!settings) {
      throw new NotFoundException(`Account settings ${id} not found`);
    }
    if (!isStaff(actor)) {
      assertOwner(settings.tutorId, actor, RESOURCE);
    }
    await this.settingsModel.deleteOne({ _id: settings._id }).exec();
    return { id, deleted: true };
  }

  private async applyChanges(
    settings: TutorAccountSettingsDocument,
    payload: UpdateTutorAccountSettingsDto,
  ): Promise<TutorAccountSettingsDocument> {
    if (payload.displayName !== undefined) {
      settings.displayName = payload.displayName ?? null;
    }
    if (payload.language !== undefined) settings.language = payload.language;
    if (payload.timezone !== undefined) settings.timezone = payload.timezone;
    if (payload.emailNotifications !== undefined) {
      settings.emailNotifications = payload.emailNotifications;
    }
    if (payload.newCourseEnrollmentNotifications !== undefined) {
      settings.newCourseEnrollmentNotifications =
        payload.newCourseEnrollmentNotifications;
    }
    if (payload.studentMessageNotifications !== undefined) {
      settings.studentMessageNotifications =
        payload.studentMessageNotifications;
    }
    if (payload.reviewNotifications !== undefined) {
      settings.reviewNotifications = payload.reviewNotifications;
    }
    if (payload.availabilityStatus !== undefined) {
      settings.availabilityStatus = payload.availabilityStatus;
    }
    if (payload.profileVisibility !== undefined) {
      settings.profileVisibility = payload.profileVisibility;
    }
    return settings.save();
  }
}
