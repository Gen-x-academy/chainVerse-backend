import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditAction, AuditContext, AuditService } from '../common/audit';
import { RequestActor, isStaff } from '../common/auth/resource-owner';
import { Role } from '../common/enums/role.enum';
import {
  BusinessRuleException,
  ErrorCode,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors';
import { DomainEvents } from '../events/event-names';
import {
  MentorshipApplicationDecidedPayload,
  MentorshipApplicationReappliedPayload,
  MentorshipApplicationWithdrawnPayload,
} from '../events/payloads/mentorship-application.payload';
import {
  CLOSED_STATUSES,
  DECISION_TARGET_STATUS,
  allowedDecisions,
  canApplyDecision,
  isActiveStatus,
} from './domain/application-transitions';
import {
  applicantVisibleStatus,
  toApplicantApplication,
  toInternalApplication,
  toInternalDecision,
} from './domain/application-views';
import {
  InformationResponseDto,
  ReapplyMentorshipApplicationDto,
  SubmitMentorshipApplicationDto,
} from './dto/mentorship-application.dto';
import {
  RecordDecisionDto,
  WithdrawApplicationDto,
} from './dto/mentorship-decision.dto';
import { CreateMentorshipProgramDto } from './dto/mentorship-program.dto';
import {
  ApplicantReasonCode,
  ApplicationStatus,
  CommunicationPolicy,
  DecisionActorKind,
  DecisionType,
  InternalReasonCode,
  NotificationDispatchStatus,
  ReapplicationMode,
  ReservationStatus,
} from './enums/mentorship.enums';
import {
  MentorshipApplicationDecision,
  MentorshipApplicationDecisionDocument,
} from './schemas/mentorship-application-decision.schema';
import {
  MentorshipApplication,
  MentorshipApplicationDocument,
} from './schemas/mentorship-application.schema';
import {
  MentorshipDecisionNotification,
  MentorshipDecisionNotificationDocument,
} from './schemas/mentorship-decision-notification.schema';
import {
  MentorshipProgram,
  MentorshipProgramDocument,
} from './schemas/mentorship-program.schema';
import { MentorshipTelemetry } from './telemetry/mentorship.telemetry';

/** Tolerated clock skew when a client sends `effectiveAt` of "now". */
const EFFECTIVE_AT_SKEW_MS = 60_000;

const DUPLICATE_KEY_ERROR = 11000;

type SeatChange = 'reserve' | 'release' | 'none';

interface TransitionRequest {
  application: MentorshipApplicationDocument;
  program: MentorshipProgramDocument;
  type: DecisionType;
  applicantReasonCode: ApplicantReasonCode;
  applicantMessage: string | null;
  internalReasonCode: InternalReasonCode | null;
  internalNote: string | null;
  effectiveAt: Date;
  communicationPolicy: CommunicationPolicy;
  actor: RequestActor;
  actorKind: DecisionActorKind;
  idempotencyKey: string;
  requestHash: string;
}

interface TransitionResult {
  application: MentorshipApplicationDocument;
  decision: MentorshipApplicationDecisionDocument;
  seatReleased: boolean;
  replayed: boolean;
}

@Injectable()
export class MentorshipApplicationsService {
  private readonly logger = new Logger(MentorshipApplicationsService.name);
  private transactionsSupported: boolean | null = null;

  constructor(
    @InjectModel(MentorshipProgram.name)
    private readonly programModel: Model<MentorshipProgramDocument>,
    @InjectModel(MentorshipApplication.name)
    private readonly applicationModel: Model<MentorshipApplicationDocument>,
    @InjectModel(MentorshipApplicationDecision.name)
    private readonly decisionModel: Model<MentorshipApplicationDecisionDocument>,
    @InjectModel(MentorshipDecisionNotification.name)
    private readonly notificationModel: Model<MentorshipDecisionNotificationDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  // ── Programs ───────────────────────────────────────────────────────────────

  async createProgram(
    dto: CreateMentorshipProgramDto,
    actor: RequestActor,
    audit: AuditContext,
  ) {
    let mentorId = actor.id;
    if (dto.mentorId && dto.mentorId !== actor.id) {
      if (actor.role !== Role.ADMIN) {
        throw new ForbiddenDomainException(
          'Only admins can create a program on behalf of another mentor',
          ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        );
      }
      mentorId = dto.mentorId;
    }

    if (
      dto.applicationsCloseAt &&
      dto.withdrawalCutoffAt &&
      dto.withdrawalCutoffAt < dto.applicationsCloseAt
    ) {
      throw new ValidationDomainException(
        'withdrawalCutoffAt must not be earlier than applicationsCloseAt',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }

    const program = await this.programModel.create({
      mentorId: new Types.ObjectId(mentorId),
      title: dto.title,
      description: dto.description ?? null,
      capacity: dto.capacity,
      applicationsCloseAt: dto.applicationsCloseAt ?? null,
      withdrawalCutoffAt: dto.withdrawalCutoffAt ?? null,
      consentVersion: dto.consentVersion,
      reapplication: dto.reapplication ?? {},
    });

    await this.auditService.record({
      action: AuditAction.MENTORSHIP_PROGRAM_CREATED,
      context: audit,
      target: { type: 'mentorship_program', id: program.id },
      after: program.toObject(),
    });

    return this.toProgramView(program);
  }

  async getProgram(programId: string) {
    return this.toProgramView(await this.findProgram(programId));
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  async submitApplication(
    programId: string,
    dto: SubmitMentorshipApplicationDto,
    actor: RequestActor,
    idempotencyKey: string,
  ) {
    this.assertApplicantRole(actor);

    const replay = await this.findBySubmissionKey(actor.id, idempotencyKey);
    if (replay) {
      if (
        replay.programId.toString() !== programId ||
        replay.previousApplicationId
      ) {
        throw this.keyReused('submit', replay.id);
      }
      this.telemetry.idempotentReplay('submit', replay.id);
      return this.applicantView(replay);
    }

    const program = await this.findProgram(programId);
    this.assertProgramAcceptingApplications(program, 'submit');
    this.assertConsentCurrent(program, dto.consent.version, 'submit');

    const previous = await this.applicationModel
      .findOne({
        programId: program._id,
        applicantId: new Types.ObjectId(actor.id),
      })
      .sort({ attemptNumber: -1 })
      .exec();
    if (previous) {
      if (previous.isActive) {
        throw this.rejected(
          'submit',
          new BusinessRuleException(
            `You already have an active application (${previous.id}) for this program`,
            ErrorCode.BIZ_MENTORSHIP_ACTIVE_APPLICATION_EXISTS,
          ),
          previous.id,
        );
      }
      throw this.rejected(
        'submit',
        new BusinessRuleException(
          `You have applied to this program before; use POST /mentorship/applications/${previous.supersededByApplicationId ?? previous.id}/reapply`,
          ErrorCode.BIZ_MENTORSHIP_REAPPLICATION_NOT_PERMITTED,
        ),
        previous.id,
      );
    }

    const id = new Types.ObjectId();
    try {
      const application = await this.applicationModel.create({
        _id: id,
        programId: program._id,
        applicantId: new Types.ObjectId(actor.id),
        status: ApplicationStatus.SUBMITTED,
        isActive: true,
        motivation: dto.motivation,
        goals: dto.goals ?? [],
        consent: { version: dto.consent.version, acceptedAt: new Date() },
        attemptNumber: 1,
        rootApplicationId: id,
        submissionKey: idempotencyKey,
      });
      return this.applicantView(application);
    } catch (error) {
      return this.resolveCreateConflict(error, actor, idempotencyKey, 'submit');
    }
  }

  async respondToInformationRequest(
    applicationId: string,
    dto: InformationResponseDto,
    actor: RequestActor,
  ) {
    const application = await this.findApplication(applicationId);
    this.assertApplicant(application, actor);

    const updated = await this.applicationModel
      .findOneAndUpdate(
        {
          _id: application._id,
          status: ApplicationStatus.INFORMATION_REQUESTED,
          version: application.version,
        },
        {
          $set: { status: ApplicationStatus.SUBMITTED },
          $push: {
            informationResponses: {
              message: dto.message,
              respondedAt: new Date(),
            },
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw this.rejected(
        'respond',
        new BusinessRuleException(
          'This application is not waiting for additional information',
          ErrorCode.BIZ_MENTORSHIP_INVALID_TRANSITION,
        ),
        application.id,
      );
    }
    return this.applicantView(updated);
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getApplication(applicationId: string, actor: RequestActor) {
    const application = await this.findApplication(applicationId);
    if (this.isApplicant(application, actor)) {
      return this.applicantView(application);
    }
    const program = await this.findProgram(application.programId.toString());
    this.assertReviewer(program, actor);
    return toInternalApplication(
      application,
      await this.decisionsFor(application._id),
    );
  }

  async listDecisions(applicationId: string, actor: RequestActor) {
    const application = await this.findApplication(applicationId);
    if (this.isApplicant(application, actor)) {
      return (await this.applicantView(application)).decisions;
    }
    const program = await this.findProgram(application.programId.toString());
    this.assertReviewer(program, actor);
    return (await this.decisionsFor(application._id)).map(toInternalDecision);
  }

  async listProgramApplications(
    programId: string,
    actor: RequestActor,
    status?: ApplicationStatus,
  ) {
    const program = await this.findProgram(programId);
    this.assertReviewer(program, actor);
    const applications = await this.applicationModel
      .find({ programId: program._id, ...(status ? { status } : {}) })
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
    return applications.map((application) =>
      toInternalApplication(application),
    );
  }

  async listMyApplications(actor: RequestActor) {
    this.assertApplicantRole(actor);
    const applications = await this.applicationModel
      .find({ applicantId: new Types.ObjectId(actor.id) })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
    return Promise.all(applications.map((a) => this.applicantView(a)));
  }

  // ── Decisions (MENTOR-035) ─────────────────────────────────────────────────

  async recordDecision(
    applicationId: string,
    dto: RecordDecisionDto,
    actor: RequestActor,
    idempotencyKey: string,
    audit: AuditContext,
  ) {
    const application = await this.findApplication(applicationId);
    const program = await this.findProgram(application.programId.toString());
    this.assertReviewer(program, actor);

    if (dto.type === DecisionType.WITHDRAW && !isStaff(actor)) {
      // Mentors may not withdraw on an applicant's behalf; applicants use
      // the dedicated withdrawal endpoint, staff use this one on request.
      throw this.rejected(
        'decide',
        new ForbiddenDomainException(
          'Only the applicant or platform staff can withdraw an application',
          ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        ),
        application.id,
      );
    }

    const requestHash = hashRequest(dto);
    const replay = await this.replayIfSeen(
      application,
      idempotencyKey,
      requestHash,
      'decide',
    );
    if (replay) {
      return this.decisionResponse(replay);
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== application.version
    ) {
      throw this.rejected(
        'decide',
        new ResourceConflictException(
          `Application is at version ${application.version}, not ${dto.expectedVersion}; reload it before deciding`,
          ErrorCode.BIZ_MENTORSHIP_STALE_VERSION,
        ),
        application.id,
      );
    }

    this.assertTransitionAllowed(application, dto.type, 'decide');

    const now = Date.now();
    const effectiveAt = dto.effectiveAt ?? new Date(now);
    if (effectiveAt.getTime() < now - EFFECTIVE_AT_SKEW_MS) {
      throw this.rejected(
        'decide',
        new BusinessRuleException(
          'effectiveAt cannot be in the past; decision history is not backdated',
          ErrorCode.BIZ_MENTORSHIP_EFFECTIVE_TIME_IN_PAST,
        ),
        application.id,
      );
    }
    const isFuture = effectiveAt.getTime() > now + EFFECTIVE_AT_SKEW_MS;
    const communicationPolicy =
      dto.communicationPolicy ??
      (isFuture
        ? CommunicationPolicy.NOTIFY_AT_EFFECTIVE_TIME
        : CommunicationPolicy.NOTIFY_IMMEDIATELY);
    if (
      isFuture &&
      communicationPolicy === CommunicationPolicy.NOTIFY_IMMEDIATELY
    ) {
      throw new ValidationDomainException(
        'A decision effective in the future cannot notify immediately; use notify_at_effective_time or silent',
      );
    }

    const result = await this.applyTransition({
      application,
      program,
      type: dto.type,
      applicantReasonCode: dto.applicantReasonCode,
      applicantMessage: dto.applicantMessage ?? null,
      internalReasonCode: dto.internalReasonCode ?? null,
      internalNote: dto.internalNote ?? null,
      effectiveAt,
      communicationPolicy,
      actor,
      actorKind: isStaff(actor)
        ? DecisionActorKind.STAFF
        : DecisionActorKind.REVIEWER,
      idempotencyKey,
      requestHash,
    });

    await this.afterTransition(result, audit);
    return this.decisionResponse(result);
  }

  // ── Withdrawal (MENTOR-036) ────────────────────────────────────────────────

  /**
   * Describes what withdrawing would do, and returns the token the applicant
   * must echo back to confirm. The token is bound to the application's
   * current version, so consequences shown are the consequences applied.
   */
  async getWithdrawalPreview(applicationId: string, actor: RequestActor) {
    const application = await this.findApplication(applicationId);
    this.assertApplicant(application, actor);
    const program = await this.findProgram(application.programId.toString());
    const now = new Date();
    const decisions = await this.decisionsFor(application._id);
    const visibleStatus = applicantVisibleStatus(application, decisions, now);

    let blockedBy: { errorCode: ErrorCode; message: string } | null = null;
    if (application.status === ApplicationStatus.WITHDRAWN) {
      blockedBy = {
        errorCode: ErrorCode.BIZ_MENTORSHIP_APPLICATION_WITHDRAWN,
        message: 'This application has already been withdrawn',
      };
    } else if (!canApplyDecision(application.status, DecisionType.WITHDRAW)) {
      blockedBy = {
        errorCode: ErrorCode.BIZ_MENTORSHIP_APPLICATION_CLOSED,
        message: 'This application is closed and cannot be withdrawn',
      };
    } else if (this.withdrawalCutoffPassed(program, now)) {
      blockedBy = {
        errorCode: ErrorCode.BIZ_MENTORSHIP_WITHDRAWAL_CUTOFF_PASSED,
        message: `The withdrawal cutoff (${program.withdrawalCutoffAt!.toISOString()}) has passed`,
      };
    }

    return {
      applicationId: application.id,
      status: visibleStatus,
      canWithdraw: blockedBy === null,
      blockedBy,
      withdrawalCutoffAt: program.withdrawalCutoffAt,
      consequences: {
        reviewStops: true,
        recordRetained: true,
        seatReleased:
          visibleStatus === ApplicationStatus.ACCEPTED &&
          application.reservation?.status === ReservationStatus.HELD,
        reapplication: this.describeReapplication(
          program,
          application,
          now,
          true,
        ),
      },
      confirmationToken: blockedBy ? null : withdrawalToken(application),
    };
  }

  async withdraw(
    applicationId: string,
    dto: WithdrawApplicationDto,
    actor: RequestActor,
    idempotencyKey: string,
    audit: AuditContext,
  ) {
    const application = await this.findApplication(applicationId);
    this.assertApplicant(application, actor);

    const requestHash = hashRequest(dto);
    const replay = await this.replayIfSeen(
      application,
      idempotencyKey,
      requestHash,
      'withdraw',
    );
    if (replay) {
      return this.withdrawalResponse(replay);
    }

    this.assertTransitionAllowed(
      application,
      DecisionType.WITHDRAW,
      'withdraw',
    );

    const program = await this.findProgram(application.programId.toString());
    if (this.withdrawalCutoffPassed(program, new Date())) {
      throw this.rejected(
        'withdraw',
        new BusinessRuleException(
          `The withdrawal cutoff (${program.withdrawalCutoffAt!.toISOString()}) has passed`,
          ErrorCode.BIZ_MENTORSHIP_WITHDRAWAL_CUTOFF_PASSED,
        ),
        application.id,
      );
    }

    if (dto.confirmationToken !== withdrawalToken(application)) {
      throw this.rejected(
        'withdraw',
        new ResourceConflictException(
          'The application changed since the withdrawal preview; fetch a new preview and confirm again',
          ErrorCode.BIZ_MENTORSHIP_WITHDRAWAL_CONFIRMATION_STALE,
        ),
        application.id,
      );
    }

    const result = await this.applyTransition({
      application,
      program,
      type: DecisionType.WITHDRAW,
      applicantReasonCode: ApplicantReasonCode.APPLICANT_REQUESTED,
      applicantMessage: dto.note ?? null,
      internalReasonCode: InternalReasonCode.APPLICANT_REQUEST,
      internalNote: null,
      effectiveAt: new Date(),
      communicationPolicy: CommunicationPolicy.NOTIFY_IMMEDIATELY,
      actor,
      actorKind: DecisionActorKind.APPLICANT,
      idempotencyKey,
      requestHash,
    });

    await this.afterTransition(result, audit);
    return this.withdrawalResponse(result);
  }

  // ── Reapplication (MENTOR-036) ─────────────────────────────────────────────

  async reapply(
    previousApplicationId: string,
    dto: ReapplyMentorshipApplicationDto,
    actor: RequestActor,
    idempotencyKey: string,
    audit: AuditContext,
  ) {
    this.assertApplicantRole(actor);

    const replay = await this.findBySubmissionKey(actor.id, idempotencyKey);
    if (replay) {
      if (replay.previousApplicationId?.toString() !== previousApplicationId) {
        throw this.keyReused('reapply', replay.id);
      }
      this.telemetry.idempotentReplay('reapply', replay.id);
      return this.applicantView(replay);
    }

    const previous = await this.findApplication(previousApplicationId);
    this.assertApplicant(previous, actor);
    const program = await this.findProgram(previous.programId.toString());
    const now = new Date();

    if (previous.supersededByApplicationId) {
      throw this.rejected(
        'reapply',
        new ResourceConflictException(
          `This application was already followed by ${previous.supersededByApplicationId.toString()}`,
          ErrorCode.BIZ_MENTORSHIP_ALREADY_REAPPLIED,
        ),
        previous.id,
      );
    }
    if (!CLOSED_STATUSES.has(previous.status)) {
      throw this.rejected(
        'reapply',
        new BusinessRuleException(
          'You can only reapply once this application has been withdrawn or closed',
          ErrorCode.BIZ_MENTORSHIP_ACTIVE_APPLICATION_EXISTS,
        ),
        previous.id,
      );
    }

    const eligibility = this.describeReapplication(
      program,
      previous,
      now,
      false,
    );
    if (!eligibility.permitted) {
      throw this.rejected(
        'reapply',
        new BusinessRuleException(eligibility.reason!, eligibility.errorCode!),
        previous.id,
      );
    }

    this.assertProgramAcceptingApplications(program, 'reapply');
    // Consent is collected fresh, against the program's current text. The
    // previous application's consent is deliberately never read here.
    this.assertConsentCurrent(program, dto.consent.version, 'reapply');

    const id = new Types.ObjectId();
    let created: MentorshipApplicationDocument;
    try {
      created = await this.withTransaction(async (session) => {
        const linked = await this.applicationModel
          .updateOne(
            { _id: previous._id, supersededByApplicationId: null },
            { $set: { supersededByApplicationId: id } },
            session ? { session } : {},
          )
          .exec();
        if (linked.modifiedCount === 0) {
          throw new ResourceConflictException(
            'This application was already followed by a reapplication',
            ErrorCode.BIZ_MENTORSHIP_ALREADY_REAPPLIED,
          );
        }

        try {
          const [application] = await this.applicationModel.create(
            [
              {
                _id: id,
                programId: program._id,
                applicantId: new Types.ObjectId(actor.id),
                status: ApplicationStatus.SUBMITTED,
                isActive: true,
                motivation: dto.motivation ?? previous.motivation,
                goals: dto.goals ?? previous.goals,
                consent: { version: dto.consent.version, acceptedAt: now },
                attemptNumber: previous.attemptNumber + 1,
                previousApplicationId: previous._id,
                rootApplicationId: previous.rootApplicationId ?? previous._id,
                submissionKey: idempotencyKey,
              },
            ],
            session ? { session } : {},
          );
          return application;
        } catch (error) {
          if (!session) {
            // No transaction to roll back: undo the forward link ourselves.
            await this.applicationModel
              .updateOne(
                { _id: previous._id, supersededByApplicationId: id },
                { $set: { supersededByApplicationId: null } },
              )
              .exec();
          }
          throw error;
        }
      });
    } catch (error) {
      return this.resolveCreateConflict(
        error,
        actor,
        idempotencyKey,
        'reapply',
      );
    }

    await this.auditService.record({
      action: AuditAction.MENTORSHIP_APPLICATION_REAPPLIED,
      context: audit,
      target: { type: 'mentorship_application', id: created.id },
      before: { previousApplicationId: previous.id },
      after: { attemptNumber: created.attemptNumber, programId: program.id },
    });
    this.eventEmitter.emit(DomainEvents.MENTORSHIP_APPLICATION_REAPPLIED, {
      applicationId: created.id,
      previousApplicationId: previous.id,
      programId: program.id,
      applicantId: actor.id,
      attemptNumber: created.attemptNumber,
    } satisfies MentorshipApplicationReappliedPayload);
    this.telemetry.reapplied({
      applicationId: created.id,
      previousApplicationId: previous.id,
      attemptNumber: created.attemptNumber,
    });

    return this.applicantView(created);
  }

  // ── Transition engine ──────────────────────────────────────────────────────

  /**
   * Moves the application, adjusts the seat reservation, appends the
   * decision and enqueues the notification — in one transaction where the
   * deployment supports it.
   *
   * Without transactions the steps run in order and every step is guarded:
   * the seat `$inc` is conditional on capacity, the application update is
   * conditional on `{status, version}`, and the application stores the
   * decision it is about to insert in `lastTransition`, so a retry after a
   * crash re-inserts exactly that decision instead of deciding twice.
   */
  private async applyTransition(
    request: TransitionRequest,
  ): Promise<TransitionResult> {
    const { application, program } = request;
    const fromStatus = application.status;
    const toStatus = DECISION_TARGET_STATUS[request.type];
    const now = new Date();

    const seatChange: SeatChange =
      request.type === DecisionType.ACCEPT
        ? 'reserve'
        : request.type === DecisionType.WITHDRAW &&
            application.reservation?.status === ReservationStatus.HELD
          ? 'release'
          : 'none';

    const decisionId = new Types.ObjectId();
    const decision = {
      _id: decisionId,
      applicationId: application._id,
      programId: program._id,
      applicantId: application.applicantId,
      type: request.type,
      fromStatus,
      toStatus,
      sequence: application.version + 1,
      applicantReasonCode: request.applicantReasonCode,
      applicantMessage: request.applicantMessage,
      internalReasonCode: request.internalReasonCode,
      internalNote: request.internalNote,
      effectiveAt: request.effectiveAt,
      communicationPolicy: request.communicationPolicy,
      actorId: new Types.ObjectId(request.actor.id),
      actorRole: request.actor.role,
      actorKind: request.actorKind,
      idempotencyKey: request.idempotencyKey,
      requestHash: request.requestHash,
    };

    const set: Record<string, unknown> = {
      status: toStatus,
      isActive: isActiveStatus(toStatus),
      lastTransition: {
        idempotencyKey: request.idempotencyKey,
        decisionId,
        decision,
      },
    };
    if (seatChange === 'reserve') {
      set['reservation'] = {
        status: ReservationStatus.HELD,
        heldAt: now,
        releasedAt: null,
      };
    }
    if (seatChange === 'release') {
      set['reservation.status'] = ReservationStatus.RELEASED;
      set['reservation.releasedAt'] = now;
    }
    if (toStatus === ApplicationStatus.WITHDRAWN) {
      set['withdrawnAt'] = now;
    }
    if (CLOSED_STATUSES.has(toStatus)) {
      set['closedAt'] = now;
    }

    const updated = await this.withTransaction(async (session) => {
      const opts = session ? { session } : {};

      if (seatChange === 'reserve') {
        const reserved = await this.programModel
          .updateOne(
            {
              _id: program._id,
              $expr: { $lt: ['$reservedSeats', '$capacity'] },
            },
            { $inc: { reservedSeats: 1 } },
            opts,
          )
          .exec();
        if (reserved.modifiedCount === 0) {
          throw new BusinessRuleException(
            'All seats in this program are reserved; waitlist the applicant instead',
            ErrorCode.BIZ_MENTORSHIP_CAPACITY_REACHED,
          );
        }
      }

      const next = await this.applicationModel
        .findOneAndUpdate(
          {
            _id: application._id,
            status: fromStatus,
            version: application.version,
          },
          { $set: set, $inc: { version: 1 } },
          { ...opts, returnDocument: 'after' },
        )
        .exec();

      if (!next) {
        if (seatChange === 'reserve' && !session) {
          await this.programModel
            .updateOne(
              { _id: program._id, reservedSeats: { $gt: 0 } },
              { $inc: { reservedSeats: -1 } },
            )
            .exec();
        }
        throw new ResourceConflictException(
          'The application changed while this decision was being recorded; reload and retry',
          ErrorCode.BIZ_MENTORSHIP_STALE_VERSION,
        );
      }

      if (seatChange === 'release') {
        await this.programModel
          .updateOne(
            { _id: program._id, reservedSeats: { $gt: 0 } },
            { $inc: { reservedSeats: -1 } },
            opts,
          )
          .exec();
      }

      await this.insertDecisionAndNotification(decision, program, session);
      return next;
    }).catch((error) => {
      if (
        error instanceof BusinessRuleException ||
        error instanceof ResourceConflictException
      ) {
        this.telemetry.requestRejected(
          request.type,
          String(error.errorCode),
          application.id,
        );
      }
      throw error;
    });

    const stored = await this.decisionModel.findById(decisionId).exec();
    return {
      application: updated,
      decision: stored!,
      seatReleased: seatChange === 'release',
      replayed: false,
    };
  }

  private async insertDecisionAndNotification(
    decision: Record<string, unknown>,
    program: MentorshipProgramDocument,
    session: ClientSession | null,
  ): Promise<void> {
    const opts = session ? { session } : {};
    await ignoreDuplicate(this.decisionModel.create([decision], opts));

    if (decision['communicationPolicy'] === CommunicationPolicy.SILENT) {
      return;
    }
    const dispatchAfter =
      decision['communicationPolicy'] ===
      CommunicationPolicy.NOTIFY_AT_EFFECTIVE_TIME
        ? (decision['effectiveAt'] as Date)
        : new Date();
    await ignoreDuplicate(
      this.notificationModel.create(
        [
          {
            decisionId: decision['_id'],
            applicationId: decision['applicationId'],
            applicantId: decision['applicantId'],
            decisionType: decision['type'],
            applicantReasonCode: decision['applicantReasonCode'],
            applicantMessage: decision['applicantMessage'],
            programTitle: program.title,
            dispatchAfter,
            status: NotificationDispatchStatus.PENDING,
          },
        ],
        opts,
      ),
    );
  }

  /**
   * Returns the earlier outcome for a retried request, finishing it first if
   * the previous attempt stopped between the status change and the insert.
   */
  private async replayIfSeen(
    application: MentorshipApplicationDocument,
    idempotencyKey: string,
    requestHash: string,
    operation: string,
  ): Promise<TransitionResult | null> {
    let decision = await this.decisionModel
      .findOne({ applicationId: application._id, idempotencyKey })
      .exec();

    if (
      !decision &&
      application.lastTransition?.idempotencyKey === idempotencyKey
    ) {
      const program = await this.findProgram(application.programId.toString());
      await this.insertDecisionAndNotification(
        application.lastTransition.decision,
        program,
        null,
      );
      decision = await this.decisionModel
        .findById(application.lastTransition.decisionId)
        .exec();
    }

    if (!decision) {
      return null;
    }
    if (decision.requestHash !== requestHash) {
      throw this.keyReused(operation, application.id);
    }
    this.telemetry.idempotentReplay(operation, application.id);
    return {
      application,
      decision,
      seatReleased: false,
      replayed: true,
    };
  }

  private async afterTransition(result: TransitionResult, audit: AuditContext) {
    const { application, decision } = result;
    const isWithdrawal = decision.type === DecisionType.WITHDRAW;

    await this.auditService.record({
      action: isWithdrawal
        ? AuditAction.MENTORSHIP_APPLICATION_WITHDRAWN
        : AuditAction.MENTORSHIP_APPLICATION_DECIDED,
      context: audit,
      target: { type: 'mentorship_application', id: application.id },
      before: { status: decision.fromStatus },
      after: {
        status: decision.toStatus,
        decisionId: decision.id,
        type: decision.type,
        applicantReasonCode: decision.applicantReasonCode,
        internalReasonCode: decision.internalReasonCode,
        effectiveAt: decision.effectiveAt,
        seatReleased: result.seatReleased,
      },
    });

    this.eventEmitter.emit(DomainEvents.MENTORSHIP_APPLICATION_DECIDED, {
      applicationId: application.id,
      programId: application.programId.toString(),
      applicantId: application.applicantId.toString(),
      decisionId: decision.id,
      decisionType: decision.type,
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
      effectiveAt: decision.effectiveAt.toISOString(),
    } satisfies MentorshipApplicationDecidedPayload);

    if (isWithdrawal) {
      this.eventEmitter.emit(DomainEvents.MENTORSHIP_APPLICATION_WITHDRAWN, {
        applicationId: application.id,
        programId: application.programId.toString(),
        applicantId: application.applicantId.toString(),
        decisionId: decision.id,
        seatReleased: result.seatReleased,
      } satisfies MentorshipApplicationWithdrawnPayload);
    }

    this.telemetry.decisionRecorded({
      applicationId: application.id,
      decisionId: decision.id,
      type: decision.type,
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
      actorKind: decision.actorKind,
    });
    if (result.seatReleased) {
      this.telemetry.seatReleased(
        application.programId.toString(),
        application.id,
      );
    }
  }

  // ── Policy helpers ─────────────────────────────────────────────────────────

  private describeReapplication(
    program: MentorshipProgramDocument,
    application: MentorshipApplicationDocument,
    now: Date,
    assumeWithdrawn: boolean,
  ): {
    permitted: boolean;
    mode: ReapplicationMode;
    earliestAt: Date | null;
    attemptsRemaining: number;
    reason?: string;
    errorCode?: ErrorCode;
  } {
    const policy = program.reapplication ?? {
      mode: ReapplicationMode.AFTER_WITHDRAWAL,
      cooldownHours: 0,
      maxAttempts: 3,
    };
    const attemptsRemaining = Math.max(
      0,
      policy.maxAttempts - application.attemptNumber,
    );
    const closedAt = assumeWithdrawn ? now : (application.closedAt ?? now);
    const earliestAt = new Date(
      closedAt.getTime() + (policy.cooldownHours ?? 0) * 3_600_000,
    );
    const status = assumeWithdrawn
      ? ApplicationStatus.WITHDRAWN
      : application.status;
    const base = { mode: policy.mode, earliestAt, attemptsRemaining };

    if (policy.mode === ReapplicationMode.NOT_ALLOWED) {
      return {
        ...base,
        permitted: false,
        earliestAt: null,
        reason: 'This program does not accept reapplications',
        errorCode: ErrorCode.BIZ_MENTORSHIP_REAPPLICATION_NOT_PERMITTED,
      };
    }
    if (
      policy.mode === ReapplicationMode.AFTER_WITHDRAWAL &&
      status !== ApplicationStatus.WITHDRAWN
    ) {
      return {
        ...base,
        permitted: false,
        earliestAt: null,
        reason: 'This program only accepts reapplications after a withdrawal',
        errorCode: ErrorCode.BIZ_MENTORSHIP_REAPPLICATION_NOT_PERMITTED,
      };
    }
    if (attemptsRemaining === 0) {
      return {
        ...base,
        permitted: false,
        earliestAt: null,
        reason: `This program allows at most ${policy.maxAttempts} applications per applicant`,
        errorCode: ErrorCode.BIZ_MENTORSHIP_REAPPLICATION_LIMIT_REACHED,
      };
    }
    if (!assumeWithdrawn && earliestAt > now) {
      return {
        ...base,
        permitted: false,
        reason: `You can reapply from ${earliestAt.toISOString()}`,
        errorCode: ErrorCode.BIZ_MENTORSHIP_REAPPLICATION_COOLDOWN,
      };
    }
    return { ...base, permitted: true };
  }

  private withdrawalCutoffPassed(
    program: MentorshipProgramDocument,
    now: Date,
  ): boolean {
    return !!program.withdrawalCutoffAt && now > program.withdrawalCutoffAt;
  }

  private assertTransitionAllowed(
    application: MentorshipApplicationDocument,
    type: DecisionType,
    operation: string,
  ): void {
    if (application.status === ApplicationStatus.WITHDRAWN) {
      throw this.rejected(
        operation,
        new BusinessRuleException(
          'This application was withdrawn; no further actions are possible',
          ErrorCode.BIZ_MENTORSHIP_APPLICATION_WITHDRAWN,
        ),
        application.id,
      );
    }
    if (CLOSED_STATUSES.has(application.status)) {
      throw this.rejected(
        operation,
        new BusinessRuleException(
          `This application is ${application.status}; no further actions are possible`,
          ErrorCode.BIZ_MENTORSHIP_APPLICATION_CLOSED,
        ),
        application.id,
      );
    }
    if (!canApplyDecision(application.status, type)) {
      const allowed = allowedDecisions(application.status);
      throw this.rejected(
        operation,
        new BusinessRuleException(
          `Cannot ${type} an application that is ${application.status}; allowed: ${allowed.join(', ') || 'none'}`,
          ErrorCode.BIZ_MENTORSHIP_INVALID_TRANSITION,
        ),
        application.id,
      );
    }
  }

  private assertProgramAcceptingApplications(
    program: MentorshipProgramDocument,
    operation: string,
  ): void {
    const closed =
      !program.isOpen ||
      (!!program.applicationsCloseAt &&
        new Date() > program.applicationsCloseAt);
    if (closed) {
      throw this.rejected(
        operation,
        new BusinessRuleException(
          'This program is not accepting applications',
          ErrorCode.BIZ_MENTORSHIP_PROGRAM_CLOSED,
        ),
        program.id,
      );
    }
  }

  private assertConsentCurrent(
    program: MentorshipProgramDocument,
    version: string,
    operation: string,
  ): void {
    if (version !== program.consentVersion) {
      throw this.rejected(
        operation,
        new BusinessRuleException(
          `Consent must be given for the current terms (version ${program.consentVersion})`,
          ErrorCode.BIZ_MENTORSHIP_CONSENT_VERSION_MISMATCH,
        ),
        program.id,
      );
    }
  }

  // ── Authorization (deny by default) ────────────────────────────────────────

  private isApplicant(
    application: MentorshipApplicationDocument,
    actor: RequestActor,
  ): boolean {
    return (
      actor.role === Role.STUDENT &&
      application.applicantId.toString() === actor.id
    );
  }

  private assertApplicant(
    application: MentorshipApplicationDocument,
    actor: RequestActor,
  ): void {
    if (!this.isApplicant(application, actor)) {
      throw new ForbiddenDomainException(
        'Only the applicant can perform this action',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  private assertApplicantRole(actor: RequestActor): void {
    if (actor.role !== Role.STUDENT) {
      throw new ForbiddenDomainException(
        'Only students can apply for mentorship',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  /** Program's own mentor, or platform staff. Everyone else is refused. */
  private assertReviewer(
    program: MentorshipProgramDocument,
    actor: RequestActor,
  ): void {
    const isProgramMentor =
      actor.role === Role.TUTOR && program.mentorId.toString() === actor.id;
    if (!isProgramMentor && !isStaff(actor)) {
      throw new ForbiddenDomainException(
        'Only the program mentor or platform staff can review applications',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  // ── Lookup & response helpers ──────────────────────────────────────────────

  private async findProgram(
    programId: string,
  ): Promise<MentorshipProgramDocument> {
    const program = await this.programModel.findById(programId).exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Mentorship program not found',
        ErrorCode.RES_MENTORSHIP_PROGRAM_NOT_FOUND,
      );
    }
    return program;
  }

  private async findApplication(
    applicationId: string,
  ): Promise<MentorshipApplicationDocument> {
    const application = await this.applicationModel
      .findById(applicationId)
      .exec();
    if (!application) {
      throw new ResourceNotFoundException(
        'Mentorship application not found',
        ErrorCode.RES_MENTORSHIP_APPLICATION_NOT_FOUND,
      );
    }
    return application;
  }

  private findBySubmissionKey(applicantId: string, submissionKey: string) {
    return this.applicationModel
      .findOne({ applicantId: new Types.ObjectId(applicantId), submissionKey })
      .exec();
  }

  private decisionsFor(applicationId: Types.ObjectId) {
    return this.decisionModel
      .find({ applicationId })
      .sort({ sequence: 1 })
      .exec();
  }

  private async applicantView(application: MentorshipApplicationDocument) {
    return toApplicantApplication(
      application,
      await this.decisionsFor(application._id),
      new Date(),
    );
  }

  private decisionResponse(result: TransitionResult) {
    return {
      replayed: result.replayed,
      decision: toInternalDecision(result.decision),
      application: toInternalApplication(result.application),
    };
  }

  private async withdrawalResponse(result: TransitionResult) {
    return {
      replayed: result.replayed,
      seatReleased: result.seatReleased,
      application: await this.applicantView(result.application),
    };
  }

  private toProgramView(program: MentorshipProgramDocument) {
    return {
      id: program.id,
      mentorId: program.mentorId.toString(),
      title: program.title,
      description: program.description,
      capacity: program.capacity,
      seatsRemaining: Math.max(0, program.capacity - program.reservedSeats),
      applicationsCloseAt: program.applicationsCloseAt,
      withdrawalCutoffAt: program.withdrawalCutoffAt,
      consentVersion: program.consentVersion,
      reapplication: program.reapplication,
      isOpen: program.isOpen,
      createdAt: program.createdAt ?? null,
    };
  }

  /**
   * Maps a duplicate-key failure on create back to a stable outcome: the
   * same key means "this already happened", the active-slot index means
   * "you already have a live application".
   */
  private async resolveCreateConflict(
    error: unknown,
    actor: RequestActor,
    idempotencyKey: string,
    operation: string,
  ) {
    if ((error as { code?: number })?.code !== DUPLICATE_KEY_ERROR) {
      throw error;
    }
    const existing = await this.findBySubmissionKey(actor.id, idempotencyKey);
    if (existing) {
      this.telemetry.idempotentReplay(operation, existing.id);
      return this.applicantView(existing);
    }
    throw this.rejected(
      operation,
      new BusinessRuleException(
        'You already have an active application for this program',
        ErrorCode.BIZ_MENTORSHIP_ACTIVE_APPLICATION_EXISTS,
      ),
    );
  }

  private keyReused(operation: string, resourceId: string) {
    return this.rejected(
      operation,
      new ResourceConflictException(
        'This Idempotency-Key was already used for a different request; use a new key',
        ErrorCode.BIZ_MENTORSHIP_IDEMPOTENCY_KEY_REUSED,
      ),
      resourceId,
    );
  }

  private rejected<E extends { errorCode: ErrorCode }>(
    operation: string,
    error: E,
    resourceId?: string,
  ): E {
    this.telemetry.requestRejected(operation, error.errorCode, resourceId);
    return error;
  }

  private async withTransaction<T>(
    work: (session: ClientSession | null) => Promise<T>,
  ): Promise<T> {
    if (this.transactionsSupported === false) {
      return work(null);
    }

    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      this.transactionsSupported = true;
      return result as T;
    } catch (error) {
      if (!this.isUnsupportedTransactionError(error)) {
        throw error;
      }
      this.transactionsSupported = false;
      this.logger.warn(
        'MongoDB deployment does not support transactions; mentorship transitions fall back to guarded staged updates',
      );
      return work(null);
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  private isUnsupportedTransactionError(error: unknown): boolean {
    if (this.transactionsSupported === true) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    const codeName = (error as { codeName?: string } | null)?.codeName;
    return (
      codeName === 'IllegalOperation' ||
      /transaction numbers are only allowed on a replica set/i.test(message) ||
      /transactions are not supported/i.test(message) ||
      /this MongoDB deployment does not support retryable writes/i.test(message)
    );
  }
}

/** Stable hash of a request body, independent of key order. */
function hashRequest(body: object): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify(body))
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Opaque confirmation token for a withdrawal preview. Not a secret — the
 * endpoint is owner-only — it only proves the client confirmed the
 * consequences of the application's current state.
 */
function withdrawalToken(application: MentorshipApplicationDocument): string {
  return crypto
    .createHash('sha256')
    .update(
      `withdraw:${application.id}:${application.version}:${application.status}`,
    )
    .digest('hex')
    .slice(0, 32);
}

async function ignoreDuplicate(write: Promise<unknown>): Promise<void> {
  try {
    await write;
  } catch (error) {
    if ((error as { code?: number })?.code !== DUPLICATE_KEY_ERROR) {
      throw error;
    }
  }
}
