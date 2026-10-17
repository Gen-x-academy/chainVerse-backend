import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { AuditContext, systemAuditContext } from '../../common/audit/audit-context';
import { AuditService } from '../../common/audit/audit.service';
import { Role } from '../../common/enums/role.enum';
import { MentorshipTelemetryService } from '../mentorship-telemetry.service';
import { ManageMentorshipProgramDto } from './dto/manage-mentorship-program.dto';
import {
  MentorshipDeliveryMode,
  MentorshipProgram,
  MentorshipProgramDocument,
  MentorshipProgramWorkflowStatus,
} from './mentorship-program.schema';

const REMOTE_MODES = [MentorshipDeliveryMode.REMOTE, MentorshipDeliveryMode.HYBRID];
const IN_PERSON_MODES = [MentorshipDeliveryMode.IN_PERSON, MentorshipDeliveryMode.HYBRID];
const PUBLIC_FIELDS = ['_id', 'name', 'organizationId', 'deliveryMode', 'discoveryLabels', 'location.countryCode', 'location.region', 'location.city'];

@Injectable()
export class MentorshipProgramService {
  constructor(
    @InjectModel(MentorshipProgram.name) private readonly model: Model<MentorshipProgramDocument>,
    private readonly audit: AuditService,
    private readonly telemetry: MentorshipTelemetryService,
  ) {}

  async create(dto: ManageMentorshipProgramDto, actorId: string, actorRole: string, context?: AuditContext) {
    this.assertManager(actorRole);
    this.assertModeFields(dto);
    const existing = await this.model.findOne({ organizationId: dto.organizationId, createdBy: actorId, lastMutationKey: dto.idempotencyKey }).exec();
    if (existing) return this.toView(existing);
    const row = await new this.model({
      name: dto.name,
      organizationId: dto.organizationId,
      createdBy: actorId,
      deliveryMode: dto.deliveryMode,
      remotePlatform: dto.remotePlatform,
      remoteJoinInstructions: dto.remoteJoinInstructions,
      location: dto.location ?? null,
      discoveryLabels: this.labels(dto.deliveryMode, dto.location),
      workflowStatus: MentorshipProgramWorkflowStatus.PENDING,
      lastMutationKey: dto.idempotencyKey,
      version: 1,
    }).save();
    await this.audit.record({ action: AuditAction.MENTORSHIP_PROGRAM_CREATED, context: context ?? systemAuditContext('mentorship-program-create', actorId), target: { type: 'mentorship_program', id: row.id }, before: null, after: this.auditView(row) });
    this.telemetry.record('program.created', { mode: row.deliveryMode, workflow: row.workflowStatus });
    return this.toView(row);
  }

  async update(programId: string, dto: ManageMentorshipProgramDto, actorId: string, actorRole: string, context?: AuditContext) {
    this.assertManager(actorRole);
    this.assertModeFields(dto);
    const row = await this.findOwned(programId, actorId);
    if (row.lastMutationKey === dto.idempotencyKey) return this.toView(row);
    if (row.activeBookingCount > 0 && (row.deliveryMode !== dto.deliveryMode || JSON.stringify(row.location ?? null) !== JSON.stringify(dto.location ?? null))) {
      this.telemetry.record('program.update.rejected_bookings', { programId, activeBookings: row.activeBookingCount });
      throw new ConflictException('MENTORSHIP_PROGRAM_BOOKINGS_PROTECT_CONFIGURATION');
    }
    const before = this.auditView(row);
    row.name = dto.name;
    row.deliveryMode = dto.deliveryMode;
    row.remotePlatform = dto.remotePlatform;
    row.remoteJoinInstructions = dto.remoteJoinInstructions;
    row.location = dto.location ?? null;
    row.discoveryLabels = this.labels(dto.deliveryMode, dto.location);
    row.workflowStatus = MentorshipProgramWorkflowStatus.PENDING;
    row.workflowError = null;
    row.lastMutationKey = dto.idempotencyKey;
    row.version += 1;
    await row.save();
    await this.audit.record({ action: AuditAction.MENTORSHIP_PROGRAM_UPDATED, context: context ?? systemAuditContext('mentorship-program-update', actorId), target: { type: 'mentorship_program', id: row.id }, before, after: this.auditView(row) });
    this.telemetry.record('program.updated', { mode: row.deliveryMode, workflow: row.workflowStatus });
    return this.toView(row);
  }

  async discover(organizationId?: string) {
    const filter = organizationId ? { organizationId } : {};
    const rows = await this.model.find(filter).select(PUBLIC_FIELDS.join(' ')).lean().exec();
    return rows.map((row) => ({ id: String(row._id), name: row.name, organizationId: row.organizationId, deliveryMode: row.deliveryMode, labels: row.discoveryLabels, location: row.location ? { countryCode: row.location.countryCode, region: row.location.region, city: row.location.city } : null }));
  }

