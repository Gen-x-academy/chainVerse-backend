import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { snapshot } from '../common/audit/audit-redaction';
import { PaginationService } from '../common/pagination/pagination.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Role } from '../common/enums/role.enum';

import {
  LibraryConfig,
  LibraryConfigDocument,
} from './schemas/library-config.schema';
import {
  PatronNote,
  PatronNoteDocument,
  NoteClassification,
} from './schemas/patron-note.schema';
import {
  BookReview,
  BookReviewDocument,
  ContentReport,
  ContentReportDocument,
  ReportStatus,
} from './schemas/book-review.schema';

import { UpdateLibraryConfigDto } from './dto/update-library-config.dto';
import {
  CreatePatronNoteDto,
  UpdatePatronNoteDto,
} from './dto/patron-note.dto';
import {
  CreateBookReviewDto,
  CreateContentReportDto,
  ResolveContentReportDto,
} from './dto/book-review.dto';

const CONFIG_KEY = 'default';

@Injectable()
export class LibraryService {
  constructor(
    @InjectModel(LibraryConfig.name)
    private readonly configModel: Model<LibraryConfigDocument>,
    @InjectModel(PatronNote.name)
    private readonly noteModel: Model<PatronNoteDocument>,
    @InjectModel(BookReview.name)
    private readonly reviewModel: Model<BookReviewDocument>,
    @InjectModel(ContentReport.name)
    private readonly reportModel: Model<ContentReportDocument>,
    private readonly auditService: AuditService,
    private readonly paginationService: PaginationService,
  ) {}

  // ─── Library Config (Issue #1058) ────────────────────────────────────────

  async getConfig(): Promise<LibraryConfigDocument> {
    let config = await this.configModel.findOne({ key: CONFIG_KEY }).exec();
    if (!config) {
      config = await this.configModel.create({ key: CONFIG_KEY });
    }
    return config;
  }

  async updateConfig(
    dto: UpdateLibraryConfigDto,
    audit: AuditContext = systemAuditContext(),
  ): Promise<LibraryConfigDocument> {
    const before = await this.getConfig();
    const beforeSnap = snapshot(before, [
      'maxBorrowLimit',
      'loanPeriodDays',
      'gracePeriodDays',
      'dailyFineAmount',
      'reminderDaysBeforeDue',
      'borrowingEnabled',
      'version',
    ]);

    const updated = await this.configModel
      .findOneAndUpdate(
        { key: CONFIG_KEY },
        { ...dto, $inc: { version: 1 } },
        { new: true, upsert: true },
      )
      .exec();

    await this.auditService.record({
      action: AuditAction.LIBRARY_CONFIG_UPDATED,
      context: audit,
      target: { type: 'library_config', id: CONFIG_KEY },
      before: beforeSnap,
      after: snapshot(updated, [
        'maxBorrowLimit',
        'loanPeriodDays',
        'gracePeriodDays',
        'dailyFineAmount',
        'reminderDaysBeforeDue',
        'borrowingEnabled',
        'version',
      ]),
    });

    return updated!;
  }

  // ─── Patron Notes (Issue #1059) ───────────────────────────────────────────

  async createNote(
    dto: CreatePatronNoteDto,
    authorId: string,
    audit: AuditContext = systemAuditContext(),
  ): Promise<PatronNoteDocument> {
    const note = await this.noteModel.create({ ...dto, authorId });

    await this.auditService.record({
      action: AuditAction.PATRON_NOTE_CREATED,
      context: audit,
      target: { type: 'patron_note', id: String(note._id) },
      after: snapshot(note, ['patronId', 'classification', 'authorId']),
    });

    return note;
  }

  /**
   * Returns notes for a patron. RESTRICTED notes are hidden from
   * tutors, students, and general admins – only librarians and admins see them.
   */
  async findNotes(
    patronId: string,
    callerRole: string,
    pagination: PaginationDto,
  ) {
    const canSeeRestricted =
      callerRole === Role.LIBRARIAN || callerRole === Role.ADMIN;

    const filter: Record<string, unknown> = {
      patronId,
      deletedAt: null,
      ...(canSeeRestricted
        ? {}
        : { classification: NoteClassification.GENERAL }),
    };

    return this.paginationService.paginate(this.noteModel, pagination, filter);
  }

