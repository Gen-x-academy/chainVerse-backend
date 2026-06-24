import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateReportAbuseDto } from './dto/create-report-abuse.dto';
import { UpdateReportAbuseDto } from './dto/update-report-abuse.dto';
import {
  AbuseReport,
  AbuseReportDocument,
} from './schemas/report-abuse.schema';

@Injectable()
export class ReportAbuseService {
  constructor(
    @InjectModel(AbuseReport.name)
    private readonly abuseReportModel: Model<AbuseReportDocument>,
  ) {}

  async create(
    reporterUserId: string,
    payload: CreateReportAbuseDto,
  ): Promise<AbuseReport> {
    const report = new this.abuseReportModel({ reporterUserId, ...payload });
    return report.save();
  }

  async findAll(): Promise<AbuseReport[]> {
    return this.abuseReportModel.find().exec();
  }

  async findByReporter(reporterUserId: string): Promise<AbuseReport[]> {
    return this.abuseReportModel.find({ reporterUserId }).exec();
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
  ): Promise<AbuseReport> {
    const report = await this.abuseReportModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!report) {
      throw new NotFoundException('Abuse report not found');
    }
    return report;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.abuseReportModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Abuse report not found');
    }
    return { id, deleted: true };
  }
}
