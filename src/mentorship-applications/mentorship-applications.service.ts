import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isValidObjectId, Model } from 'mongoose';
import {
  BusinessRuleException,
  DomainException,
  ErrorCode,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors';
import { DomainEvents } from '../events/event-names';
import { MentorshipApplicationSubmittedPayload } from '../events/payloads/mentorship-application-submitted.payload';
import {
  MentorshipApplication,
  MentorshipApplicationDocument,
} from './schemas/mentorship-application.schema';
import {
  ANSWER_FIELD_PREFIX,
  ApplicationStatus,
  DRAFT_FIELDS,
  MAX_SAVE_ATTEMPTS,
  QUESTION_KEY_PATTERN,
  SAVE_RECEIPT_LIMIT,
} from './mentorship-applications.constants';
import {
  FormRecord,
  MentorshipApplicationFormsService,
} from './mentorship-application-forms.service';
import { MentorshipApplicationsTelemetry } from './mentorship-applications.telemetry';
import { ApplicationFieldsDto } from './dto/application-fields.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';

type ApplicationRecord = MentorshipApplication & { _id: unknown };

/** Client-facing projection; internal bookkeeping fields are omitted. */
export interface ApplicationView {
  id: string;
  programId: string;
  formVersion: number;
  status: ApplicationStatus;
  goals?: string;
  expectations?: string;
  schedule?: MentorshipApplication['schedule'];
  preferredMode?: MentorshipApplication['preferredMode'];
  answers: Record<string, string>;
  consent?: MentorshipApplication['consent'];
  revision: number;
  fieldUpdatedAt: Record<string, Date>;
  lastSavedAt: Date;
  submittedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ApplicationResult {
  application: ApplicationView;
  /** True when the response replays an earlier identical request. */
  replayed: boolean;
}

export interface SaveDraftResult extends ApplicationResult {
  /** Fields written by this save (empty when nothing changed). */
  savedFields: string[];
}

export interface RebaseResult extends ApplicationResult {
  /** Answers dropped because their question no longer exists. */
  removedAnswers: string[];
}

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const NOT_FOUND_MESSAGE = 'Mentorship application not found';

@Injectable()
export class MentorshipApplicationsService {
  constructor(
    @InjectModel(MentorshipApplication.name)
    private readonly applicationModel: Model<MentorshipApplicationDocument>,
    private readonly forms: MentorshipApplicationFormsService,
    private readonly telemetry: MentorshipApplicationsTelemetry,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async listMine(menteeId: string, programId?: string): Promise<ApplicationView[]> {
    const docs = await this.applicationModel
      .find({ menteeId, ...(programId && { programId }) })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean<ApplicationRecord[]>()
      .exec();
    return docs.map((doc) => this.toView(doc));
  }

  async getMine(menteeId: string, id: string): Promise<ApplicationView> {
    return this.toView(await this.findOwned(menteeId, id));
  }

  // ── Create (MENTOR-030) ────────────────────────────────────────────────────

  /**
   * Starts a draft application. Retries carrying the same Idempotency-Key
   * return the original draft; any other attempt to open a second active
   * application for the same program is rejected.
   */
  async create(
    menteeId: string,
    dto: CreateApplicationDto,
    idempotencyKey?: string,
  ): Promise<ApplicationResult> {
    this.assertIdempotencyKey(idempotencyKey);

    if (idempotencyKey) {
      const replay = await this.findCreationReplay(
        menteeId,
        idempotencyKey,
        dto.programId,
      );
      if (replay) return replay;
    }

    const form = await this.forms.getCurrentOrThrow(dto.programId);
    const { programId, ...fields } = dto;
    const changes = this.extractChanges(fields);
    this.validateAnswers(changes, form);

    const now = new Date();
    const doc: Record<string, unknown> = {
      menteeId,
      programId,
      formVersion: form.version,
      status: ApplicationStatus.DRAFT,
      active: true,
      answers: {},
      revision: 1,
      fieldRevisions: {},
      fieldUpdatedAt: {},
      lastSavedAt: now,
      ...(idempotencyKey && { creationKey: idempotencyKey }),
    };
    for (const [field, value] of changes) {
      if (value === null) continue;
      const stored = this.toStoredValue(field, value, now);
      if (field.startsWith(ANSWER_FIELD_PREFIX)) {
        (doc.answers as Record<string, unknown>)[this.answerKey(field)] = stored;
      } else {
        doc[field] = stored;
      }
      (doc.fieldRevisions as Record<string, number>)[field] = 1;
      (doc.fieldUpdatedAt as Record<string, Date>)[field] = now;
    }

    try {
      const created = await this.applicationModel.create(doc);
      const view = this.toView(created.toObject() as ApplicationRecord);
      this.telemetry.draftCreated(view.id, programId, false);
      return { application: view, replayed: false };
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) throw err;

      // A concurrent retry with the same key won the race.
      if (idempotencyKey) {
        const replay = await this.findCreationReplay(
          menteeId,
          idempotencyKey,
          programId,
        );
        if (replay) return replay;
      }

      const existing = await this.applicationModel
        .findOne({ menteeId, programId, active: true })
        .select({ _id: 1, status: 1 })
        .lean<{ _id: unknown; status: ApplicationStatus }>()
        .exec();
      throw this.reject(
        'create',
        new ResourceConflictException(
          'You already have an active application for this program',
          ErrorCode.BIZ_ACTIVE_APPLICATION_EXISTS,
          existing
            ? { applicationId: String(existing._id), status: existing.status }
            : undefined,
        ),
      );
    }
  }

  // ── Autosave (MENTOR-031) ──────────────────────────────────────────────────

  /**
   * Applies a partial draft update using optimistic concurrency.
   *
   * - A field changed on the server after `baseRevision` is a conflict unless
   *   the incoming value is identical; conflicts are returned, never
   *   overwritten.
   * - Non-overlapping edits from different devices merge.
   * - A retried `saveId` replays the original result without re-applying.
   * - The write is a compare-and-swap on the current revision, so two
   *   concurrent saves can never both apply against the same base.
   */
  async saveDraft(
    menteeId: string,
    id: string,
    dto: SaveDraftDto,
  ): Promise<SaveDraftResult> {
    const { baseRevision, saveId, ...fields } = dto;
    const changes = this.extractChanges(fields);

    for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt++) {
      const app = await this.findOwned(menteeId, id);

      if (saveId) {
        const receipt = app.recentSaves?.find((r) => r.saveId === saveId);
        if (receipt) {
          const view = this.toView(app);
          this.telemetry.draftSaved(view.id, receipt.revision, [], attempt, true);
          return { application: view, replayed: true, savedFields: [] };
        }
      }

      this.assertDraft(app, 'save');

      if (baseRevision > app.revision) {
        throw this.reject(
          'save',
          new ValidationDomainException(
            `baseRevision ${baseRevision} is ahead of the current revision ${app.revision}`,
            ErrorCode.VAL_INVALID_REVISION,
            { currentRevision: app.revision },
          ),
          id,
        );
      }

      const form = await this.formForDraft(app);
      this.validateAnswers(changes, form);

      const applied = new Map<string, unknown>();
      const conflicts: Array<{
        field: string;
        serverValue: unknown;
        serverUpdatedAt: Date | null;
      }> = [];

      for (const [field, value] of changes) {
        const serverValue = this.readField(app, field);
        if (this.sameValue(field, serverValue, value)) continue;

        if ((app.fieldRevisions?.[field] ?? 0) > baseRevision) {
          conflicts.push({
            field,
            serverValue: serverValue ?? null,
            serverUpdatedAt: app.fieldUpdatedAt?.[field] ?? null,
          });
        } else {
          applied.set(field, value);
        }
      }

      if (conflicts.length) {
        this.telemetry.draftConflict(
          id,
          baseRevision,
          app.revision,
          conflicts.map((c) => c.field),
        );
        throw this.reject(
          'save',
          new ResourceConflictException(
            'The draft was changed elsewhere. Review the conflicting fields and save again.',
            ErrorCode.BIZ_DRAFT_REVISION_CONFLICT,
            { currentRevision: app.revision, conflicts },
          ),
          id,
        );
      }

      if (!applied.size) {
        return { application: this.toView(app), replayed: false, savedFields: [] };
      }

      const now = new Date();
      const nextRevision = app.revision + 1;
      const $set: Record<string, unknown> = {
        revision: nextRevision,
        lastSavedAt: now,
      };
      const $unset: Record<string, ''> = {};
      for (const [field, value] of applied) {
        const path = this.fieldPath(field);
        if (value === null) {
          $unset[path] = '';
        } else {
          $set[path] = this.toStoredValue(field, value, now);
        }
        $set[`fieldRevisions.${field}`] = nextRevision;
        $set[`fieldUpdatedAt.${field}`] = now;
      }

      const update: Record<string, unknown> = { $set };
      if (Object.keys($unset).length) update.$unset = $unset;
      if (saveId) {
        update.$push = {
          recentSaves: {
            $each: [{ saveId, revision: nextRevision }],
            $slice: -SAVE_RECEIPT_LIMIT,
          },
        };
      }

      const saved = await this.applicationModel
        .findOneAndUpdate(
          {
            _id: id,
            menteeId,
            status: ApplicationStatus.DRAFT,
            revision: app.revision,
          },
          update,
          { new: true },
        )
        .lean<ApplicationRecord>()
        .exec();

      if (saved) {
        const savedFields = [...applied.keys()];
        this.telemetry.draftSaved(id, nextRevision, savedFields, attempt, false);
        return { application: this.toView(saved), replayed: false, savedFields };
      }
      // Lost the compare-and-swap to a concurrent write: re-read and re-check.
    }

    throw this.reject(
      'save',
      new ResourceConflictException(
        'The draft is being edited concurrently; reload and try again',
        ErrorCode.BIZ_DRAFT_REVISION_CONFLICT,
      ),
      id,
    );
  }

  /**
   * Moves a draft onto the program's current form version, dropping answers
   * to questions that no longer exist.
   */
  async rebaseToCurrentForm(
    menteeId: string,
    id: string,
    revision: number,
  ): Promise<RebaseResult> {
    const app = await this.findOwned(menteeId, id);
    this.assertDraft(app, 'rebase');
    this.assertRevision(app, revision, 'rebase');

    const form = await this.forms.getCurrentOrThrow(app.programId);
    if (form.version === app.formVersion) {
      return { application: this.toView(app), replayed: true, removedAnswers: [] };
    }

    const validKeys = new Set(form.questions.map((q) => q.key));
    const removedAnswers = Object.keys(app.answers ?? {}).filter(
      (key) => !validKeys.has(key),
    );

    const now = new Date();
    const nextRevision = app.revision + 1;
    const $set: Record<string, unknown> = {
      formVersion: form.version,
      revision: nextRevision,
      lastSavedAt: now,
    };
    const $unset: Record<string, ''> = {};
    for (const key of removedAnswers) {
      const field = `${ANSWER_FIELD_PREFIX}${key}`;
      $unset[this.fieldPath(field)] = '';
      $set[`fieldRevisions.${field}`] = nextRevision;
      $set[`fieldUpdatedAt.${field}`] = now;
    }

    const update: Record<string, unknown> = { $set };
    if (removedAnswers.length) update.$unset = $unset;

    const saved = await this.applicationModel
      .findOneAndUpdate(
        {
          _id: id,
          menteeId,
          status: ApplicationStatus.DRAFT,
          revision: app.revision,
        },
        update,
        { new: true },
      )
      .lean<ApplicationRecord>()
      .exec();

    if (!saved) {
      throw this.reject(
        'rebase',
        new ResourceConflictException(
          'The draft changed while rebasing; reload and try again',
          ErrorCode.BIZ_DRAFT_REVISION_CONFLICT,
        ),
        id,
      );
    }

    this.telemetry.draftRebased(id, app.formVersion, form.version);
    return { application: this.toView(saved), replayed: false, removedAnswers };
  }

  async discardDraft(menteeId: string, id: string): Promise<{ id: string; deleted: true }> {
    const app = await this.findOwned(menteeId, id);
    this.assertDraft(app, 'discard');

    const result = await this.applicationModel
      .deleteOne({ _id: id, menteeId, status: ApplicationStatus.DRAFT })
      .exec();
    if (result.deletedCount === 0) {
      // Submitted between the read and the delete.
      throw this.reject(
        'discard',
        new ResourceConflictException(
          'Only draft applications can be discarded',
          ErrorCode.BIZ_APPLICATION_NOT_DRAFT,
        ),
        id,
      );
    }

    this.telemetry.draftDiscarded(id);
    return { id, deleted: true };
  }

  // ── Submit (MENTOR-030) ────────────────────────────────────────────────────

  /**
   * Atomically transitions a complete draft to `submitted`. The transition is
   * a single conditional update on (status = draft, revision = reviewed), so
   * a concurrent autosave or a duplicate submit cannot interleave with it.
   */
  async submit(
    menteeId: string,
    id: string,
    dto: SubmitApplicationDto,
    idempotencyKey?: string,
  ): Promise<ApplicationResult> {
    this.assertIdempotencyKey(idempotencyKey);
    const app = await this.findOwned(menteeId, id);

    if (app.status === ApplicationStatus.SUBMITTED) {
      if (this.isSubmitReplay(app, dto.revision, idempotencyKey)) {
        this.telemetry.submitted(id, app.programId, true);
        return { application: this.toView(app), replayed: true };
      }
      this.assertDraft(app, 'submit');
    }

    this.assertRevision(app, dto.revision, 'submit');

    const form = await this.forms.findCurrent(app.programId);
    if (!form || form.version !== app.formVersion) {
      throw this.reject(
        'submit',
        new BusinessRuleException(
          'The application form has changed. Rebase the draft onto the current form and review it before submitting.',
          ErrorCode.BIZ_FORM_VERSION_OUTDATED,
          { draftFormVersion: app.formVersion, currentFormVersion: form?.version ?? null },
        ),
        id,
      );
    }

    const missingFields = this.findMissingFields(app, form);
    if (missingFields.length) {
      throw this.reject(
        'submit',
        new BusinessRuleException(
          'The application is incomplete',
          ErrorCode.BIZ_APPLICATION_INCOMPLETE,
          { missingFields },
        ),
        id,
      );
    }

    const now = new Date();
    const submitted = await this.applicationModel
      .findOneAndUpdate(
        {
          _id: id,
          menteeId,
          status: ApplicationStatus.DRAFT,
          revision: app.revision,
        },
        {
          $set: {
            status: ApplicationStatus.SUBMITTED,
            submittedAt: now,
            revision: app.revision + 1,
            lastSavedAt: now,
            ...(idempotencyKey && { submissionKey: idempotencyKey }),
          },
          $unset: { recentSaves: '' },
        },
        { new: true },
      )
      .lean<ApplicationRecord>()
      .exec();

    if (!submitted) {
      // Either a concurrent submit won (treat as replay) or the draft changed.
      const latest = await this.findOwned(menteeId, id);
      if (
        latest.status === ApplicationStatus.SUBMITTED &&
        this.isSubmitReplay(latest, dto.revision, idempotencyKey)
      ) {
        this.telemetry.submitted(id, latest.programId, true);
        return { application: this.toView(latest), replayed: true };
      }
      throw this.reject(
        'submit',
        new ResourceConflictException(
          'The draft changed before it could be submitted; review it and try again',
          ErrorCode.BIZ_DRAFT_REVISION_CONFLICT,
          { currentRevision: latest.revision },
        ),
        id,
      );
    }

    const payload: MentorshipApplicationSubmittedPayload = {
      applicationId: id,
      menteeId,
      programId: submitted.programId,
      formVersion: submitted.formVersion,
      submittedAt: now,
    };
    this.eventEmitter.emit(DomainEvents.MENTORSHIP_APPLICATION_SUBMITTED, payload);
    this.telemetry.submitted(id, submitted.programId, false);

    return { application: this.toView(submitted), replayed: false };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Loads an application owned by the mentee. Unknown ids and other users'
   * applications are indistinguishable (404) so existence is not leaked.
   */
  private async findOwned(menteeId: string, id: string): Promise<ApplicationRecord> {
    if (!isValidObjectId(id)) {
      throw new ResourceNotFoundException(
        NOT_FOUND_MESSAGE,
        ErrorCode.RES_MENTORSHIP_APPLICATION_NOT_FOUND,
      );
    }
    const app = await this.applicationModel
      .findOne({ _id: id, menteeId })
      .lean<ApplicationRecord>()
      .exec();
    if (!app) {
      throw new ResourceNotFoundException(
        NOT_FOUND_MESSAGE,
        ErrorCode.RES_MENTORSHIP_APPLICATION_NOT_FOUND,
      );
    }
    return app;
  }

  private async findCreationReplay(
    menteeId: string,
    creationKey: string,
    programId: string,
  ): Promise<ApplicationResult | null> {
    const existing = await this.applicationModel
      .findOne({ menteeId, creationKey })
      .lean<ApplicationRecord>()
      .exec();
    if (!existing) return null;

    if (existing.programId !== programId) {
      throw this.reject(
        'create',
        new BusinessRuleException(
          'Idempotency-Key was already used for a different request',
          ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
        ),
      );
    }
    const view = this.toView(existing);
    this.telemetry.draftCreated(view.id, programId, true);
    return { application: view, replayed: true };
  }

  private async formForDraft(app: ApplicationRecord): Promise<FormRecord> {
    const form = await this.forms.findVersion(app.programId, app.formVersion);
    if (!form) {
      throw new ResourceNotFoundException(
        'The form version for this draft no longer exists',
        ErrorCode.RES_MENTORSHIP_FORM_NOT_FOUND,
      );
    }
    return form;
  }

  private isSubmitReplay(
    app: ApplicationRecord,
    reviewedRevision: number,
    idempotencyKey?: string,
  ): boolean {
    if (idempotencyKey && app.submissionKey) {
      return idempotencyKey === app.submissionKey;
    }
    // Without keys, a retry is recognised by targeting the submitted revision.
    return reviewedRevision + 1 === app.revision;
  }

  private assertDraft(app: ApplicationRecord, operation: string): void {
    if (app.status !== ApplicationStatus.DRAFT) {
      throw this.reject(
        operation,
        new ResourceConflictException(
          'This application has been submitted and can no longer be edited as a draft',
          ErrorCode.BIZ_APPLICATION_NOT_DRAFT,
          { status: app.status },
        ),
        String(app._id),
      );
    }
  }

  private assertRevision(
    app: ApplicationRecord,
    revision: number,
    operation: string,
  ): void {
    if (revision !== app.revision) {
      throw this.reject(
        operation,
        new ResourceConflictException(
          'The draft has changed since you last loaded it; reload and review it',
          ErrorCode.BIZ_DRAFT_REVISION_CONFLICT,
          { currentRevision: app.revision },
        ),
        String(app._id),
      );
    }
  }

  private assertIdempotencyKey(key?: string): void {
    if (key !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new ValidationDomainException(
        'Idempotency-Key must be 8–128 characters of letters, digits, "-" or "_"',
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }
  }

  /** Flattens DTO fields into `field -> value` (null clears the field). */
  private extractChanges(dto: ApplicationFieldsDto): Map<string, unknown> {
    const changes = new Map<string, unknown>();
    const source = dto as Record<string, unknown>;

    for (const field of DRAFT_FIELDS) {
      if (source[field] === undefined) continue;
      changes.set(field, source[field] === null ? null : this.toPlain(source[field]));
    }

    if (dto.schedule) {
      const invalid = dto.schedule.availability.find(
        (slot) => slot.endTime <= slot.startTime,
      );
      if (invalid) {
        throw new ValidationDomainException(
          'Each availability slot must end after it starts',
          ErrorCode.VAL_OUT_OF_RANGE,
        );
      }
    }

    for (const [key, value] of Object.entries(dto.answers ?? {})) {
      if (!QUESTION_KEY_PATTERN.test(key)) {
        throw new ValidationDomainException(
          `Invalid answer key "${key}"`,
          ErrorCode.VAL_UNKNOWN_FORM_FIELD,
        );
      }
      if (value !== null && typeof value !== 'string') {
        throw new ValidationDomainException(
          `Answer "${key}" must be a string or null`,
          ErrorCode.VAL_INVALID_FORMAT,
        );
      }
      changes.set(`${ANSWER_FIELD_PREFIX}${key}`, value);
    }

    return changes;
  }

  private validateAnswers(changes: Map<string, unknown>, form: FormRecord): void {
    const questions = new Map(form.questions.map((q) => [q.key, q]));
    for (const [field, value] of changes) {
      if (!field.startsWith(ANSWER_FIELD_PREFIX)) continue;
      const key = this.answerKey(field);
      const question = questions.get(key);
      if (!question) {
        throw new ValidationDomainException(
          `"${key}" is not a question on form version ${form.version}`,
          ErrorCode.VAL_UNKNOWN_FORM_FIELD,
          { formVersion: form.version },
        );
      }
      if (typeof value === 'string' && value.length > question.maxLength) {
        throw new ValidationDomainException(
          `Answer "${key}" exceeds ${question.maxLength} characters`,
          ErrorCode.VAL_OUT_OF_RANGE,
        );
      }
    }
  }

  private findMissingFields(app: ApplicationRecord, form: FormRecord): string[] {
    const missing: string[] = [];
    if (!app.goals?.trim()) missing.push('goals');
    if (!app.expectations?.trim()) missing.push('expectations');
    if (!app.schedule?.timezone || !app.schedule.availability?.length) {
      missing.push('schedule');
    }
    if (!app.preferredMode) missing.push('preferredMode');
    if (
      !app.consent?.termsAccepted ||
      !app.consent.dataProcessingAccepted ||
      app.consent.consentVersion !== form.consentVersion
    ) {
      missing.push('consent');
    }
    for (const question of form.questions) {
      if (question.required && !app.answers?.[question.key]?.trim()) {
        missing.push(`${ANSWER_FIELD_PREFIX}${question.key}`);
      }
    }
    return missing;
  }

  private readField(app: ApplicationRecord, field: string): unknown {
    if (field.startsWith(ANSWER_FIELD_PREFIX)) {
      return app.answers?.[this.answerKey(field)];
    }
    return (app as unknown as Record<string, unknown>)[field];
  }

  /** Compares values as the client sees them (server-set metadata ignored). */
  private sameValue(field: string, a: unknown, b: unknown): boolean {
    return this.canonical(field, a) === this.canonical(field, b);
  }

  private canonical(field: string, value: unknown): string {
    if (value === undefined || value === null) return 'null';
    let comparable = value;
    if (field === 'consent') {
      const { termsAccepted, dataProcessingAccepted, consentVersion } =
        value as Record<string, unknown>;
      comparable = { termsAccepted, dataProcessingAccepted, consentVersion };
    }
    return stableStringify(comparable);
  }

  private toStoredValue(field: string, value: unknown, now: Date): unknown {
    if (field === 'consent') {
      const consent = value as Record<string, unknown>;
      return {
        ...consent,
        ...(consent.termsAccepted && consent.dataProcessingAccepted
          ? { acceptedAt: now }
          : {}),
      };
    }
    return value;
  }

  private fieldPath(field: string): string {
    return field.startsWith(ANSWER_FIELD_PREFIX)
      ? `answers.${this.answerKey(field)}`
      : field;
  }

  private answerKey(field: string): string {
    return field.slice(ANSWER_FIELD_PREFIX.length);
  }

  private toPlain(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (err as { code?: number })?.code === 11000;
  }

  private reject<T extends DomainException>(
    operation: string,
    error: T,
    applicationId?: string,
  ): T {
    this.telemetry.rejected(operation, error.errorCode, applicationId);
    return error;
  }

  private toView(app: ApplicationRecord): ApplicationView {
    return {
      id: String(app._id),
      programId: app.programId,
      formVersion: app.formVersion,
      status: app.status,
      goals: app.goals,
      expectations: app.expectations,
      schedule: app.schedule,
      preferredMode: app.preferredMode,
      answers: app.answers ?? {},
      consent: app.consent,
      revision: app.revision,
      fieldUpdatedAt: app.fieldUpdatedAt ?? {},
      lastSavedAt: app.lastSavedAt,
      submittedAt: app.submittedAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
