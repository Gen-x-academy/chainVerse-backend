import { Injectable, NotFoundException } from '@nestjs/common';
import { FinancialAidApplicationRepository } from '../domain/financial-aid-application.repository';

/**
 * Removes a financial-aid application after verifying it exists.
 */
@Injectable()
export class DeleteFinancialAidApplicationUseCase {
  constructor(private readonly repository: FinancialAidApplicationRepository) {}

  async execute(id: string): Promise<{ id: string; deleted: boolean }> {
    const application = await this.repository.findById(id);
    if (!application) {
      throw new NotFoundException('Financial aid application not found');
    }
    await this.repository.delete(id);
    return { id, deleted: true };
  }
}
