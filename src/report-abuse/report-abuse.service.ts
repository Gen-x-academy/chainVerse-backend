import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateReportAbuseDto } from './dto/create-report-abuse.dto';
import { UpdateReportAbuseDto } from './dto/update-report-abuse.dto';
import {
  AbuseReport,
  AbuseReportDocument,
} from './schemas/report-abuse.schema';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { snapshot } from '../common/audit/audit-redaction';
import { PaginationService } from '../common/pagination/pagination.service';
import { FindReportsDto } from './dto/find-reports.dto';

const TARGET_TYPE = 'abuse_report';

/** Fields captured in moderation audit snapshots. */
const REPORT_AUDIT_FIELDS = [
  'status',
  'adminNotes',
  'reason',
  'contentId',
  'contentType',
  'reporterUserId',
] as const;

@Injectable()
export class ReportAbuseService {
  constructor(
    @InjectModel(AbuseReport.name)
    private readonly abuseReportModel: Model<AbuseReportDocument>,
    private readonly auditService: AuditService,
    private readonly paginationService: PaginationService,
  ) {}

  async create(
    reporterUserId: string,
    payload: CreateReportAbuseDto,
  ): Promise<AbuseReport> {
    const report = new this.abuseReportModel({ reporterUserId, ...payload });
    return report.save();
  }

  async findAll(paginationDto: FindReportsDto) {
    return this.paginationService.paginate(
      this.abuseReportModel,
      paginationDto,
    );
  }

  async findByReporter(reporterUserId: string, paginationDto: FindReportsDto) {
    return this.paginationService.paginate(
      this.abuseReportModel,
      paginationDto,
      { reporterUserId },
    );
  }

  async findOne(id: string): Promise<AbuseReportDocument> {
    const report = await this.abuseReportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException('Abuse report not found');
    }
    return report;
  }

  async update(
    id: string,
    payload: UpdateReportAbuseDto,
    audit?: AuditContext,
  ): Promise<AbuseReport> {
    // Read first so the audit entry can carry a genuine "before" snapshot.
    const existing = await this.abuseReportModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Abuse report not found');
    }
    const before = snapshot(existing, REPORT_AUDIT_FIELDS);

    const report = await this.abuseReportModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!report) {
      throw new NotFoundException('Abuse report not found');
    }

    await this.auditService.record({
      action: AuditAction.ABUSE_REPORT_UPDATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before,
      after: snapshot(report, REPORT_AUDIT_FIELDS),
    });

    return report;
  }

  async remove(
    id: string,
    audit?: AuditContext,
  ): Promise<{ id: string; deleted: boolean }> {
    const result = await this.abuseReportModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Abuse report not found');
    }

    await this.auditService.record({
      action: AuditAction.ABUSE_REPORT_DELETED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before: snapshot(result, REPORT_AUDIT_FIELDS),
      after: null,
    });

    return { id, deleted: true };
  }
}
