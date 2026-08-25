import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { PaginationDto } from '../common/dto/pagination.dto';

import { LibraryService } from './library.service';
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

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@ApiTags('library')
@Controller('library')
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  // ─── Library Config (Issue #1058) ────────────────────────────────────────

  /**
   * GET /library/config
   * Retrieve current library policy configuration.
   * Accessible by librarians and admins.
   */
  @Get('config')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  getConfig() {
    return this.service.getConfig();
  }

  /**
   * PATCH /library/config
   * Update library policy configuration.
   * Restricted to admins only.
   */
  @Patch('config')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateConfig(
    @Body() dto: UpdateLibraryConfigDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.updateConfig(dto, audit);
  }

  // ─── Patron Notes (Issue #1059) ───────────────────────────────────────────

  /**
   * POST /library/patron-notes
   * Create a staff note on a patron record.
   * Accessible by librarians and admins.
   */
  @Post('patron-notes')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  createNote(
    @Req() req: { user: { id: string } },
    @Body() dto: CreatePatronNoteDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.createNote(dto, req.user.id, audit);
  }

  /**
   * GET /library/patron-notes/:patronId
   * List notes for a patron.
   * RESTRICTED notes are hidden from tutors, students, and general admins.
   */
  @Get('patron-notes/:patronId')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN, Role.MODERATOR)
  findNotes(
    @Param('patronId') patronId: string,
    @Req() req: { user: { role: string } },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findNotes(patronId, req.user.role, pagination);
  }

  /**
   * PATCH /library/patron-notes/:id
   * Update a patron note.
   */
  @Patch('patron-notes/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  updateNote(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: UpdatePatronNoteDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.updateNote(id, dto, audit);
  }

  /**
   * DELETE /library/patron-notes/:id
   * Soft-delete a patron note.
   */
  @Delete('patron-notes/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  deleteNote(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.deleteNote(id, audit);
  }

  // ─── Book Reviews (Issue #1060) ───────────────────────────────────────────

  /**
   * POST /library/reviews
   * Submit a book review. Accessible by students and tutors.
   */
  @Post('reviews')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TUTOR)
  createReview(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateBookReviewDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.createReview(dto, req.user.id, audit);
  }

  /**
   * GET /library/reviews/:bookId
   * List reviews for a book. Accessible by all authenticated users.
   */
  @Get('reviews/:bookId')
  findReviews(
    @Param('bookId') bookId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findReviews(bookId, pagination);
  }

  /**
   * DELETE /library/reviews/:id
   * Remove a review. Authors may delete their own; staff may delete any.
   */
  @Delete('reviews/:id')
  deleteReview(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Req() req: { user: { id: string; role: string } },
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.deleteReview(id, req.user.id, req.user.role, audit);
  }

  // ─── Content Reports (Issue #1060) ────────────────────────────────────────

  /**
   * POST /library/content-reports
   * Submit a content report. Accessible by students and tutors.
   */
  @Post('content-reports')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TUTOR)
  createReport(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateContentReportDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.createReport(dto, req.user.id, audit);
  }

  /**
   * GET /library/content-reports
   * List all content reports. Staff only.
   */
  @Get('content-reports')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN, Role.MODERATOR)
  findReports(@Query() pagination: PaginationDto) {
    return this.service.findReports(pagination);
  }

  /**
   * PATCH /library/content-reports/:id/resolve
   * Resolve or dismiss a content report.
   */
  @Patch('content-reports/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN, Role.MODERATOR)
  resolveReport(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ResolveContentReportDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.resolveReport(id, dto, audit);
  }
}
