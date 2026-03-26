import { Injectable, NotFoundException } from '@nestjs/common';
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
