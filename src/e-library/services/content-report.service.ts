import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException, ResourceConflictException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  ContentReport,
  ContentReportDocument,
  ReportStatus,
} from '../schemas/content-report.schema';
import { CreateContentReportDto } from '../dto/create-content-report.dto';

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10;

@Injectable()
export class ContentReportService {
  private readonly logger = new Logger(ContentReportService.name);

  constructor(
    @InjectModel(ContentReport.name)
    private readonly reportModel: Model<ContentReportDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async create(dto: CreateContentReportDto, reporterId: string): Promise<ContentReportDocument> {
    const dedupKey = `${dto.targetType}:${dto.targetId}:${dto.reasonType}`;
    const existing = await this.reportModel.findOne({ dedupKey }).exec();
    if (existing) {
      throw new ResourceConflictException(
        'A report for this item and reason already exists',
        ErrorCode.BIZ_DUPLICATE_REPORT,
      );
    }

    const recentCount = await this.reportModel.countDocuments({
      reporterId,
      createdAt: { $gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    }).exec();
    if (recentCount >= RATE_LIMIT_MAX) {
      throw new ResourceConflictException(
        'Too many reports submitted. Please try again later.',
        ErrorCode.BIZ_RATE_LIMIT_EXCEEDED,
      );
    }

    return this.reportModel.create({
      reporterId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reasonType: dto.reasonType,
      description: dto.description,
      dedupKey,
    });
  }

  async findById(reportId: string): Promise<ContentReportDocument> {
    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new ResourceNotFoundException(
        'Content report not found',
        ErrorCode.RES_CONTENT_REPORT_NOT_FOUND,
      );
    }
    return report;
  }

  async list(paginationDto: PaginationDto, filters?: { status?: ReportStatus; targetType?: string }) {
    const query: Record<string, unknown> = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.targetType) query.targetType = filters.targetType;
    return this.paginationService.paginate(this.reportModel, paginationDto, query);
  }

  async assign(reportId: string, staffId: string): Promise<ContentReportDocument> {
    const report = await this.findById(reportId);
    report.assignedTo = staffId;
    if (report.status === ReportStatus.OPEN) {
      report.status = ReportStatus.INVESTIGATING;
    }
    return report.save();
  }

  async resolve(
    reportId: string,
    resolutionNotes: string,
    status: ReportStatus.RESOLVED | ReportStatus.DISMISSED,
  ): Promise<ContentReportDocument> {
    const report = await this.findById(reportId);
    report.status = status;
    report.resolutionNotes = resolutionNotes;
    return report.save();
  }

  async findByTarget(targetType: string, targetId: string): Promise<ContentReportDocument[]> {
    return this.reportModel.find({ targetType, targetId }).sort({ createdAt: -1 }).exec();
  }

  /** Returns reporter identity only for staff callers. Strips reporterId for public consumers. */
  sanitizeForPublic(report: ContentReportDocument): Record<string, unknown> {
    const obj = report.toObject();
    const { reporterId: _, ...rest } = obj;
    return rest;
  }
}