  async updateNote(
    id: string,
    dto: UpdatePatronNoteDto,
    audit: AuditContext = systemAuditContext(),
  ): Promise<PatronNoteDocument> {
    const note = await this.noteModel.findOne({ _id: id, deletedAt: null }).exec();
    if (!note) throw new NotFoundException('Patron note not found');

    const before = snapshot(note, ['content', 'classification']);
    Object.assign(note, dto);
    await note.save();

    await this.auditService.record({
      action: AuditAction.PATRON_NOTE_UPDATED,
      context: audit,
      target: { type: 'patron_note', id },
      before,
      after: snapshot(note, ['content', 'classification']),
    });

    return note;
  }

  async deleteNote(
    id: string,
    audit: AuditContext = systemAuditContext(),
  ): Promise<{ id: string; deleted: boolean }> {
    const note = await this.noteModel.findOne({ _id: id, deletedAt: null }).exec();
    if (!note) throw new NotFoundException('Patron note not found');

    note.deletedAt = new Date();
    await note.save();

    await this.auditService.record({
      action: AuditAction.PATRON_NOTE_DELETED,
      context: audit,
      target: { type: 'patron_note', id },
      before: snapshot(note, ['patronId', 'classification', 'authorId']),
      after: null,
    });

    return { id, deleted: true };
  }

  // ─── Book Reviews (Issue #1060) ───────────────────────────────────────────

  async createReview(
    dto: CreateBookReviewDto,
    reviewerId: string,
    audit: AuditContext = systemAuditContext(),
  ): Promise<BookReviewDocument> {
    const review = await this.reviewModel.create({ ...dto, reviewerId });

    await this.auditService.record({
      action: AuditAction.BOOK_REVIEW_CREATED,
      context: audit,
      target: { type: 'book_review', id: String(review._id) },
      after: snapshot(review, ['bookId', 'rating']),
    });

    return review;
  }

  async findReviews(bookId: string, pagination: PaginationDto) {
    return this.paginationService.paginate(this.reviewModel, pagination, {
      bookId,
      deletedAt: null,
    });
  }

  async deleteReview(
    id: string,
    callerId: string,
    callerRole: string,
    audit: AuditContext = systemAuditContext(),
  ): Promise<{ id: string; deleted: boolean }> {
    const review = await this.reviewModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!review) throw new NotFoundException('Review not found');

    // Only the author or staff may remove a review
    const isStaff = [
      Role.ADMIN,
      Role.MODERATOR,
      Role.LIBRARIAN,
    ].includes(callerRole as Role);
    if (review.reviewerId !== callerId && !isStaff) {
      throw new ForbiddenException('Not authorised to delete this review');
    }

    review.deletedAt = new Date();
    await review.save();

    await this.auditService.record({
      action: AuditAction.BOOK_REVIEW_DELETED,
      context: audit,
      target: { type: 'book_review', id },
      before: snapshot(review, ['bookId', 'rating', 'reviewerId']),
      after: null,
    });

    return { id, deleted: true };
  }

  // ─── Content Reports (Issue #1060) ────────────────────────────────────────

  async createReport(
    dto: CreateContentReportDto,
    reporterId: string,
    audit: AuditContext = systemAuditContext(),
  ): Promise<ContentReportDocument> {
    const report = await this.reportModel.create({ ...dto, reporterId });

    await this.auditService.record({
      action: AuditAction.CONTENT_REPORT_CREATED,
      context: audit,
      target: { type: 'content_report', id: String(report._id) },
      after: snapshot(report, ['targetId', 'targetType', 'reason']),
    });

    return report;
  }

  async findReports(pagination: PaginationDto) {
    return this.paginationService.paginate(this.reportModel, pagination);
  }

  async resolveReport(
    id: string,
    dto: ResolveContentReportDto,
    audit: AuditContext = systemAuditContext(),
  ): Promise<ContentReportDocument> {
    const report = await this.reportModel.findById(id).exec();
    if (!report) throw new NotFoundException('Content report not found');

    const before = snapshot(report, ['status', 'resolution', 'assignedTo']);
    report.status = dto.status;
    if (dto.resolution) report.resolution = dto.resolution;
    await report.save();

    await this.auditService.record({
      action: AuditAction.CONTENT_REPORT_RESOLVED,
      context: audit,
      target: { type: 'content_report', id },
      before,
      after: snapshot(report, ['status', 'resolution', 'assignedTo']),
    });

    return report;
  }
}
