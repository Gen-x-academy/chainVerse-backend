import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { isStaff, RequestActor } from '../../common/auth/resource-owner';
import {
  PatronNote,
  PatronNoteDocument,
  NoteClassification,
} from '../schemas/patron-note.schema';
import { CreatePatronNoteDto } from '../dto/create-patron-note.dto';
import { UpdatePatronNoteDto } from '../dto/update-patron-note.dto';

@Injectable()
export class PatronNoteService {
  private readonly logger = new Logger(PatronNoteService.name);

  constructor(
    @InjectModel(PatronNote.name)
    private readonly noteModel: Model<PatronNoteDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async create(
    dto: CreatePatronNoteDto,
    authorId: string,
  ): Promise<PatronNoteDocument> {
    return this.noteModel.create({
      patronId: dto.patronId,
      authorId,
      classification: dto.classification,
      content: dto.content,
      retentionExpiry: new Date(dto.retentionExpiry),
    });
  }

  async findById(noteId: string, actor: RequestActor): Promise<PatronNoteDocument> {
    const note = await this.noteModel.findById(noteId);
    if (!note || note.isDeleted) {
      throw new ResourceNotFoundException(
        'Patron note not found',
        ErrorCode.RES_PATRON_NOTE_NOT_FOUND,
      );
    }

    this.assertReadAccess(note.classification, actor);
    await this.logAccess(noteId, actor.id);
    return note;
  }

  async listByPatron(
    patronId: string,
    paginationDto: PaginationDto,
    actor: RequestActor,
  ) {
    return this.paginationService.paginate(
      this.noteModel,
      paginationDto,
      { patronId, isDeleted: false },
    );
  }

  async update(
    noteId: string,
    dto: UpdatePatronNoteDto,
    actor: RequestActor,
  ): Promise<PatronNoteDocument> {
    const note = await this.noteModel.findById(noteId);
    if (!note || note.isDeleted) {
      throw new ResourceNotFoundException(
        'Patron note not found',
        ErrorCode.RES_PATRON_NOTE_NOT_FOUND,
      );
    }

    this.assertWriteAccess(note.classification, actor);

    const update: Record<string, unknown> = {};
    if (dto.classification !== undefined) update.classification = dto.classification;
    if (dto.content !== undefined) update.content = dto.content;
    if (dto.retentionExpiry !== undefined) update.retentionExpiry = new Date(dto.retentionExpiry);

    Object.assign(note, update);
    return note.save();
  }

  async softDelete(noteId: string, actor: RequestActor): Promise<void> {
    const note = await this.noteModel.findById(noteId);
    if (!note || note.isDeleted) {
      throw new ResourceNotFoundException(
        'Patron note not found',
        ErrorCode.RES_PATRON_NOTE_NOT_FOUND,
      );
    }

    this.assertWriteAccess(note.classification, actor);

    note.isDeleted = true;
    await note.save();
  }

  async enforceRetention(): Promise<{ deleted: number }> {
    const result = await this.noteModel.deleteMany({
      retentionExpiry: { $lte: new Date() },
      isDeleted: false,
    });
    if (result.deletedCount > 0) {
      this.logger.log(`Purged ${result.deletedCount} expired patron notes`);
    }
    return { deleted: result.deletedCount };
  }

  private async logAccess(noteId: string, accessedBy: string): Promise<void> {
    await this.noteModel.updateOne(
      { _id: noteId },
      { $push: { accessAuditLog: { accessedBy, accessedAt: new Date() } } },
    );
  }

  private assertReadAccess(classification: NoteClassification, actor: RequestActor): void {
    if (classification === NoteClassification.RESTRICTED) {
      if (!isStaff(actor)) {
        throw new ResourceNotFoundException(
          'Patron note not found',
          ErrorCode.RES_PATRON_NOTE_NOT_FOUND,
        );
      }
    }
    if (classification === NoteClassification.CONFIDENTIAL && !isStaff(actor)) {
      throw new ResourceNotFoundException(
        'Patron note not found',
        ErrorCode.RES_PATRON_NOTE_NOT_FOUND,
      );
    }
  }

  private assertWriteAccess(classification: NoteClassification, actor: RequestActor): void {
    if (!isStaff(actor)) {
      throw new ResourceNotFoundException(
        'Patron note not found',
        ErrorCode.RES_PATRON_NOTE_NOT_FOUND,
      );
    }
  }
}
