import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { AuditContext, systemAuditContext } from '../../common/audit/audit-context';
import { AuditService } from '../../common/audit/audit.service';
import { Role } from '../../common/enums/role.enum';
import { MentorshipTelemetryService } from '../mentorship-telemetry.service';
import { AssignMentorshipFacilitatorDto } from './dto/assign-mentorship-facilitator.dto';
import { MentorshipProgram, MentorshipProgramDocument } from '../program/mentorship-program.schema';
import { MentorshipFacilitator, MentorshipFacilitatorDocument, MentorshipFacilitatorRole } from './mentorship-facilitator.schema';

const CONFLICTS: Record<MentorshipFacilitatorRole, MentorshipFacilitatorRole[]> = {
  [MentorshipFacilitatorRole.COORDINATOR]: [MentorshipFacilitatorRole.APPLICATION_REVIEWER, MentorshipFacilitatorRole.FINANCE_APPROVER],
  [MentorshipFacilitatorRole.APPLICATION_REVIEWER]: [MentorshipFacilitatorRole.COORDINATOR, MentorshipFacilitatorRole.FINANCE_APPROVER],
  [MentorshipFacilitatorRole.SAFEGUARDING_CONTACT]: [],
  [MentorshipFacilitatorRole.FINANCE_APPROVER]: [MentorshipFacilitatorRole.COORDINATOR, MentorshipFacilitatorRole.APPLICATION_REVIEWER],
};

@Injectable()
export class MentorshipFacilitatorService {
  constructor(
    @InjectModel(MentorshipFacilitator.name) private readonly model: Model<MentorshipFacilitatorDocument>,
    @InjectModel(MentorshipProgram.name) private readonly programs: Model<MentorshipProgramDocument>,
    private readonly audit: AuditService,
    private readonly telemetry: MentorshipTelemetryService,
  ) {}

  async assign(programId: string, dto: AssignMentorshipFacilitatorDto, actorId: string, actorRole: string, context?: AuditContext) {
    this.assertManager(actorRole);
    const program = await this.programs.findById(programId).exec();
    if (!program) throw new NotFoundException('MENTORSHIP_PROGRAM_NOT_FOUND');
    if (dto.userId === actorId && dto.role === MentorshipFacilitatorRole.APPLICATION_REVIEWER) throw new ForbiddenException('MENTORSHIP_SELF_REVIEW_FORBIDDEN');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(startsAt < endsAt)) throw new ConflictException('MENTORSHIP_FACILITATOR_TENURE_INVALID');
    const now = new Date();
    if (endsAt <= now) throw new ConflictException('MENTORSHIP_FACILITATOR_TENURE_EXPIRED');
    const existing = await this.model.findOne({ programId, userId: dto.userId, role: dto.role }).exec();
    if (existing) {
      if (existing.idempotencyKey === dto.idempotencyKey) return this.view(existing);
      throw new ConflictException('MENTORSHIP_FACILITATOR_ASSIGNMENT_EXISTS');
    }
    const conflicting = await this.model.find({ programId, userId: dto.userId, active: true, endsAt: { $gt: now }, role: { $in: CONFLICTS[dto.role] } }).lean().exec();
    if (conflicting.length) throw new ConflictException('MENTORSHIP_FACILITATOR_SEPARATION_OF_DUTY');
    let row: MentorshipFacilitatorDocument;
    try {
      row = await new this.model({ programId, organizationId: program.organizationId, userId: dto.userId, role: dto.role, startsAt, endsAt, active: true, idempotencyKey: dto.idempotencyKey }).save();
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) throw new ConflictException('MENTORSHIP_FACILITATOR_ASSIGNMENT_EXISTS');
      throw error;
    }
    await this.audit.record({ action: AuditAction.MENTORSHIP_FACILITATOR_ASSIGNED, context: context ?? systemAuditContext('mentorship-facilitator-assign', actorId), target: { type: 'mentorship_facilitator', id: row.id }, before: null, after: { programId, userId: dto.userId, role: dto.role, startsAt, endsAt } });
    this.telemetry.record('facilitator.assigned', { role: dto.role });
    return this.view(row);
  }

  async list(programId: string, actorRole: string) {
    this.assertManager(actorRole);
    return (await this.model.find({ programId }).sort({ endsAt: 1 }).lean().exec()).map((row) => this.view(row));
  }

  async revoke(programId: string, assignmentId: string, actorId: string, actorRole: string, context?: AuditContext) {
    this.assertManager(actorRole);
    const row = await this.model.findOne({ _id: assignmentId, programId }).exec();
    if (!row) throw new NotFoundException('MENTORSHIP_FACILITATOR_NOT_FOUND');
    if (!row.active) return this.view(row);
    row.active = false;
    row.revokedAt = new Date();
    await row.save();
    await this.audit.record({ action: AuditAction.MENTORSHIP_FACILITATOR_REVOKED, context: context ?? systemAuditContext('mentorship-facilitator-revoke', actorId), target: { type: 'mentorship_facilitator', id: row.id }, before: { active: true }, after: { active: false, revokedAt: row.revokedAt } });
    this.telemetry.record('facilitator.revoked', { role: row.role });
    return this.view(row);
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'mentorship-facilitator-expiry' })
  async revokeExpired(): Promise<number> {
    const result = await this.model.updateMany({ active: true, endsAt: { $lte: new Date() } }, { $set: { active: false, revokedAt: new Date() } }).exec();
    if (result.modifiedCount) this.telemetry.record('facilitator.expired', { count: result.modifiedCount });
    return result.modifiedCount;
  }

  private assertManager(role: string): void {
    if (![Role.ADMIN, Role.MODERATOR].includes(role as Role)) throw new ForbiddenException('MENTORSHIP_FACILITATOR_FORBIDDEN');
  }
  private view(row: MentorshipFacilitatorDocument | (MentorshipFacilitator & { _id?: unknown })) { return { id: String(row._id ?? ''), programId: row.programId, organizationId: row.organizationId, userId: row.userId, role: row.role, startsAt: row.startsAt, endsAt: row.endsAt, active: row.active, revokedAt: row.revokedAt ?? null }; }
}
