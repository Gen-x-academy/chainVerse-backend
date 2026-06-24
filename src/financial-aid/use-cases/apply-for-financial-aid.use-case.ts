import { ConflictException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { FinancialAidApplication } from '../domain/financial-aid-application.entity';
import { FinancialAidApplicationRepository } from '../domain/financial-aid-application.repository';
import { CreateFinancialAidDto } from '../dto/create-financial-aid.dto';

/**
 * Orchestrates the creation of a new financial-aid application.
 * Validation of HTTP input lives in the DTO / controller layer; here we only
 * deal with domain construction and persistence.
 */
@Injectable()
export class ApplyForFinancialAidUseCase {
  constructor(private readonly repository: FinancialAidApplicationRepository) {}

  async execute(dto: CreateFinancialAidDto): Promise<FinancialAidApplication> {
    const existing = await this.repository.findByStudentAndCourse(
      dto.studentId,
      dto.courseId,
    );
    if (existing) {
      throw new ConflictException('Application already submitted');
    }

    const application = FinancialAidApplication.create({
      id: crypto.randomUUID(),
      studentId: dto.studentId,
      courseId: dto.courseId,
      reason: dto.reason,
    });

    return this.repository.save(application);
  }
}
