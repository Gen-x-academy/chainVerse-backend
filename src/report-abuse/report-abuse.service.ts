import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateReportAbuseDto } from './dto/create-report-abuse.dto';
import { UpdateReportAbuseDto } from './dto/update-report-abuse.dto';

export interface AbuseReport {
  id: string;
  reporterUserId: string;
  reason: string;
  contentId: string;
  contentType: string;
  status: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ReportAbuseService {
  private readonly reports: AbuseReport[] = [];

  create(reporterUserId: string, payload: CreateReportAbuseDto): AbuseReport {
    const report: AbuseReport = {
      id: crypto.randomUUID(),
      reporterUserId,
      reason: payload.reason,
      contentId: payload.contentId,
      contentType: payload.contentType,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.reports.push(report);
    return report;
  }

  findAll(): AbuseReport[] {
    return this.reports;
  }

  findByReporter(reporterUserId: string): AbuseReport[] {
    return this.reports.filter((r) => r.reporterUserId === reporterUserId);
  }

  findOne(id: string): AbuseReport {
    const report = this.reports.find((r) => r.id === id);
    if (!report) {
      throw new NotFoundException('Abuse report not found');
    }
    return report;
  }

  update(id: string, payload: UpdateReportAbuseDto): AbuseReport {
    const report = this.findOne(id);
    Object.assign(report, { ...payload, updatedAt: new Date() });
    return report;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.reports.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new NotFoundException('Abuse report not found');
    }
    this.reports.splice(index, 1);
    return { id, deleted: true };
  }
}
