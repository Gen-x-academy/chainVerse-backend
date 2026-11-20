import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditContext, AuditService } from '../../common/audit';
import {
  BusinessRuleException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  CreateNoteDto,
  NoteVersionDto,
  UpdateNoteDto,
} from '../dto/project-workspace.dto';
import {
  NoteStatus,
  ProjectNote,
  ProjectNoteDocument,
} from '../schemas/project-note.schema';
import { WorkspaceRole } from '../schemas/project-workspace.schema';
import { renderSafeMarkdown } from '../support/safe-render';
import {
  assertNoteTransition,
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

function noteView(value: unknown, includeSource = false): PlainRecord {
  const plain = toPlain(value);
  const view: PlainRecord = { ...plain, id: String(plain._id) };
  delete view._id;
  delete view.__v;
  delete view.idempotencyKey;
  const source = view.source;
  delete view.source;
  return {
    ...view,
    ...(includeSource ? { source } : {}),
  };
}

@Injectable()
export class ProjectNoteService {
  constructor(
    @InjectModel(ProjectNote.name)
    private readonly notes: Model<ProjectNoteDocument>,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: CreateNoteDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
    ]);
    const idempotencyKey = normalizeIdempotencyKey(dto.idempotencyKey);
    if (idempotencyKey) {
      const replay = await this.notes
        .findOne({ tenantId: workspace.tenantId, projectId, idempotencyKey })
        .exec();
      if (replay) return noteView(replay);
    }

    await this.assertLinksInProject(
      workspace.tenantId,
      projectId,
      dto.linkedNoteIds ?? [],
    );
    const content = renderSafeMarkdown(dto.content);

    let created: unknown;
    try {
      created = await this.notes.create({
        tenantId: workspace.tenantId,
        projectId,
        authorId: actorId,
        lastEditorId: actorId,
        title: dto.title,
        source: dto.content,
        content,
        status: NoteStatus.DRAFT,
        linkedNoteIds: dto.linkedNoteIds ?? [],
        revisions: [],
        version: 1,
        idempotencyKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error) && idempotencyKey) {
        const replay = await this.notes
          .findOne({ tenantId: workspace.tenantId, projectId, idempotencyKey })
          .exec();
        if (replay) return noteView(replay);
      }
      throw error;
    }

    const view = noteView(created, true);
    await this.audit.record({
      action: 'project_note.created',
      context: audit,
      target: { type: 'project_note', id: view.id as string },
      after: { id: view.id, projectId },
    });
    this.emit(
      workspace.tenantId,
      projectId,
      actorId,
      audit,
      'project_note.created',
      view.id as string,
    );
    return view;
  }

  async list(
    actorId: string,
    projectId: string,
    includeArchived = false,
  ): Promise<PlainRecord[]> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const notes = await this.notes
      .find({
        tenantId: workspace.tenantId,
        projectId,
        ...(includeArchived ? {} : { status: { $ne: NoteStatus.ARCHIVED } }),
      })
      .sort({ createdAt: -1 })
      .exec();
    return notes.map((note) => noteView(note));
  }

  async findOne(
    actorId: string,
    projectId: string,
    noteId: string,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const note = await this.notes
      .findOne({ _id: noteId, tenantId: workspace.tenantId, projectId })
      .exec();
    if (!note) {
      throw new ResourceNotFoundException(
        'Project note not found',
        ErrorCode.RES_WORKSPACE_NOTE_NOT_FOUND,
      );
    }
    return noteView(note, true);
  }

  async update(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
    ]);
    const note = await this.findOwnedNote(
      workspace.tenantId,
      projectId,
      noteId,
    );
    if (note.status === NoteStatus.ARCHIVED) {
      throw new BusinessRuleException(
        'Archived notes cannot be edited',
        ErrorCode.BIZ_WORKSPACE_ARCHIVED,
      );
    }
    if (dto.status) assertNoteTransition(note.status, dto.status);
    if (dto.linkedNoteIds) {
      await this.assertLinksInProject(
        workspace.tenantId,
        projectId,
        dto.linkedNoteIds,
        noteId,
      );
    }

    const set: PlainRecord = { lastEditorId: actorId };
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.content !== undefined) {
      set.source = dto.content;
      set.content = renderSafeMarkdown(dto.content);
    }
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.linkedNoteIds !== undefined) set.linkedNoteIds = dto.linkedNoteIds;

    const revision = {
      version: note.version,
      title: note.title,
      content: note.content,
      editorId: note.lastEditorId,
      at: new Date(),
    };
    const updated = await this.notes
      .findOneAndUpdate(
        {
          _id: noteId,
          tenantId: workspace.tenantId,
          projectId,
          version: dto.expectedVersion,
        },
        { $set: set, $push: { revisions: revision }, $inc: { version: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessRuleException(
        `Expected note version ${dto.expectedVersion} but found ${note.version}`,
        ErrorCode.BIZ_WORKSPACE_NOTE_REVISION_CONFLICT,
        { expected: dto.expectedVersion, actual: note.version },
      );
    }

    await this.audit.record({
      action: 'project_note.updated',
      context: audit,
      target: { type: 'project_note', id: noteId },
      after: { id: noteId, projectId, fields: Object.keys(set) },
    });
    this.emit(
      workspace.tenantId,
      projectId,
      actorId,
      audit,
      'project_note.updated',
      noteId,
    );
    return noteView(updated, true);
  }

  async archive(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    noteId: string,
    dto: NoteVersionDto,
  ): Promise<PlainRecord> {
    return this.update(actorId, audit, projectId, noteId, {
      ...dto,
      status: NoteStatus.ARCHIVED,
    });
  }

  async revisions(
    actorId: string,
    projectId: string,
    noteId: string,
  ): Promise<PlainRecord[]> {
    await this.findOne(actorId, projectId, noteId);
    const note = await this.notes.findById(noteId).exec();
    return (note?.revisions ?? []).map((revision) => ({
      version: revision.version,
      title: revision.title,
      content: revision.content,
      editorId: revision.editorId,
      at: revision.at,
    }));
  }

  private async findOwnedNote(
    tenantId: string,
    projectId: string,
    noteId: string,
  ): Promise<ProjectNoteDocument> {
    const note = await this.notes
      .findOne({ _id: noteId, tenantId, projectId })
      .exec();
    if (!note) {
      throw new ResourceNotFoundException(
        'Project note not found',
        ErrorCode.RES_WORKSPACE_NOTE_NOT_FOUND,
      );
    }
    return note;
  }

  private async assertLinksInProject(
    tenantId: string,
    projectId: string,
    linkedNoteIds: string[],
    excludeId?: string,
  ): Promise<void> {
    const ids = linkedNoteIds.filter((id) => id !== excludeId);
    if (ids.length === 0) return;
    const found = await this.notes
      .find({ _id: { $in: ids }, tenantId, projectId })
      .exec();
    if (found.length !== new Set(ids).size) {
      throw new ValidationDomainException(
        'Linked notes must exist in the same tenant and project',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
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
      targetType: 'project_note',
      targetId: noteId,
      requestId: audit.requestId,
    });
  }
}
