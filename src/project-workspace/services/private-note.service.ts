import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditContext, AuditService } from '../../common/audit';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  CreatePrivateNoteDto,
  NoteVersionDto,
  UpdatePrivateNoteDto,
} from '../dto/project-workspace.dto';
import {
  PrivateNote,
  PrivateNoteDocument,
} from '../schemas/private-note.schema';
import { WorkspaceRole } from '../schemas/project-workspace.schema';
import { PrivateNoteCipher } from '../support/private-note-cipher';
import {
  isDuplicateKeyError,
  normalizeIdempotencyKey,
} from '../support/workspace-rules';
import { WorkspaceAccessService } from './workspace-access.service';

type PlainRecord = Record<string, unknown>;

function toPlain(value: unknown): PlainRecord {
  const candidate = value as { toObject?: () => PlainRecord } | null;
  if (candidate && typeof candidate.toObject === 'function') {
    return candidate.toObject();
  }
  return { ...(value as PlainRecord) };
}

/** Metadata only. Ciphertext, iv and auth tag are intentionally omitted. */
function privateNoteView(
  value: unknown,
  decrypted?: { title: string; content: string },
): PlainRecord {
  const plain = toPlain(value);
  const view: PlainRecord = { ...plain, id: String(plain._id) };
  delete view._id;
  delete view.__v;
  delete view.idempotencyKey;
  delete view.ciphertext;
  delete view.iv;
  delete view.authTag;
  delete view.keyId;
  delete view.algorithm;
  return {
    ...view,
    ...(decrypted
      ? {
          title: decrypted.title,
          content: decrypted.content,
          keyId: plain.keyId,
        }
      : {}),
  };
}

@Injectable()
export class PrivateNoteService {
  constructor(
    @InjectModel(PrivateNote.name)
    private readonly notes: Model<PrivateNoteDocument>,
    private readonly access: WorkspaceAccessService,
    private readonly cipher: PrivateNoteCipher,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: CreatePrivateNoteDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const idempotencyKey = normalizeIdempotencyKey(dto.idempotencyKey);
    if (idempotencyKey) {
      const replay = await this.notes
        .findOne({
          tenantId: workspace.tenantId,
          projectId,
          ownerId: actorId,
          idempotencyKey,
        })
        .exec();
      if (replay) return this.view(replay);
    }

    const envelope = this.cipher.encrypt({
      title: dto.title,
      content: dto.content,
    });
    let created: unknown;
    try {
      created = await this.notes.create({
        tenantId: workspace.tenantId,
        projectId,
        ownerId: actorId,
        ...envelope,
        version: 1,
        archivedAt: null,
        idempotencyKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error) && idempotencyKey) {
        const replay = await this.notes
          .findOne({
            tenantId: workspace.tenantId,
            projectId,
            ownerId: actorId,
            idempotencyKey,
          })
          .exec();
        if (replay) return this.view(replay);
      }
      throw error;
    }

    const view = privateNoteView(created);
    await this.audit.record({
      action: 'private_note.created',
      context: audit,
      target: { type: 'private_note', id: view.id as string },
      after: { id: view.id, projectId },
    });
    this.emit(
      workspace.tenantId,
      projectId,
      actorId,
      audit,
      'private_note.created',
      view.id as string,
    );
    return view;
  }

  async list(actorId: string, projectId: string): Promise<PlainRecord[]> {
    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const notes = await this.notes
      .find({
        tenantId: workspace.tenantId,
        projectId,
        ownerId: actorId,
        archivedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
    return notes.map((note) => privateNoteView(note));
  }

  async findOne(
    actorId: string,
    projectId: string,
    noteId: string,
  ): Promise<PlainRecord> {
    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const note = await this.notes
      .findOne({
        _id: noteId,
        tenantId: workspace.tenantId,
        projectId,
        ownerId: actorId,
        archivedAt: null,
      })
      .exec();
    if (!note) {
      throw new ForbiddenDomainException(
        'Private note not found for this owner',
        ErrorCode.RES_WORKSPACE_PRIVATE_NOTE_NOT_FOUND,
      );
    }
    return this.view(note);
  }

  async update(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    noteId: string,
    dto: UpdatePrivateNoteDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const note = await this.notes
      .findOne({
        _id: noteId,
        tenantId: workspace.tenantId,
        projectId,
        ownerId: actorId,
        archivedAt: null,
      })
      .exec();
    if (!note) {
      throw new ForbiddenDomainException(
        'Private note not found for this owner',
        ErrorCode.RES_WORKSPACE_PRIVATE_NOTE_NOT_FOUND,
      );
    }
    if (note.version !== dto.expectedVersion) {
      throw new BusinessRuleException(
        `Expected private note version ${dto.expectedVersion} but found ${note.version}`,
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
        { expected: dto.expectedVersion, actual: note.version },
      );
    }

    const current = this.cipher.decrypt({
      ciphertext: note.ciphertext,
      iv: note.iv,
      authTag: note.authTag,
      keyId: note.keyId,
      algorithm: note.algorithm,
    });
    const envelope = this.cipher.encrypt({
      title: dto.title ?? current.title,
      content: dto.content ?? current.content,
    });
    const updated = await this.notes
      .findOneAndUpdate(
        {
          _id: noteId,
          tenantId: workspace.tenantId,
          projectId,
          ownerId: actorId,
          version: dto.expectedVersion,
          archivedAt: null,
        },
        { $set: envelope, $inc: { version: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessRuleException(
        'Private note changed concurrently; reload and retry',
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
      );
    }

    await this.audit.record({
      action: 'private_note.updated',
      context: audit,
      target: { type: 'private_note', id: noteId },
      after: { id: noteId, projectId },
    });
    this.emit(
      workspace.tenantId,
      projectId,
      actorId,
      audit,
      'private_note.updated',
      noteId,
    );
    return this.view(updated);
  }

  async archive(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    noteId: string,
    dto: NoteVersionDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const updated = await this.notes
      .findOneAndUpdate(
        {
          _id: noteId,
          tenantId: workspace.tenantId,
          projectId,
          ownerId: actorId,
          version: dto.expectedVersion,
          archivedAt: null,
        },
        { $set: { archivedAt: new Date() }, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new ResourceNotFoundException(
        'Private note not found for this owner or version is stale',
        ErrorCode.RES_WORKSPACE_PRIVATE_NOTE_NOT_FOUND,
      );
    }

    await this.audit.record({
      action: 'private_note.archived',
      context: audit,
      target: { type: 'private_note', id: noteId },
      after: { id: noteId, projectId },
    });
    this.emit(
      workspace.tenantId,
      projectId,
      actorId,
      audit,
      'private_note.archived',
      noteId,
    );
    return privateNoteView(updated);
  }

  private view(note: PrivateNoteDocument): PlainRecord {
    const decrypted = this.cipher.decrypt({
      ciphertext: note.ciphertext,
      iv: note.iv,
      authTag: note.authTag,
      keyId: note.keyId,
      algorithm: note.algorithm,
    });
    return privateNoteView(note, decrypted);
  }

  private emit(
    tenantId: string,
    projectId: string,
    actorId: string,
    audit: AuditContext,
    action: string,
    noteId: string,
  ): void {
    this.events.emit('workspace.activity.recorded', {
      tenantId,
      projectId,
      actorId,
      action,
      targetType: 'private_note',
      targetId: noteId,
      requestId: audit.requestId,
    });
  }
}
