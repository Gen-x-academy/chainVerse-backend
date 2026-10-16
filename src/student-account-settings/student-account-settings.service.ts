import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RequestActor,
  assertOwner,
  assertOwnerOrStaff,
  isStaff,
} from '../common/auth/resource-owner';
import { CreateStudentAccountSettingsDto } from './dto/create-student-account-settings.dto';
import { UpdateStudentAccountSettingsDto } from './dto/update-student-account-settings.dto';
import {
  StudentAccountSettings,
  StudentAccountSettingsDocument,
} from './schemas/student-account-settings.schema';

const RESOURCE = 'account settings';

@Injectable()
export class StudentAccountSettingsService {
  constructor(
    @InjectModel(StudentAccountSettings.name)
    private readonly settingsModel: Model<StudentAccountSettingsDocument>,
  ) {}

  /** Staff-only listing. Students reach their own row through {@link findMine}. */
  async findAll(): Promise<StudentAccountSettingsDocument[]> {
    return this.settingsModel.find().sort({ createdAt: -1 }).exec();
  }

  /**
   * Returns the caller's settings, creating the default row on first read so
   * clients never have to guess whether a record exists yet.
   */
  async findMine(actor: RequestActor): Promise<StudentAccountSettingsDocument> {
    const existing = await this.settingsModel
      .findOne({ studentId: actor.id })
      .exec();
    if (existing) {
      return existing;
    }

    return this.settingsModel.create({ studentId: actor.id });
  }

  async findOne(
    id: string,
    actor: RequestActor,
  ): Promise<StudentAccountSettingsDocument> {
    const settings = await this.settingsModel.findById(id).exec();
    if (!settings) {
      throw new NotFoundException(`Account settings ${id} not found`);
    }

    assertOwnerOrStaff(settings.studentId, actor, RESOURCE);
    return settings;
  }

  /** Creates (or updates) the caller's own settings row. */
  async create(
    payload: CreateStudentAccountSettingsDto,
    actor: RequestActor,
  ): Promise<StudentAccountSettingsDocument> {
    const existing = await this.settingsModel
      .findOne({ studentId: actor.id })
      .exec();
    if (existing) {
      return this.applyChanges(existing, payload);
    }

    return this.settingsModel.create({ ...payload, studentId: actor.id });
  }

  async updateMine(
    payload: UpdateStudentAccountSettingsDto,
    actor: RequestActor,
  ): Promise<StudentAccountSettingsDocument> {
    const settings = await this.findMine(actor);
    return this.applyChanges(settings, payload);
  }

  /**
   * Updating by id still resolves ownership from the JWT. Staff may read a row
   * but may not rewrite a student's preferences on their behalf.
   */
  async update(
    id: string,
    payload: UpdateStudentAccountSettingsDto,
    actor: RequestActor,
  ): Promise<StudentAccountSettingsDocument> {
    const settings = await this.settingsModel.findById(id).exec();
    if (!settings) {
      throw new NotFoundException(`Account settings ${id} not found`);
    }

    assertOwner(settings.studentId, actor, RESOURCE);
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

    // Staff keep delete rights for account-closure and moderation workflows.
    if (!isStaff(actor)) {
      assertOwner(settings.studentId, actor, RESOURCE);
    }

    await this.settingsModel.deleteOne({ _id: settings._id }).exec();
    return { id, deleted: true };
  }

  private async applyChanges(
    settings: StudentAccountSettingsDocument,
    payload: UpdateStudentAccountSettingsDto,
  ): Promise<StudentAccountSettingsDocument> {
    if (payload.displayName !== undefined) {
      settings.displayName = payload.displayName ?? null;
    }
    if (payload.language !== undefined) settings.language = payload.language;
    if (payload.timezone !== undefined) settings.timezone = payload.timezone;
    if (payload.emailNotifications !== undefined) {
      settings.emailNotifications = payload.emailNotifications;
    }
    if (payload.marketingEmails !== undefined) {
      settings.marketingEmails = payload.marketingEmails;
    }
    if (payload.profileVisibility !== undefined) {
      settings.profileVisibility = payload.profileVisibility;
    }

    return settings.save();
  }
}
