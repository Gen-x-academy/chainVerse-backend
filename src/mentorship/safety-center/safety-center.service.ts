import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MentorshipBlockingService } from '../blocking/blocking.service';
import { isDuplicateKeyError } from '../mentorship.errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import type {
  CreateSafetyReportDto,
  UpdateSafetyCaseDto,
  UpdateSafetySettingsDto,
} from './dto/safety.dto';
import { CONDUCT_RULES, CONDUCT_RULES_VERSION, EMERGENCY_GUIDANCE } from './safety-content';
import {
  SafetyCase,
  SafetyCaseDocument,
  SafetyCaseStatus,
  SafetySettings,
  SafetySettingsDocument,
} from './schemas/safety.schema';

export interface SafetyActor {
  userId: string;
  roles?: string[];
}
const SAFETY_STAFF = ['admin', 'moderator', 'safety'];

// Allowed case transitions; anything else is a 409.
const TRANSITIONS: Record<SafetyCaseStatus, SafetyCaseStatus[]> = {
  [SafetyCaseStatus.OPEN]: [SafetyCaseStatus.UNDER_REVIEW, SafetyCaseStatus.DISMISSED],
  [SafetyCaseStatus.UNDER_REVIEW]: [SafetyCaseStatus.RESOLVED, SafetyCaseStatus.DISMISSED],
  [SafetyCaseStatus.RESOLVED]: [],
  [SafetyCaseStatus.DISMISSED]: [],
};

/**
 * MENTOR-085 — mentorship safety center. Deny-by-default: users only see and
 * change their own settings and reports; case management needs a safety role.
 * Reporters never see internal notes or the assignee.
 */
@Injectable()
export class MentorshipSafetyCenterService {
  constructor(
    @InjectModel(SafetySettings.name) private readonly settings: Model<SafetySettingsDocument>,
    @InjectModel(SafetyCase.name) private readonly cases: Model<SafetyCaseDocument>,
    private readonly blocking: MentorshipBlockingService,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  /** Static guidance: conduct rules and emergency steps. */
  guidance() {
    return { conductRulesVersion: CONDUCT_RULES_VERSION, conductRules: CONDUCT_RULES, emergency: EMERGENCY_GUIDANCE };
  }

  async getSettings(userId: string) {
    const doc = await this.settings.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { new: true, upsert: true },
    ).exec();
    return this.settingsView(doc);
  }

  async updateSettings(userId: string, dto: UpdateSafetySettingsDto) {
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) if (v !== undefined) set[k] = v;
    const doc = await this.settings
      .findOneAndUpdate({ userId }, { $set: set, $setOnInsert: { userId } }, { new: true, upsert: true })
      .exec();
    this.telemetry.count('mentorship_safety_settings_updated_total');
    return this.settingsView(doc);
  }

  /** Reports are idempotent per (reporter, key). Optionally blocks the subject. */
  async report(reporterId: string, dto: CreateSafetyReportDto, alsoBlock = false) {
    if (dto.subjectId === reporterId) throw new ConflictException('CANNOT_REPORT_SELF');
    let doc: SafetyCaseDocument | null = null;
    try {
      doc = await this.cases.create({
        reporterId,
        subjectId: dto.subjectId,
        category: dto.category,
        description: dto.description,
        sessionId: dto.sessionId ?? null,
        idempotencyKey: dto.idempotencyKey,
        status: SafetyCaseStatus.OPEN,
      });
      this.telemetry.count('mentorship_safety_report_total', { category: dto.category });
      this.telemetry.event('mentorship_safety_report_filed', { caseId: String(doc._id), category: dto.category });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      doc = await this.cases.findOne({ reporterId, idempotencyKey: dto.idempotencyKey }).exec();
      if (!doc) throw err;
    }
    if (alsoBlock) await this.blocking.block(reporterId, { blockedUserId: dto.subjectId });
    return this.reporterView(doc);
  }

  async myReports(reporterId: string) {
    const docs = await this.cases.find({ reporterId }).sort({ createdAt: -1 }).limit(100).exec();
    return docs.map((d) => this.reporterView(d));
  }

  async getMyReport(reporterId: string, id: string) {
    const doc = await this.cases.findById(id).exec();
    // Same response for "missing" and "not yours": no existence leak.
    if (!doc || doc.reporterId !== reporterId) throw new NotFoundException('SAFETY_CASE_NOT_FOUND');
    return this.reporterView(doc);
  }

  async listCases(actor: SafetyActor, status?: SafetyCaseStatus) {
    this.assertStaff(actor);
    return this.cases.find(status ? { status } : {}).sort({ createdAt: 1 }).limit(200).exec();
  }

  async updateCase(id: string, dto: UpdateSafetyCaseDto, actor: SafetyActor) {
    this.assertStaff(actor);
    const current = await this.cases.findById(id).exec();
    if (!current) throw new NotFoundException('SAFETY_CASE_NOT_FOUND');
    if (!TRANSITIONS[current.status].includes(dto.status)) {
      throw new ConflictException(`INVALID_TRANSITION_${current.status}_TO_${dto.status}`);
    }
    const update: Record<string, unknown> = {
      $set: { status: dto.status, assignedTo: actor.userId, ...(dto.resolutionSummary ? { resolutionSummary: dto.resolutionSummary } : {}) },
    };
    if (dto.internalNote) update.$push = { internalNotes: `${actor.userId}: ${dto.internalNote}` };
    const updated = await this.cases
      .findOneAndUpdate({ _id: id, status: current.status }, update, { new: true })
      .exec();
    if (!updated) throw new ConflictException('SAFETY_CASE_CHANGED_CONCURRENTLY');
    this.telemetry.count('mentorship_safety_case_total', { status: dto.status });
    return updated;
  }

  private assertStaff(actor: SafetyActor): void {
    if (!(actor.roles ?? []).some((r) => SAFETY_STAFF.includes(r))) {
      this.telemetry.count('mentorship_safety_denied_total', { reason: 'not_safety_staff' });
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    }
  }

  private settingsView(d: SafetySettingsDocument) {
    return {
      profileVisibility: d.profileVisibility,
      allowSessionRecordingRequests: d.allowSessionRecordingRequests,
      shareSessionScheduleWithTrustedContacts: d.shareSessionScheduleWithTrustedContacts,
      trustedContacts: d.trustedContacts,
      acceptedConductVersion: d.acceptedConductVersion,
    };
  }

  private reporterView(d: SafetyCaseDocument) {
    return {
      id: String(d._id),
      category: d.category,
      status: d.status,
      sessionId: d.sessionId,
      resolutionSummary: d.resolutionSummary,
    };
  }
}
