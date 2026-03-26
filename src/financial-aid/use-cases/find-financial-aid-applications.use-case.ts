import { Injectable, NotFoundException } from '@nestjs/common';
import { FinancialAidApplication } from '../domain/financial-aid-application.entity';
import { FinancialAidApplicationRepository } from '../domain/financial-aid-application.repository';

/**
 * Query use-case: read-only access to financial-aid applications.
 *
 * Groups the three query shapes (all, by id, by student) in one place so the
 * controller does not scatter repository calls across multiple injections.
 */
@Injectable()
export class FindFinancialAidApplicationsUseCase {
  constructor(private readonly repository: FinancialAidApplicationRepository) {}

  findAll(): Promise<FinancialAidApplication[]> {
    return this.repository.findAll();
  }

  findByStudentId(studentId: string): Promise<FinancialAidApplication[]> {
    return this.repository.findByStudentId(studentId);
  }

  async findById(id: string): Promise<FinancialAidApplication> {
    const application = await this.repository.findById(id);
    if (!application) {
      throw new NotFoundException('Financial aid application not found');
    }
    return application;
  }
}
