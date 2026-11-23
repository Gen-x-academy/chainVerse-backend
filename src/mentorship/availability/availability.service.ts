import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  BusinessRuleException,
  ResourceConflictException,
  ValidationDomainException,
} from '../../common/errors';
import {
  AvailabilityEntry,
  DEFAULT_AVAILABILITY_STATUS,
  MentorAvailabilityStatus,
  applicationDisposition,
  isDiscoverable,
  resolveCurrentEntry,
  resolveUpcomingEntries,
} from './availability.machine';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { SetAvailabilityScheduleDto } from './dto/set-availability-schedule.dto';
import {
  MentorAvailabilityChange,
  MentorAvailabilityChangeDocument,
} from './schemas/mentor-availability-change.schema';
import {
  MentorAvailabilitySchedule,
  MentorAvailabilityScheduleDocument,
} from './schemas/mentor-availability-schedule.schema';

export const AVAILABILITY_CHANGED_EVENT = 'mentorship.availability.changed';

/** How far into the past a change may be dated (clock skew between clients). */
export const MAX_BACKDATE_MS = 5 * 60 * 1000;
/** How far ahead a change may be scheduled. */
export const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

export interface PublicAvailability {
  mentorId: string;
  status: MentorAvailabilityStatus;
  discoverable: boolean;
  applications: 'open' | 'waitlist' | 'closed';
}

@Injectable()
export class MentorAvailabilityService {
  private readonly logger = new Logger(MentorAvailabilityService.name);

  constructor(
    @InjectModel(MentorAvailabilityChange.name)
    private readonly changes: Model<MentorAvailabilityChangeDocument>,
    @InjectModel(MentorAvailabilitySchedule.name)
    private readonly schedules: Model<MentorAvailabilityScheduleDocument>,
    private readonly events: EventEmitter2,
  ) {}

