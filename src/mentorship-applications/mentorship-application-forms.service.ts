import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ErrorCode,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors';
import {
  MentorshipApplicationForm,
  MentorshipApplicationFormDocument,
} from './schemas/mentorship-application-form.schema';
import { PublishFormDto } from './dto/publish-form.dto';
import { MentorshipApplicationsTelemetry } from './mentorship-applications.telemetry';

export type FormRecord = MentorshipApplicationForm & { _id: unknown };

@Injectable()
export class MentorshipApplicationFormsService {
  constructor(
    @InjectModel(MentorshipApplicationForm.name)
    private readonly formModel: Model<MentorshipApplicationFormDocument>,
    private readonly telemetry: MentorshipApplicationsTelemetry,
  ) {}

  /** The accepted form version for a program, or null if it is not open. */
  findCurrent(programId: string): Promise<FormRecord | null> {
    return this.formModel
      .findOne({ programId, isCurrent: true })
      .lean<FormRecord>()
      .exec();
  }

  async getCurrentOrThrow(programId: string): Promise<FormRecord> {
    const form = await this.findCurrent(programId);
    if (!form) {
      throw new ResourceNotFoundException(
        'This mentorship program is not accepting applications',
        ErrorCode.RES_MENTORSHIP_FORM_NOT_FOUND,
      );
    }
    return form;
  }

  findVersion(programId: string, version: number): Promise<FormRecord | null> {
    return this.formModel
      .findOne({ programId, version })
      .lean<FormRecord>()
      .exec();
  }

  /**
   * Publishes a new form version and makes it the accepted one. Drafts on
   * older versions must be rebased before they can be submitted.
   */
  async publish(
    programId: string,
    dto: PublishFormDto,
    publishedBy: string,
  ): Promise<FormRecord> {
    const keys = dto.questions.map((q) => q.key);
    const duplicate = keys.find((k, i) => keys.indexOf(k) !== i);
    if (duplicate) {
      throw new ValidationDomainException(
        `Duplicate question key "${duplicate}"`,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const latest = await this.formModel
      .findOne({ programId })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean<{ version: number }>()
      .exec();
    const version = (latest?.version ?? 0) + 1;

    let created: MentorshipApplicationFormDocument;
    try {
      created = await this.formModel.create({
        programId,
        version,
        questions: dto.questions.map((q) => ({
          key: q.key,
          label: q.label,
          required: q.required ?? false,
          maxLength: q.maxLength ?? 2000,
        })),
        consentVersion: dto.consentVersion,
        isCurrent: false,
        publishedBy,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ResourceConflictException(
          'Another form version was published concurrently; retry',
          ErrorCode.BIZ_DUPLICATE_REQUEST,
        );
      }
      throw err;
    }

    // Swap the current pointer. The partial unique index guarantees at most
    // one current version even if two publishes race.
    await this.formModel
      .updateMany(
        { programId, isCurrent: true, _id: { $ne: created._id } },
        { $set: { isCurrent: false } },
      )
      .exec();
    await this.formModel
      .updateOne({ _id: created._id }, { $set: { isCurrent: true } })
      .exec();

    this.telemetry.formPublished(programId, version);
    return { ...(created.toObject() as FormRecord), isCurrent: true };
  }
}
