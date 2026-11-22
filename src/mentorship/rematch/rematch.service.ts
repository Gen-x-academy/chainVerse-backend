import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';
import {
  ErrorCode,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../../common/errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  CancelRematchDto,
  CloseRematchDto,
  PlanClosureDto,
  ProposeSuccessorDto,
  RequestRematchDto,
  ReviewRematchDto,
} from './dto/rematch.dto';
import {
  BlockerStatus,
  RematchEvent,
  RematchEventDocument,
  REMATCH_TRANSITIONS,
  RematchReasonCode,
  RematchRequest,
  RematchRequestDocument,
  RematchState,
} from './schemas/rematch-request.schema';

export interface RematchActor {
  id: string;
  role: string;
}

/** Client-safe projection: privateReason is only present for the entitled actor. */
export interface RematchView {
  id: string;
  mentorshipId: string;
  requesterId: string;
  counterpartId: string;
  participantIds: string[];
  state: RematchState;
  reasonCode: RematchReasonCode;
  continuityNotes: string | null;
  blockers: RematchRequest['blockers'];
  successorProposal: RematchRequest['successorProposal'];
  version: number;
  closedAt: Date | null;
  privateReason?: string | null;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

@Injectable()
export class RematchService {
  constructor(
    @InjectModel(RematchRequest.name)
    private readonly requests: Model<RematchRequestDocument>,
    @InjectModel(RematchEvent.name)
    private readonly events: Model<RematchEventDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  private count(name: string, labels: Record<string, string> = {}): void {
    try {
      this.telemetry.count(name, labels);
    } catch {
      // Deliberately swallowed.
    }
  }

  private isPrivileged(actor: RematchActor): boolean {
    return actor.role === Role.ADMIN || actor.role === Role.MODERATOR;
  }

  private deny(reason: string, message: string): never {
    this.count('rematch_denied_total', { reason });
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }

  private isParty(actor: RematchActor, doc: RematchRequestDocument): boolean {
    return (
      doc.requesterId === actor.id ||
      doc.counterpartId === actor.id ||
      doc.participantIds.includes(actor.id)
    );
  }

  private canSeePrivate(actor: RematchActor, doc: RematchRequestDocument): boolean {
    return this.isPrivileged(actor) || doc.requesterId === actor.id;
  }

  private toView(doc: RematchRequestDocument, actor: RematchActor): RematchView {
    const view: RematchView = {
      id: String(doc._id),
      mentorshipId: doc.mentorshipId,
      requesterId: doc.requesterId,
      counterpartId: doc.counterpartId,
      participantIds: [...doc.participantIds],
      state: doc.state,
      reasonCode: doc.reasonCode,
      continuityNotes: doc.continuityNotes,
      blockers: doc.blockers,
      successorProposal: doc.successorProposal,
      version: doc.version,
      closedAt: doc.closedAt,
    };
    if (this.canSeePrivate(actor, doc)) view.privateReason = doc.privateReason;
    return view;
  }

  private async load(id: string): Promise<RematchRequestDocument> {
    const doc = await this.requests.findById(id).exec();
    if (!doc) {
      throw new ResourceNotFoundException('REMATCH_NOT_FOUND', ErrorCode.RES_NOT_FOUND);
    }
    return doc;
  }

  private assertNoOpenBlockers(doc: RematchRequestDocument): void {
    const hasOpen = (doc.blockers ?? []).some(
      (blocker) => blocker.status === BlockerStatus.OPEN,
    );
    if (hasOpen) {
      this.count('rematch_blocked_by_case_total');
      throw new ForbiddenDomainException(
        'REMATCH_BLOCKED_BY_OPEN_CASE',
        ErrorCode.BIZ_MENTORSHIP_BLOCKED,
      );
    }
  }

  private async appendEvent(
    doc: RematchRequestDocument,
    fromState: RematchState,
    toState: RematchState,
    actor: RematchActor,
    action: string,
    note: string | null = null,
  ): Promise<void> {
    await this.events.create({
      rematchId: String(doc._id),
      fromState,
      toState,
      actorId: actor.id,
      action,
      note,
      occurredAt: new Date(),
    });
  }

  /** Generic guarded transition; conditional update prevents double transitions. */
  private async transition(
    actor: RematchActor,
    id: string,
    toState: RematchState,
    action: string,
    extra: Record<string, unknown> = {},
    note: string | null = null,
    authorizer: (actor: RematchActor, doc: RematchRequestDocument) => void = () => undefined,
  ): Promise<RematchView> {
    const doc = await this.load(id);
    authorizer(actor, doc);

    if (!REMATCH_TRANSITIONS[doc.state].includes(toState)) {
      this.count('rematch_invalid_transition_total', { from: doc.state, to: toState });
      throw new ForbiddenDomainException(
        'REMATCH_INVALID_TRANSITION',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    const updated = await this.requests
      .findOneAndUpdate(
        { _id: id, state: doc.state, version: doc.version },
        {
          $set: {
            state: toState,
            version: doc.version + 1,
            ...extra,
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      this.count('rematch_transition_conflict_total');
      throw new ForbiddenDomainException(
        'REMATCH_TRANSITION_CONFLICT',
        ErrorCode.BIZ_MENTORSHIP_LIFECYCLE_CONFLICT,
      );
    }

    await this.appendEvent(doc, doc.state, toState, actor, action, note);
    this.count('rematch_transition_total', { action });
    return this.toView(updated, actor);
  }

  /** Open a rematch request. Only a participant may request one. */
  async request(actor: RematchActor, dto: RequestRematchDto): Promise<RematchView> {
    if (!dto.participantIds.includes(actor.id)) {
      this.deny('request_not_participant', 'REMATCH_REQUEST_DENIED');
    }
    if (
      !dto.participantIds.includes(dto.counterpartId) ||
      dto.counterpartId === actor.id
    ) {
      throw new ForbiddenDomainException(
        'REMATCH_COUNTERPART_INVALID',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const existing = await this.requests
      .findOne({ mentorshipId: dto.mentorshipId, requesterId: actor.id })
      .exec();
    if (existing && REMATCH_TRANSITIONS[existing.state].length > 0) {
      this.count('rematch_request_replays_total');
      return this.toView(existing, actor);
    }

    try {
      const doc = await this.requests.create({
        mentorshipId: dto.mentorshipId,
        requesterId: actor.id,
        counterpartId: dto.counterpartId,
        participantIds: [...dto.participantIds],
        state: RematchState.REQUESTED,
        reasonCode: dto.reasonCode,
        privateReason: dto.privateReason ?? null,
        continuityNotes: null,
        blockers: dto.blockers ?? [],
        successorProposal: null,
        version: 1,
        closedAt: null,
      });
      await this.appendEvent(
        doc,
        RematchState.REQUESTED,
        RematchState.REQUESTED,
        actor,
        'requested',
      );
      this.count('rematch_requested_total', { reason: dto.reasonCode });
      return this.toView(doc, actor);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      this.count('rematch_request_replays_total');
      const winner = await this.requests
        .findOne({ mentorshipId: dto.mentorshipId, requesterId: actor.id })
        .exec();
      if (!winner) throw error;
      return this.toView(winner, actor);
    }
  }

  /** Coordinator review of a request. */
  review(actor: RematchActor, id: string, dto: ReviewRematchDto): Promise<RematchView> {
    return this.transition(
      actor,
      id,
      RematchState.REVIEWED,
      'reviewed',
      {},
      dto.note ?? null,
      (caller) => {
        if (!this.isPrivileged(caller)) this.deny('review_not_coordinator', 'REMATCH_REVIEW_DENIED');
      },
    );
  }

  /** Record a non-blaming continuity plan visible to both parties. */
  planClosure(actor: RematchActor, id: string, dto: PlanClosureDto): Promise<RematchView> {
    return this.transition(
      actor,
      id,
      RematchState.CLOSURE_PLANNED,
      'closure_planned',
      { continuityNotes: dto.continuityNotes },
      null,
      (caller, doc) => {
        if (!this.isPrivileged(caller) && !this.isParty(caller, doc)) {
          this.deny('plan_not_party', 'REMATCH_PLAN_DENIED');
        }
      },
    );
  }

  /** Propose a successor; blocked while any financial/safety case is open. */
  async proposeSuccessor(
    actor: RematchActor,
    id: string,
    dto: ProposeSuccessorDto,
  ): Promise<RematchView> {
    const doc = await this.load(id);
    this.assertNoOpenBlockers(doc);
    return this.transition(
      actor,
      id,
      RematchState.PROPOSED,
      'successor_proposed',
      {
        successorProposal: {
          candidateId: dto.candidateId,
          ...(dto.note ? { note: dto.note } : {}),
        },
      },
      dto.note ?? null,
      (caller, current) => {
        if (!this.isPrivileged(caller) && !this.isParty(caller, current)) {
          this.deny('propose_not_party', 'REMATCH_PROPOSE_DENIED');
        }
      },
    );
  }

  /** Close a rematch; blocked while any financial/safety case is open. */
  async close(actor: RematchActor, id: string, dto: CloseRematchDto): Promise<RematchView> {
    const doc = await this.load(id);
    this.assertNoOpenBlockers(doc);
    return this.transition(
      actor,
      id,
      RematchState.CLOSED,
      'closed',
      { closedAt: new Date() },
      dto.note ?? null,
      (caller, current) => {
        if (!this.isPrivileged(caller) && !this.isParty(caller, current)) {
          this.deny('close_not_party', 'REMATCH_CLOSE_DENIED');
        }
      },
    );
  }

  cancel(actor: RematchActor, id: string, dto: CancelRematchDto): Promise<RematchView> {
    return this.transition(
      actor,
      id,
      RematchState.CANCELLED,
      'cancelled',
      {},
      dto.reason ?? null,
      (caller, doc) => {
        if (!this.isPrivileged(caller) && doc.requesterId !== caller.id) {
          this.deny('cancel_not_requester', 'REMATCH_CANCEL_DENIED');
        }
      },
    );
  }

  /** Read a request with a privacy boundary around the private reason. */
  async get(actor: RematchActor, id: string): Promise<RematchView> {
    const doc = await this.load(id);
    if (!this.isPrivileged(actor) && !this.isParty(actor, doc)) {
      this.deny('get_not_party', 'REMATCH_READ_DENIED');
    }
    return this.toView(doc, actor);
  }

  /** Append-only transition history; internal notes are scoped as well. */
  async history(actor: RematchActor, id: string) {
    const doc = await this.load(id);
    if (!this.isPrivileged(actor) && !this.isParty(actor, doc)) {
      this.deny('history_not_party', 'REMATCH_READ_DENIED');
    }
    const events = await this.events
      .find({ rematchId: String(doc._id) })
      .sort({ occurredAt: 1 })
      .exec();
    const canSeePrivate = this.canSeePrivate(actor, doc);
    return events.map((event) => {
      const plain: Record<string, unknown> = {
        id: String(event._id),
        rematchId: event.rematchId,
        fromState: event.fromState,
        toState: event.toState,
        actorId: event.actorId,
        action: event.action,
        occurredAt: event.occurredAt,
      };
      if (canSeePrivate) plain.note = event.note;
      return plain;
    });
  }

  /**
   * Aggregate, non-blaming process metrics only. No per-person scores, no
   * free text and no identifiers are returned.
   */
  async metrics() {
    const docs = await this.requests.find({}).exec();
    const byState: Record<string, number> = {};
    const byReasonCode: Record<string, number> = {};
    let closed = 0;
    let totalDaysToClosure = 0;

    for (const doc of docs) {
      byState[doc.state] = (byState[doc.state] ?? 0) + 1;
      byReasonCode[doc.reasonCode] = (byReasonCode[doc.reasonCode] ?? 0) + 1;
      if (doc.state === RematchState.CLOSED && doc.closedAt && doc.createdAt) {
        closed += 1;
        totalDaysToClosure +=
          (new Date(doc.closedAt).getTime() - new Date(doc.createdAt).getTime()) /
          86_400_000;
      }
    }

    return {
      total: docs.length,
      byState,
      byReasonCode,
      closedCount: closed,
      averageDaysToClosure: closed ? Number((totalDaysToClosure / closed).toFixed(2)) : null,
    };
  }
}