  private fingerprint(dto: SetAvailabilityDto, effectiveFrom: Date): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          dto.status,
          dto.effectiveFrom ? effectiveFrom.toISOString() : null,
          dto.maxActiveMentees ?? null,
          dto.note ?? '',
        ]),
      )
      .digest('hex');
  }

  /** Records a (possibly scheduled) change. Safe to retry with the same key. */
  async setAvailability(
    mentorId: string,
    dto: SetAvailabilityDto,
    changedBy: string,
    now: Date = new Date(),
  ): Promise<MentorAvailabilityChangeDocument> {
    const effectiveFrom = dto.effectiveFrom ?? now;
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new ValidationDomainException('effectiveFrom is not a valid date');
    }
    if (effectiveFrom.getTime() < now.getTime() - MAX_BACKDATE_MS) {
      throw new ValidationDomainException(
        'effectiveFrom cannot be in the past',
        ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
      );
    }
    if (effectiveFrom.getTime() > now.getTime() + MAX_SCHEDULE_AHEAD_MS) {
      throw new ValidationDomainException(
        'effectiveFrom cannot be more than a year ahead',
        ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
      );
    }
    if (
      dto.status === MentorAvailabilityStatus.LIMITED &&
      dto.maxActiveMentees == null
    ) {
      throw new ValidationDomainException(
        'maxActiveMentees is required when status is limited',
        ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
      );
    }
    if (
      dto.status !== MentorAvailabilityStatus.LIMITED &&
      dto.maxActiveMentees != null
    ) {
      throw new ValidationDomainException(
        'maxActiveMentees is only valid when status is limited',
        ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
      );
    }

    const fingerprint = this.fingerprint(dto, effectiveFrom);
    const existing = await this.changes
      .findOne({ mentorId, idempotencyKey: dto.idempotencyKey })
      .exec();
    if (existing) return this.replay(existing, fingerprint);

    const last = await this.changes
      .findOne({ mentorId })
      .sort({ sequence: -1 })
      .select('sequence')
      .lean()
      .exec();

    try {
      const created = await this.changes.create({
        mentorId,
        status: dto.status,
        effectiveFrom,
        maxActiveMentees: dto.maxActiveMentees ?? null,
        note: dto.note ?? '',
        idempotencyKey: dto.idempotencyKey,
        fingerprint,
        changedBy,
        sequence: (last?.sequence ?? 0) + 1,
      });
      this.logger.log(
        `mentor ${mentorId} availability -> ${dto.status} from ${effectiveFrom.toISOString()} by ${changedBy}`,
      );
      this.events.emit(AVAILABILITY_CHANGED_EVENT, {
        mentorId,
        status: created.status,
        effectiveFrom: created.effectiveFrom,
        changedBy,
      });
      return created;
    } catch (err) {
      // A concurrent retry with the same key lost the unique-index race.
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.changes
          .findOne({ mentorId, idempotencyKey: dto.idempotencyKey })
          .exec();
        if (winner) return this.replay(winner, fingerprint);
      }
      throw err;
    }
  }

  private replay(
    existing: MentorAvailabilityChangeDocument,
    fingerprint: string,
  ): MentorAvailabilityChangeDocument {
    if (existing.fingerprint !== fingerprint) {
      throw new ResourceConflictException(
        'idempotencyKey was already used for a different change',
        ErrorCode.BIZ_MENTOR_AVAILABILITY_CONFLICT,
      );
    }
    return existing;
  }

  private async entries(
    mentorId: string,
  ): Promise<(AvailabilityEntry & { note?: string })[]> {
    const rows = await this.changes.find({ mentorId }).lean().exec();
    return rows.map((r) => ({
      status: r.status,
      effectiveFrom: r.effectiveFrom,
      maxActiveMentees: r.maxActiveMentees,
      sequence: r.sequence,
      note: r.note,
    }));
  }

  /** What the mentor sees about themself, including scheduled changes. */
  async getOwn(mentorId: string, now: Date = new Date()) {
    const entries = await this.entries(mentorId);
    const current = resolveCurrentEntry(entries, now);
    return {
      mentorId,
      status: current?.status ?? DEFAULT_AVAILABILITY_STATUS,
      effectiveFrom: current?.effectiveFrom ?? null,
      maxActiveMentees: current?.maxActiveMentees ?? null,
      upcoming: resolveUpcomingEntries(entries, now),
    };
  }

  /**
   * Minimal view for discovery and applications. Exposes no notes, history or
   * capacity numbers.
   */
  async getPublic(
    mentorId: string,
    activeMentees = 0,
    now: Date = new Date(),
  ): Promise<PublicAvailability> {
    const current = resolveCurrentEntry(await this.entries(mentorId), now);
    const status = current?.status ?? DEFAULT_AVAILABILITY_STATUS;
    return {
      mentorId,
      status,
      discoverable: isDiscoverable(status),
      applications: applicationDisposition(
        status,
        activeMentees,
        current?.maxActiveMentees,
      ),
    };
  }

  /** Full audit trail, newest first. Reviewers only. */
  async history(mentorId: string) {
    return this.changes
      .find({ mentorId })
      .sort({ effectiveFrom: -1, sequence: -1 })
      .lean()
      .exec();
  }

  /** Guard for the application flow: throws if the mentor is closed. */
  async assertAcceptsApplications(
    mentorId: string,
    activeMentees = 0,
  ): Promise<'open' | 'waitlist'> {
    const view = await this.getPublic(mentorId, activeMentees);
    if (view.applications === 'closed') {
      throw new BusinessRuleException(
        'This mentor is not accepting applications',
        ErrorCode.BIZ_MENTOR_NOT_ACCEPTING,
      );
    }
    return view.applications;
  }

  private assertValidTimeZone(timeZone: string): void {
    try {
      Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    } catch {
      throw new ValidationDomainException(
        'timeZone must be a valid IANA time zone',
        ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
      );
    }
  }

  private validateSchedule(dto: SetAvailabilityScheduleDto): void {
    this.assertValidTimeZone(dto.timeZone);

    if (dto.effectiveFrom && dto.effectiveTo) {
      const from = new Date(dto.effectiveFrom).getTime();
      const to = new Date(dto.effectiveTo).getTime();
      if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
        throw new ValidationDomainException(
          'effectiveFrom must be before effectiveTo',
          ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
        );
      }
    }

    const byDay = new Map<
      number,
      { startMinute: number; endMinute: number }[]
    >();
    for (const window of dto.weeklyWindows) {
      if (window.startMinute >= window.endMinute) {
        throw new ValidationDomainException(
          'weekly window startMinute must be before endMinute',
          ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
        );
      }
      const list = byDay.get(window.dayOfWeek) ?? [];
      for (const existing of list) {
        const overlaps =
          window.startMinute < existing.endMinute &&
          window.endMinute > existing.startMinute;
        if (overlaps) {
          throw new ValidationDomainException(
            'weekly windows must not overlap',
            ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
          );
        }
      }
      list.push(window);
      byDay.set(window.dayOfWeek, list);
    }

    for (const exception of dto.exceptions ?? []) {
      if (exception.startMinute != null || exception.endMinute != null) {
        if (
          exception.startMinute == null ||
          exception.endMinute == null ||
          exception.startMinute >= exception.endMinute
        ) {
          throw new ValidationDomainException(
            'exception startMinute/endMinute must form a valid range',
            ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID,
          );
        }
      }
    }
  }

  async setSchedule(
    mentorId: string,
    dto: SetAvailabilityScheduleDto,
    changedBy: string,
  ) {
    this.validateSchedule(dto);
    const payload = {
      mentorId,
      timeZone: dto.timeZone,
      leadTimeMinutes: dto.leadTimeMinutes,
      bufferMinutes: dto.bufferMinutes,
      bookingHorizonDays: dto.bookingHorizonDays,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      weeklyWindows: dto.weeklyWindows.map((w) => ({ ...w })),
      exceptions: (dto.exceptions ?? []).map((e) => ({
        date: e.date,
        available: e.available,
        startMinute: e.startMinute ?? null,
        endMinute: e.endMinute ?? null,
      })),
      updatedBy: changedBy,
    };

    const saved = await this.schedules
      .findOneAndUpdate(
        { mentorId },
        { $set: payload },
        { upsert: true, new: true },
      )
      .exec();

    this.logger.log(
      `mentor ${mentorId} availability schedule updated by ${changedBy}`,
    );
    return saved;
  }

  async getSchedule(mentorId: string) {
    return this.schedules.findOne({ mentorId }).lean().exec();
  }
}
