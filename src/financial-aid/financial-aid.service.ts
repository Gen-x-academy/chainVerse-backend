import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateFinancialAidDto } from './dto/create-financial-aid.dto';
import { UpdateFinancialAidDto } from './dto/update-financial-aid.dto';
import { DomainEvents } from '../events/event-names';
import { FinancialAidApprovedPayload } from '../events/payloads/financial-aid-approved.payload';

export interface FinancialAidApplication {
  id: string;
  studentId: string;
  courseId: string;
  reason: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateFinancialAidDto } from './dto/create-financial-aid.dto';
import { UpdateFinancialAidDto } from './dto/update-financial-aid.dto';
import {
  FinancialAid,
  FinancialAidDocument,
} from './schemas/financial-aid.schema';

@Injectable()
export class FinancialAidService {
  constructor(
    @InjectModel(FinancialAid.name)
    private readonly financialAidModel: Model<FinancialAidDocument>,
  ) {}

  constructor(private readonly eventEmitter: EventEmitter2) {}

  create(payload: CreateFinancialAidDto): FinancialAidApplication {
    const application: FinancialAidApplication = {
      id: crypto.randomUUID(),
  async create(payload: CreateFinancialAidDto): Promise<FinancialAid> {
    const application = new this.financialAidModel({
      studentId: payload.studentId,
      courseId: payload.courseId,
      reason: payload.reason,
    });
    return application.save();
  }

  async findAll(): Promise<FinancialAid[]> {
    return this.financialAidModel.find().exec();
  }

  async findByStudentId(studentId: string): Promise<FinancialAid[]> {
    return this.financialAidModel.find({ studentId }).exec();
  }

  async findOne(id: string): Promise<FinancialAidDocument> {
    const application = await this.financialAidModel.findById(id).exec();
    if (!application) {
      throw new NotFoundException('Financial aid application not found');
    }
    return application;
  }

  update(id: string, payload: UpdateFinancialAidDto): FinancialAidApplication {
    const application = this.findOne(id);
    const wasApproved = application.status === 'approved';
    if (payload.reason !== undefined) application.reason = payload.reason;
    if (payload.status !== undefined) application.status = payload.status;
    application.updatedAt = new Date();

    if (!wasApproved && application.status === 'approved') {
      this.eventEmitter.emit(
        DomainEvents.FINANCIAL_AID_APPROVED,
        Object.assign(new FinancialAidApprovedPayload(), {
          applicationId: application.id,
          studentId: application.studentId,
          courseId: application.courseId,
        }),
      );
    }

    return application;
  async update(
    id: string,
    payload: UpdateFinancialAidDto,
  ): Promise<FinancialAid> {
    const application = await this.findOne(id);
    if (payload.reason !== undefined) application.reason = payload.reason;
    if (payload.status !== undefined) application.status = payload.status;
    return application.save();
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.financialAidModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Financial aid application not found');
    }
    return { id, deleted: true };
  }
}