  async get(programId: string, actorId?: string) {
    const row = await this.model.findById(programId).exec();
    if (!row) throw new NotFoundException('MENTORSHIP_PROGRAM_NOT_FOUND');
    return actorId === row.createdBy ? this.toView(row) : this.toPublicView(row);
  }

  /** Called by the scheduled worker; failures stay visible and are retried safely. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'mentorship-program-workflow' })
  async processPending(limit = 50): Promise<number> {
    const rows = await this.model.find({ workflowStatus: MentorshipProgramWorkflowStatus.PENDING }).limit(limit).exec();
    let processed = 0;
    for (const row of rows) {
      row.workflowStatus = MentorshipProgramWorkflowStatus.PROCESSING;
      await row.save();
      try {
        row.workflowStatus = MentorshipProgramWorkflowStatus.READY;
        row.workflowAttempts += 1;
        await row.save();
        processed += 1;
        this.telemetry.record('program.workflow_ready', { mode: row.deliveryMode });
      } catch (error) {
        row.workflowStatus = MentorshipProgramWorkflowStatus.FAILED;
        row.workflowAttempts += 1;
        row.workflowError = error instanceof Error ? error.message.slice(0, 240) : 'workflow_failed';
        await row.save();
        this.telemetry.record('program.workflow_failed', { mode: row.deliveryMode });
      }
    }
    return processed;
  }

  private assertManager(role: string): void {
    if (![Role.ADMIN, Role.MODERATOR].includes(role as Role)) throw new ForbiddenException('MENTORSHIP_PROGRAM_FORBIDDEN');
  }
  private async findOwned(id: string, actorId: string): Promise<MentorshipProgramDocument> {
    const row = await this.model.findById(id).exec();
    if (!row) throw new NotFoundException('MENTORSHIP_PROGRAM_NOT_FOUND');
    if (row.createdBy !== actorId) throw new ForbiddenException('MENTORSHIP_PROGRAM_FORBIDDEN');
    return row;
  }
  private assertModeFields(dto: ManageMentorshipProgramDto): void {
    const remote = REMOTE_MODES.includes(dto.deliveryMode);
    const inPerson = IN_PERSON_MODES.includes(dto.deliveryMode);
    const locationInput = dto.location as (ManageMentorshipProgramDto['location'] & Record<string, unknown>) | undefined;
    if (locationInput && ['address', 'street', 'latitude', 'longitude', 'coordinates', 'accessCode'].some((key) => key in locationInput)) {
      throw new BadRequestException('MENTORSHIP_PRECISE_LOCATION_FORBIDDEN');
    }
    if (remote && (!dto.remotePlatform || !dto.remoteJoinInstructions)) throw new BadRequestException('MENTORSHIP_REMOTE_FIELDS_REQUIRED');
    if (inPerson && (!dto.location || !dto.location.countryCode || !dto.location.region || !dto.location.city)) throw new BadRequestException('MENTORSHIP_LOCATION_FIELDS_REQUIRED');
    if (!inPerson && dto.location) throw new BadRequestException('MENTORSHIP_LOCATION_NOT_ALLOWED');
    if (!remote && (dto.remotePlatform || dto.remoteJoinInstructions)) throw new BadRequestException('MENTORSHIP_REMOTE_FIELDS_NOT_ALLOWED');
  }
  private labels(mode: MentorshipDeliveryMode, location?: ManageMentorshipProgramDto['location']): string[] {
    const labels = mode === MentorshipDeliveryMode.HYBRID ? ['hybrid', 'remote', 'in-person'] : mode === MentorshipDeliveryMode.REMOTE ? ['remote'] : ['in-person'];
    if (location?.countryCode) labels.push(`country:${location.countryCode.toUpperCase()}`);
    if (location?.region) labels.push(`region:${location.region}`);
    return labels;
  }
  private auditView(row: MentorshipProgramDocument): Record<string, unknown> { return { id: row.id, organizationId: row.organizationId, deliveryMode: row.deliveryMode, labels: row.discoveryLabels, version: row.version, activeBookingCount: row.activeBookingCount }; }
  private toView(row: MentorshipProgramDocument) { return { id: row.id, name: row.name, organizationId: row.organizationId, deliveryMode: row.deliveryMode, remotePlatform: row.remotePlatform ?? null, remoteJoinInstructions: row.remoteJoinInstructions ?? null, location: row.location, discoveryLabels: row.discoveryLabels, activeBookingCount: row.activeBookingCount, workflowStatus: row.workflowStatus, version: row.version }; }
  private toPublicView(row: MentorshipProgramDocument) { return { id: row.id, name: row.name, organizationId: row.organizationId, deliveryMode: row.deliveryMode, discoveryLabels: row.discoveryLabels, location: row.location ? { countryCode: row.location.countryCode, region: row.location.region, city: row.location.city } : null }; }
}
